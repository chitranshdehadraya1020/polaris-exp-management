"""
evaluate_model.py
--------------------
Standalone evaluation: loads the SAVED model and the SAVED held-out test
split (both written by train_model.py) and independently recomputes
metrics. This is deliberately separate from train_model.py so you can
re-verify performance at any time without retraining or re-randomizing
the split.

Run:  python evaluate_model.py   (after train_model.py)
"""

import json
import os

import joblib
import pandas as pd
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    confusion_matrix, classification_report,
)

BASE_DIR = os.path.dirname(__file__)
MODEL_PATH = os.path.join(BASE_DIR, "models", "risk_model.pkl")
TEST_SPLIT_PATH = os.path.join(BASE_DIR, "data", "expedition_data_test.csv")
METADATA_PATH = os.path.join(BASE_DIR, "models", "risk_model_metadata.json")

CLASS_ORDER = ["LOW", "MEDIUM", "HIGH"]


def main():
    if not os.path.exists(MODEL_PATH) or not os.path.exists(TEST_SPLIT_PATH):
        raise FileNotFoundError(
            "Model or held-out test split not found. Run train_model.py first."
        )

    with open(METADATA_PATH) as f:
        metadata = json.load(f)
    feature_columns = metadata["feature_columns"]

    pipe = joblib.load(MODEL_PATH)
    test_df = pd.read_csv(TEST_SPLIT_PATH)

    X_test = test_df[feature_columns]
    y_test = test_df["risk_level"]

    y_pred = pipe.predict(X_test)

    print(f"Chosen model (from training): {metadata['chosen_model']}")
    print(f"Dataset type: {metadata['dataset_type']} -- {metadata['dataset_disclaimer']}\n")

    print("Accuracy:        ", round(accuracy_score(y_test, y_pred), 4))
    print("Precision (macro):", round(precision_score(y_test, y_pred, average="macro", zero_division=0), 4))
    print("Recall (macro):   ", round(recall_score(y_test, y_pred, average="macro", zero_division=0), 4))
    print("F1 (macro):       ", round(f1_score(y_test, y_pred, average="macro", zero_division=0), 4))

    print("\nConfusion matrix (rows=actual, cols=predicted), order =", CLASS_ORDER)
    cm = confusion_matrix(y_test, y_pred, labels=CLASS_ORDER)
    print(pd.DataFrame(cm, index=[f"actual_{c}" for c in CLASS_ORDER],
                        columns=[f"pred_{c}" for c in CLASS_ORDER]))

    print("\nFull classification report:")
    print(classification_report(y_test, y_pred, labels=CLASS_ORDER, zero_division=0))

    print(
        "\nNote: this evaluation is on a SYNTHETIC demo test set. It confirms "
        "the saved pipeline reproduces its reported training-time metrics; it "
        "is not a real-world validation of operational performance."
    )


if __name__ == "__main__":
    main()
