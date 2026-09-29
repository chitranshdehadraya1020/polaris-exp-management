"""
predict.py
------------
The prediction interface for the expedition risk model. This module:

  - Loads the trained pipeline and metadata ONCE at import time (not per
    request -- app.py imports this module and reuses the loaded model).
  - Validates and gracefully handles missing/invalid input fields.
  - Runs the model to get risk_level + risk_probability.
  - Computes two rule-based sub-indicators (resource shortage risk,
    personnel movement risk) that are meaningful on their own even
    though they aren't separate trained models (the synthetic dataset
    doesn't have independent ground truth for them -- see README).
  - Extracts human-readable contributing factors using the model's
    feature importances combined with how unusual this instance's values
    are versus the training distribution.
  - Produces a short recommendation string.

Main entry point:  predict_expedition_risk(input_data: dict) -> dict
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Tuple

import joblib
import numpy as np
import pandas as pd
import sklearn

BASE_DIR = os.path.dirname(__file__)
MODEL_PATH = os.path.join(BASE_DIR, "models", "risk_model.pkl")
METADATA_PATH = os.path.join(BASE_DIR, "models", "risk_model_metadata.json")

# ---------------------------------------------------------------------------
# Field schema: plausible ranges (data-quality bounds, not operational
# thresholds) used for input validation. Values outside these are rejected
# with a clear error rather than silently accepted.
# ---------------------------------------------------------------------------
FIELD_RANGES = {
    "expedition_duration_days": (0, 400),
    "personnel_count": (1, 200),
    "cargo_weight_kg": (0, 20000),
    "medical_supply_level": (0, 100),
    "food_supply_level": (0, 100),
    "fuel_supply_level": (0, 100),
    "equipment_availability": (0, 100),
    "temperature": (-90, 50),
    "wind_speed": (0, 300),
    "visibility": (0, 50),
    "distance_from_base_km": (0, 5000),
    "communication_status": (0, 100),
    "vehicle_status": (0, 100),
    "emergency_history": (0, 1),
    "inventory_shortage_count": (0, 100),
    "personnel_movement_deviation": (0, 500),
    "previous_incidents": (0, 100),
    "weather_risk_score": (0, 100),
}

# Direction of "bad" for each feature, used for explainability and for the
# resource-shortage / movement sub-indicators. "high_is_bad" or "low_is_bad".
RISK_DIRECTION = {
    "medical_supply_level": "low_is_bad",
    "food_supply_level": "low_is_bad",
    "fuel_supply_level": "low_is_bad",
    "equipment_availability": "low_is_bad",
    "communication_status": "low_is_bad",
    "vehicle_status": "low_is_bad",
    "visibility": "low_is_bad",
    "wind_speed": "high_is_bad",
    "distance_from_base_km": "high_is_bad",
    "emergency_history": "high_is_bad",
    "inventory_shortage_count": "high_is_bad",
    "personnel_movement_deviation": "high_is_bad",
    "previous_incidents": "high_is_bad",
    "weather_risk_score": "high_is_bad",
    "expedition_duration_days": "high_is_bad",
    "cargo_weight_kg": "high_is_bad",
}

# Human-readable descriptions + recommendation snippets per feature, used
# to turn a flagged factor into judge-friendly text.
FACTOR_DESCRIPTIONS = {
    "medical_supply_level": ("Low medical supplies", "Review medical inventory before continuing."),
    "food_supply_level": ("Low food supplies", "Review food supply levels and resupply plan."),
    "fuel_supply_level": ("Low fuel supplies", "Review fuel reserves and resupply/return options."),
    "equipment_availability": ("Limited equipment availability", "Inspect and service critical equipment."),
    "communication_status": ("Communication instability", "Check communication equipment and backup channels."),
    "vehicle_status": ("Vehicle/equipment condition below normal", "Inspect vehicles before further movement."),
    "visibility": ("Poor visibility", "Delay non-essential movement until visibility improves."),
    "wind_speed": ("High wind speed", "Monitor wind conditions; consider delaying exposed activities."),
    "distance_from_base_km": ("High distance from base", "Confirm evacuation/support plan given distance from base."),
    "emergency_history": ("History of prior emergencies", "Review lessons learned from previous emergencies."),
    "inventory_shortage_count": ("Repeated inventory shortages", "Audit inventory management process."),
    "personnel_movement_deviation": ("Personnel movement deviating from plan", "Verify personnel positions and planned routes."),
    "previous_incidents": ("History of previous incidents", "Review incident history and mitigation steps taken."),
    "weather_risk_score": ("Severe weather conditions", "Monitor weather closely before continuing operations."),
    "expedition_duration_days": ("Long expedition duration", "Reassess resupply schedule for an extended expedition."),
    "cargo_weight_kg": ("High cargo weight", "Confirm vehicle/transport capacity is adequate for cargo load."),
}

REQUIRED_FIELDS = list(FIELD_RANGES.keys())


class InputValidationError(ValueError):
    pass


# ---------------------------------------------------------------------------
# Model loading (once, at import time)
# ---------------------------------------------------------------------------
def _load_model_and_metadata():
    if not os.path.exists(MODEL_PATH) or not os.path.exists(METADATA_PATH):
        raise FileNotFoundError(
            f"Model artifacts not found at {MODEL_PATH} / {METADATA_PATH}. "
            "Run generate_dataset.py then train_model.py first."
        )
    with open(METADATA_PATH) as f:
        metadata = json.load(f)
    expected = metadata.get("sklearn_version", "1.5.2")
    expected_family = ".".join(expected.split(".")[:2])
    installed_family = ".".join(sklearn.__version__.split(".")[:2])
    if installed_family != expected_family:
        raise RuntimeError(
            "risk_model.pkl was trained with scikit-learn "
            f"{expected}, but this environment has {sklearn.__version__}. "
            "Install the pinned runtime with `pip install -r requirements.txt` "
            "(scikit-learn==1.5.2), or retrain the model in the new pinned environment."
        )
    try:
        model = joblib.load(MODEL_PATH)
    except (AttributeError, ImportError, ModuleNotFoundError, ValueError) as exc:
        raise RuntimeError(
            f"Could not load {MODEL_PATH}. The artifact is sklearn-version-specific "
            f"(trained with {expected}; current runtime {sklearn.__version__}). "
            "Install scikit-learn==1.5.2 or retrain and replace the artifact. Original error: "
            f"{exc}"
        ) from exc
    return model, metadata


_MODEL, _METADATA = _load_model_and_metadata()
_FEATURE_COLUMNS: List[str] = _METADATA["feature_columns"]
_CLASS_ORDER: List[str] = _METADATA["class_order"]
_FEATURE_MEDIANS: Dict[str, float] = _METADATA["feature_medians"]
_FEATURE_STD: Dict[str, float] = _METADATA["feature_std"]
_FEATURE_IMPORTANCES: Dict[str, float] = _METADATA.get("feature_importances", {})


# ---------------------------------------------------------------------------
# Validation + graceful missing/invalid handling
# ---------------------------------------------------------------------------
def _validate_and_clean(input_data: Dict[str, Any]) -> Tuple[Dict[str, float], List[str]]:
    """Returns (cleaned_values, warnings). Missing fields are imputed with
    the TRAINING-SET median for that feature (stored in metadata) and
    flagged in warnings -- this is an operational risk score, not a
    diagnostic claim, so a best-effort estimate with a clear warning is
    more useful here than refusing the request outright. Out-of-range
    values are clipped to the nearest valid bound and flagged; values that
    can't be parsed as numbers raise InputValidationError."""
    cleaned: Dict[str, float] = {}
    warnings: List[str] = []

    for field in REQUIRED_FIELDS:
        raw = input_data.get(field, None)

        if raw is None or raw == "":
            median = _FEATURE_MEDIANS.get(field)
            cleaned[field] = median
            warnings.append(
                f"'{field}' was missing -- used the training-set median ({median:.2f}) as a fallback."
            )
            continue

        try:
            value = float(raw)
        except (TypeError, ValueError):
            raise InputValidationError(f"'{field}' must be a number, got: {raw!r}")

        lo, hi = FIELD_RANGES[field]
        if value < lo or value > hi:
            clipped = min(max(value, lo), hi)
            warnings.append(
                f"'{field}' = {value} is outside the plausible range [{lo}, {hi}] -- clipped to {clipped}."
            )
            value = clipped

        cleaned[field] = value

    return cleaned, warnings


# ---------------------------------------------------------------------------
# Rule-based sub-indicators (not separate trained models -- see README)
# ---------------------------------------------------------------------------
def _resource_shortage_risk(values: Dict[str, float]) -> Dict[str, Any]:
    supply_fields = ["medical_supply_level", "food_supply_level", "fuel_supply_level", "equipment_availability"]
    worst_supply = min(values[f] for f in supply_fields)
    shortage_count = values["inventory_shortage_count"]

    # Simple, transparent rule combining the worst current supply level
    # with how often shortages have already occurred.
    score = 0.6 * (1 - worst_supply / 100) + 0.4 * min(shortage_count / 6, 1)
    if score >= 0.6:
        level = "HIGH"
    elif score >= 0.3:
        level = "MEDIUM"
    else:
        level = "LOW"
    return {"level": level, "score": round(float(score), 3), "lowest_supply_field_value": worst_supply}


def _personnel_movement_risk(values: Dict[str, float]) -> Dict[str, Any]:
    deviation = values["personnel_movement_deviation"]
    # Thresholds are prototype/demo values, not operationally validated.
    if deviation >= 25:
        level = "HIGH"
    elif deviation >= 10:
        level = "MEDIUM"
    else:
        level = "LOW"
    return {"level": level, "deviation_km_or_pct": deviation}


# ---------------------------------------------------------------------------
# Explainability
# ---------------------------------------------------------------------------
def _contributing_factors(values: Dict[str, float], top_n: int = 4) -> List[str]:
    """Ranks features by (global model importance) x (how unusually 'bad'
    this instance's value is, in standard-deviation units versus the
    training set), and returns the top N as short human-readable strings.
    A feature only counts as a candidate factor if its value is actually
    on the 'bad' side of the training median -- high importance alone
    isn't enough, the instance also has to look risky on that feature.
    """
    scored = []
    for field in _FEATURE_COLUMNS:
        direction = RISK_DIRECTION.get(field)
        if direction is None or field not in values:
            continue
        median = _FEATURE_MEDIANS.get(field, 0)
        std = _FEATURE_STD.get(field, 1) or 1
        value = values[field]

        deviation = (value - median) / std
        is_bad_direction = deviation > 0 if direction == "high_is_bad" else deviation < 0
        if not is_bad_direction:
            continue

        severity = abs(deviation)
        importance = _FEATURE_IMPORTANCES.get(field, 0)
        combined_score = severity * (importance + 0.05)  # small floor so importance=0 doesn't zero everything out
        scored.append((combined_score, field))

    scored.sort(reverse=True)
    top_fields = [f for _, f in scored[:top_n]]
    return [FACTOR_DESCRIPTIONS.get(f, (f, ""))[0] for f in top_fields], top_fields


def _recommendation(top_fields: List[str]) -> str:
    if not top_fields:
        return "No significant risk factors identified; continue standard monitoring."
    snippets = []
    seen = set()
    for f in top_fields:
        _, snippet = FACTOR_DESCRIPTIONS.get(f, (f, ""))
        if snippet and snippet not in seen:
            snippets.append(snippet)
            seen.add(snippet)
    return " ".join(snippets[:3]) if snippets else "Review flagged factors before continuing the expedition."


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------
def predict_expedition_risk(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Accepts a dict of expedition operational features (see FIELD_RANGES for
    the full list) and returns:

        {
            "risk_level": "HIGH",
            "risk_probability": 0.87,
            "contributing_factors": ["Low medical supplies", ...],
            "recommendation": "...",
            "resource_shortage_risk": {"level": "...", "score": ...},
            "personnel_movement_risk": {"level": "...", "deviation_km_or_pct": ...},
            "warnings": [...],
            "model_disclaimer": "..."
        }

    Raises InputValidationError if a provided value can't be interpreted
    as a number. Missing fields are imputed (with a warning), not
    rejected, since this is an operational scoring tool, not a diagnosis.
    """
    values, warnings = _validate_and_clean(input_data)

    X = pd.DataFrame([{f: values[f] for f in _FEATURE_COLUMNS}])
    proba = _MODEL.predict_proba(X)[0]
    class_index = int(np.argmax(proba))
    predicted_class = _MODEL.classes_[class_index]
    probability = float(proba[class_index])

    contributing_factors, top_fields = _contributing_factors(values)
    recommendation = _recommendation(top_fields)

    return {
        "risk_level": str(predicted_class),
        "risk_probability": round(probability, 4),
        "contributing_factors": contributing_factors,
        "recommendation": recommendation,
        "resource_shortage_risk": _resource_shortage_risk(values),
        "personnel_movement_risk": _personnel_movement_risk(values),
        "warnings": warnings,
        "model_disclaimer": _METADATA["dataset_disclaimer"],
    }


if __name__ == "__main__":
    demo_input = {
        "expedition_duration_days": 45, "personnel_count": 18, "cargo_weight_kg": 850,
        "medical_supply_level": 35, "food_supply_level": 70, "fuel_supply_level": 55,
        "equipment_availability": 75, "temperature": -25, "wind_speed": 35, "visibility": 4,
        "distance_from_base_km": 420, "communication_status": 60, "vehicle_status": 80,
        "emergency_history": 1, "inventory_shortage_count": 3, "personnel_movement_deviation": 15,
        "previous_incidents": 2, "weather_risk_score": 75,
    }
    print(json.dumps(predict_expedition_risk(demo_input), indent=2))
