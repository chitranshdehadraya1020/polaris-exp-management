"""
train_model.py
----------------
Trains and compares classification models for expedition risk level
(LOW / MEDIUM / HIGH), selects the best on held-out test performance, and
saves:
  - models/risk_model.pkl          (full sklearn Pipeline: preprocessing + classifier)
  - models/risk_model_metadata.json (feature list, chosen model, metrics, disclaimers)
  - data/expedition_data_test.csv   (held-out test split, saved so
                                      evaluate_model.py can independently
                                      re-check metrics without retraining
                                      or re-randomizing the split)

Run:  python train_model.py   (after generate_dataset.py)
"""

import json
import os
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score, confusion_matrix,
    classification_report,
)

RANDOM_SEED = 42
BASE_DIR = os.path.dirname(__file__)
DATA_PATH = os.path.join(BASE_DIR, "data", "expedition_data.csv")
TEST_SPLIT_PATH = os.path.join(BASE_DIR, "data", "expedition_data_test.csv")
MODEL_DIR = os.path.join(BASE_DIR, "models")
MODEL_PATH = os.path.join(MODEL_DIR, "risk_model.pkl")
METADATA_PATH = os.path.join(MODEL_DIR, "risk_model_metadata.json")

# Feature columns the model is trained on. Deliberately excludes
# 'risk_score_continuous' (the intermediate value used only to construct
# the synthetic label -- including it would leak the label into the
# features) and the label column itself.
FEATURE_COLUMNS = [
    "expedition_duration_days", "personnel_count", "cargo_weight_kg",
    "medical_supply_level", "food_supply_level", "fuel_supply_level",
    "equipment_availability", "temperature", "wind_speed", "visibility",
    "distance_from_base_km", "communication_status", "vehicle_status",
    "emergency_history", "inventory_shortage_count",
    "personnel_movement_deviation", "previous_incidents", "weather_risk_score",
]
TARGET_COLUMN = "risk_level"
CLASS_ORDER = ["LOW", "MEDIUM", "HIGH"]


def build_pipeline(model) -> Pipeline:
    # All features here are numeric, so preprocessing is impute + scale.
    # Kept as an explicit ColumnTransformer (rather than doing this ad hoc)
    # so it's trivial to add categorical columns later if real data
    # introduces them (e.g. expedition_type, region).
    preprocessor = ColumnTransformer(transformers=[
        ("num", Pipeline(steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]), FEATURE_COLUMNS),
    ])
    return Pipeline(steps=[("preprocessor", preprocessor), ("classifier", model)])


def candidate_models():
    return {
        "logistic_regression": LogisticRegression(
            max_iter=2000, random_state=RANDOM_SEED,
        ),
        "random_forest": RandomForestClassifier(
            n_estimators=300, max_depth=None, random_state=RANDOM_SEED, n_jobs=-1,
        ),
        "gradient_boosting": GradientBoostingClassifier(
            n_estimators=200, max_depth=3, learning_rate=0.08, random_state=RANDOM_SEED,
        ),
    }


def evaluate(pipe, X_test, y_test) -> dict:
    y_pred = pipe.predict(X_test)
    cm = confusion_matrix(y_test, y_pred, labels=CLASS_ORDER)
    return {
        "accuracy": round(float(accuracy_score(y_test, y_pred)), 4),
        "precision_macro": round(float(precision_score(y_test, y_pred, average="macro", zero_division=0)), 4),
        "recall_macro": round(float(recall_score(y_test, y_pred, average="macro", zero_division=0)), 4),
        "f1_macro": round(float(f1_score(y_test, y_pred, average="macro", zero_division=0)), 4),
        "confusion_matrix": {
            "labels": CLASS_ORDER,
            "matrix": cm.tolist(),
        },
        "classification_report": classification_report(
            y_test, y_pred, labels=CLASS_ORDER, output_dict=True, zero_division=0
        ),
    }


def run_training():
    if not os.path.exists(DATA_PATH):
        raise FileNotFoundError(
            f"{DATA_PATH} not found. Run generate_dataset.py first "
            "(or replace it with a real expedition dataset in the same format)."
        )

    df = pd.read_csv(DATA_PATH)
    missing_cols = [c for c in FEATURE_COLUMNS + [TARGET_COLUMN] if c not in df.columns]
    if missing_cols:
        raise ValueError(f"Dataset is missing required column(s): {missing_cols}")

    X = df[FEATURE_COLUMNS]
    y = df[TARGET_COLUMN]

    # Stratified split keeps the LOW/MEDIUM/HIGH balance consistent between
    # train and test -- important with only 3 classes and a modest dataset.
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=RANDOM_SEED, stratify=y
    )

    # Save the held-out test split to disk (features + label) so
    # evaluate_model.py can independently reproduce metrics against the
    # SAME test rows without needing to re-run this random split.
    test_df = X_test.copy()
    test_df[TARGET_COLUMN] = y_test.values
    os.makedirs(os.path.dirname(TEST_SPLIT_PATH), exist_ok=True)
    test_df.to_csv(TEST_SPLIT_PATH, index=False)

    results = {}
    fitted = {}
    for name, model in candidate_models().items():
        pipe = build_pipeline(model)
        pipe.fit(X_train, y_train)
        metrics = evaluate(pipe, X_test, y_test)
        results[name] = metrics
        fitted[name] = pipe
        print(f"[{name}] accuracy={metrics['accuracy']}  f1_macro={metrics['f1_macro']}  "
              f"recall_macro={metrics['recall_macro']}")

    # Model selection: macro-F1 is used as the primary criterion because
    # classes are balanced by construction here, so macro-F1 and accuracy
    # will usually agree -- but macro-F1 is the more robust choice in
    # general (won't hide a model that's weak on one risk class), which
    # matters most for a 3-level *risk* classifier where under-predicting
    # any one class (especially HIGH) is operationally costly.
    best_name = max(results, key=lambda n: results[n]["f1_macro"])
    best_pipe = fitted[best_name]

    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib.dump(best_pipe, MODEL_PATH)

    # Feature importance / coefficients, saved for use by predict.py's
    # explainability step (avoids recomputing model internals at request
    # time, and keeps predict.py from needing to know which model type
    # was chosen).
    classifier = best_pipe.named_steps["classifier"]
    if hasattr(classifier, "feature_importances_"):
        importances = dict(zip(FEATURE_COLUMNS, classifier.feature_importances_.tolist()))
    elif hasattr(classifier, "coef_"):
        # multiclass LogisticRegression: average absolute coefficient
        # magnitude across classes as an overall importance proxy.
        importances = dict(zip(FEATURE_COLUMNS, np.abs(classifier.coef_).mean(axis=0).tolist()))
    else:
        importances = {}

    # Per-feature training-set median, used by predict.py to (a) impute
    # missing input fields and (b) judge whether a given instance's value
    # is "worse than typical" for explainability.
    feature_medians = X_train.median(numeric_only=True).to_dict()
    feature_std = X_train.std(numeric_only=True).to_dict()

    metadata = {
        "trained_at_utc": datetime.now(timezone.utc).isoformat(),
        "sklearn_version": sklearn.__version__,
        "dataset_type": "SYNTHETIC_DEMO",
        "dataset_disclaimer": (
            "Trained and evaluated on a synthetic, algorithmically generated "
            "demo dataset (generate_dataset.py). NOT real expedition data. "
            "Metrics below demonstrate that the pipeline works correctly, not "
            "real-world operational performance. Do not use for real polar "
            "operations without validation against real historical data."
        ),
        "random_seed": RANDOM_SEED,
        "feature_columns": FEATURE_COLUMNS,
        "class_order": CLASS_ORDER,
        "chosen_model": best_name,
        "feature_importances": importances,
        "feature_medians": feature_medians,
        "feature_std": feature_std,
        "model_comparison": results,
    }
    with open(METADATA_PATH, "w") as f:
        json.dump(metadata, f, indent=2, default=str)

    return best_name, results, metadata


if __name__ == "__main__":
    best_name, results, metadata = run_training()
    print(f"\nChosen model: {best_name}")
    print(f"Saved pipeline -> {MODEL_PATH}")
    print(f"Saved metadata -> {METADATA_PATH}")
    print(f"Saved held-out test split -> {TEST_SPLIT_PATH}")
