# Expedition Risk & Resource Prediction System

The ML component of the polar research expedition platform. Given
operational data about an expedition (supplies, weather, distance,
communication, personnel movement, history), it predicts an overall risk
level, flags resource-shortage and personnel-movement sub-risks, explains
which factors are driving the prediction, and returns a short
recommendation — all as a single JSON response another team's backend can
consume directly.

**Scope note:** this module is the ML/prediction engine only. It does not
include the dashboard, mobile app, authentication, hardware/IoT firmware,
or the rest of the platform.

## What the ML module does

```
INPUT DATA (JSON)
      ↓
DATA VALIDATION & PREPROCESSING   (predict.py: range checks, missing-field
      ↓                            imputation, scaling via saved pipeline)
ML MODEL                          (risk_model.pkl: Logistic Regression /
      ↓                            Random Forest / Gradient Boosting,
      ↓                            whichever scored best — see below)
RISK PREDICTION                   (risk_level + risk_probability)
      ↓
CONTRIBUTING FACTORS              (feature importance × how unusual this
      ↓                            instance's values are)
RECOMMENDATION                    (rule-based text tied to top factors)
      ↓
FLASK API  (POST /api/ml/predict-risk)
      ↓
POLAR DASHBOARD (another team's frontend/backend)
```

## Why ML is being used

Expedition risk depends on many interacting operational factors (supply
levels, weather severity, distance from base, communication reliability,
personnel behavior, history of incidents) where the *combination* matters
more than any single value. A trained classifier can learn these
interactions from data and produce a calibrated-ish, consistent,
explainable risk score — instead of the team hand-maintaining a long list
of if/else rules that gets harder to keep consistent as more factors are
added.

## Features used

| Feature | Description |
|---|---|
| `expedition_duration_days` | Planned/actual duration of the expedition |
| `personnel_count` | Number of personnel on the expedition |
| `cargo_weight_kg` | Total cargo weight |
| `medical_supply_level` | 0–100, higher = more medical supplies available |
| `food_supply_level` | 0–100 |
| `fuel_supply_level` | 0–100 |
| `equipment_availability` | 0–100, share of required equipment available/functional |
| `temperature` | °C |
| `wind_speed` | km/h |
| `visibility` | km |
| `distance_from_base_km` | Distance from base camp/station |
| `communication_status` | 0–100 quality score, higher = better |
| `vehicle_status` | 0–100 health score, higher = better |
| `emergency_history` | 0/1, whether this expedition has had a prior emergency |
| `inventory_shortage_count` | Count of recorded inventory shortages |
| `personnel_movement_deviation` | How far personnel movement deviates from the planned route/schedule |
| `previous_incidents` | Count of previous incidents |
| `weather_risk_score` | 0–100 composite weather danger score (derived from temperature/wind/visibility in the synthetic generator; provided directly as its own feature at prediction time) |

## Dataset generation — and why synthetic data is being used

**No real polar expedition dataset was available for this project.**
Rather than pretend otherwise, `generate_dataset.py` builds a clearly
labeled synthetic dataset (1,500 records, saved to
`data/expedition_data.csv`) using **meaningful, hand-specified
relationships**, not random labels:

- Each record's risk is computed as a weighted combination of normalized
  "how bad is this factor" components (severe weather, low supplies, poor
  communication, long distance from base, equipment/vehicle condition,
  abnormal personnel movement, prior emergencies/incidents, repeated
  shortages) — see `RISK_WEIGHTS` in `generate_dataset.py` for the exact
  weights.
- Gaussian noise is added before bucketing into LOW/MEDIUM/HIGH via
  tertile cutoffs, so classes are reasonably balanced (500/500/500 in the
  generated set) and the task isn't trivially perfectly separable.
- The intermediate continuous score (`risk_score_continuous`) is saved in
  the CSV for transparency but is **excluded from the model's input
  features** (it would leak the label directly into the inputs).

**Every model artifact and every API response carries an explicit
`dataset_type: "SYNTHETIC_DEMO"` / disclaimer field** so nobody
downstream mistakes these results for real-world validated performance.

### How real expedition data could replace it

Once real historical expedition records exist (ideally with an
operator/expert-assigned or incident-outcome-derived risk label), replace
`data/expedition_data.csv` with a real dataset that has the same column
names as `FEATURE_COLUMNS` in `train_model.py` plus a `risk_level` column,
then just re-run `train_model.py`. No other code changes are required.
Recommended additions once real data exists: validate whether the
hand-set `RISK_WEIGHTS` used to build synthetic labels bear any
resemblance to real incident drivers (they likely won't exactly, and
that's fine — they were never claimed to be more than a plausible
prototype starting point), and consider a proper held-out validation
period rather than a single random split if data has a meaningful time
dimension.

## Model selection

Three models are trained and compared in `train_model.py`:
Logistic Regression, Random Forest, and Gradient Boosting — all from
scikit-learn (no deep learning; a 3-class tabular problem with ~1,500
rows doesn't call for it, and these are stayed with for their reliability
and interpretability on a hackathon timeline).

Selection uses **macro-F1** on a stratified 80/20 held-out test split
(not accuracy alone), because with a 3-level risk classifier it matters
that the model isn't quietly weak on one class (e.g. under-predicting
HIGH risk) — macro-F1 weights all three classes equally regardless of
how often they occur.

## Evaluation metrics (on the synthetic demo test set)

Run `python evaluate_model.py` to reproduce these against the saved model
and saved held-out test split at any time. As of the last training run:

- Logistic Regression (chosen): **accuracy ≈ 0.61, macro-F1 ≈ 0.61**
- Random Forest: accuracy ≈ 0.57, macro-F1 ≈ 0.56
- Gradient Boosting: accuracy ≈ 0.58, macro-F1 ≈ 0.58

For context: random guessing among 3 balanced classes would score ~0.33
accuracy, so all three models are learning real structure from the
synthetic relationships. **These numbers are moderate, not high — and
that's expected and left as-is rather than tuned away:** the synthetic
label's LOW/MEDIUM/HIGH cutoffs are close together (tertiles of a noisy
continuous score), which deliberately creates a nontrivial amount of
adjacent-class overlap. The confusion matrix confirms this shape: almost
all misclassifications are between *adjacent* risk levels (LOW↔MEDIUM,
MEDIUM↔HIGH); LOW↔HIGH confusion is close to zero. **These metrics
describe pipeline behavior on synthetic data only and are not a claim
about real-world accuracy.**

## How to run everything

**Note on scikit-learn version:** `requirements.txt` pins `scikit-learn==1.5.2`
exactly (not a loose `>=`). This matters because a trained sklearn
`Pipeline`/`ColumnTransformer` is saved via `pickle`/`joblib`, and sklearn's
internal object layout can change between minor versions in ways that
break loading a model trained on a different version (this was hit and
fixed during backend integration -- loading `risk_model.pkl` with
scikit-learn 1.8.0 failed with `AttributeError: Can't get attribute
'_RemainderColsList'`, even though the code itself hadn't changed). If you
retrain with a different scikit-learn version, update this pin to match,
or the saved model becomes unloadable elsewhere.

```bash
cd ml
pip install -r requirements.txt

# 1. Generate the synthetic demo dataset (>=1000 records)
python generate_dataset.py

# 2. Train and compare models, save the best pipeline + metadata
python train_model.py

# 3. Independently re-verify the saved model's metrics
python evaluate_model.py

# 4. Run the 3 demo scenarios (for a live hackathon demo)
python test_predictions.py

# 5. Start the Flask API
python app.py
```

## How predictions work (`predict.py`)

`predict_expedition_risk(input_data: dict) -> dict` is the single entry
point:

1. **Validates and cleans input.** Missing fields are imputed with the
   *training-set median* for that feature (stored in
   `models/risk_model_metadata.json`) and flagged in the response's
   `warnings` list — this is an operational scoring tool, not a
   diagnostic system, so a best-effort estimate with a clear warning is
   more useful than a hard refusal. Out-of-range values are clipped to
   the nearest valid bound and flagged. Non-numeric values raise
   `InputValidationError`.
2. **Runs the saved pipeline** (identical preprocessing at train and
   predict time, since both go through the same saved
   `sklearn.pipeline.Pipeline` object) to get `risk_level` and
   `risk_probability` (the model's confidence in the predicted class).
3. **Computes two rule-based sub-indicators** — `resource_shortage_risk`
   and `personnel_movement_risk` — from transparent formulas (not
   separate trained models: the synthetic dataset has no independent
   ground truth for these sub-risks, so a hand-specified, clearly
   documented rule is more honest than training a second model against a
   label that doesn't really exist independently — see the "shortage_c" /
   `_resource_shortage_risk` / `_personnel_movement_risk` code for the
   exact logic).
4. **Extracts contributing factors** by ranking features on
   `global model importance × how unusually "bad" this instance's value
   is (in standard deviations from the training median)`, keeping only
   features on the "bad" side of typical. This ties the explanation to
   both what the model generally cares about *and* what's actually
   unusual about this specific expedition.
5. **Builds a short recommendation** from fixed text snippets tied to the
   top contributing factors.

## Example API request/response

```
POST /api/ml/predict-risk
Content-Type: application/json

{
    "expedition_duration_days": 45,
    "personnel_count": 18,
    "cargo_weight_kg": 850,
    "medical_supply_level": 35,
    "food_supply_level": 70,
    "fuel_supply_level": 55,
    "equipment_availability": 75,
    "temperature": -25,
    "wind_speed": 35,
    "visibility": 4,
    "distance_from_base_km": 420,
    "communication_status": 60,
    "vehicle_status": 80,
    "emergency_history": 1,
    "inventory_shortage_count": 3,
    "personnel_movement_deviation": 15,
    "previous_incidents": 2,
    "weather_risk_score": 75
}
```

```json
{
    "risk_level": "MEDIUM",
    "risk_probability": 0.6052,
    "contributing_factors": [
        "History of prior emergencies",
        "Severe weather conditions",
        "History of previous incidents",
        "Repeated inventory shortages"
    ],
    "recommendation": "Review lessons learned from previous emergencies. Monitor weather closely before continuing operations. Review incident history and mitigation steps taken.",
    "resource_shortage_risk": {"level": "MEDIUM", "score": 0.59, "lowest_supply_field_value": 35.0},
    "personnel_movement_risk": {"level": "MEDIUM", "deviation_km_or_pct": 15.0},
    "warnings": [],
    "model_disclaimer": "Trained and evaluated on a synthetic, algorithmically generated demo dataset ..."
}
```

Note this real output differs from the illustrative "HIGH" example some
specs use for similar input — that's expected: this response comes from
an honestly trained model on the actual synthetic dataset, not from a
hard-coded example.

`GET /api/ml/health` returns a basic liveness check plus which model is
loaded and when it was trained — useful for the backend team to confirm
the API is up before wiring in the dashboard.

## How the backend developer should call the ML API

- Send a `POST` to `/api/ml/predict-risk` with a JSON body containing any
  subset of the 18 feature fields (missing ones are imputed automatically,
  see `warnings` in the response).
- Treat a `200` response as a successful prediction; surface `warnings` to
  the user/dashboard if you want transparency about imputed/clipped
  fields, but they don't indicate failure.
- Treat `400` as a client-side input problem (bad JSON, non-numeric
  field) — show the `error` message.
- Treat `500` as a server-side problem — log `detail` and retry/alert.
- The model is loaded once when the Flask process starts (`predict.py`
  loads it at import time) — no per-request retraining or reloading, so
  latency per request is just inference time (milliseconds).

## Example frontend JSON for the dashboard

The full response object above is dashboard-ready as-is. A minimal
dashboard card could use just:

```json
{
  "riskLevel": "MEDIUM",
  "riskPercent": 61,
  "topFactors": ["History of prior emergencies", "Severe weather conditions"],
  "recommendation": "Review lessons learned from previous emergencies. ...",
  "subRisks": {
    "resourceShortage": "MEDIUM",
    "personnelMovement": "MEDIUM"
  }
}
```

## Limitations

- **Synthetic data only.** No real expedition history was available; see
  "Why synthetic data is being used" above. Do not present evaluation
  metrics from this dataset as real-world validated performance.
- **Sub-indicators are rule-based, not model-based.** `resource_shortage_risk`
  and `personnel_movement_risk` are transparent formulas, not separately
  trained/validated models — clearly documented as such in code and here.
- **Risk category cutoffs and rule thresholds are prototype values**, not
  operationally validated ones. They're centralized (`RISK_WEIGHTS` in
  `generate_dataset.py`; thresholds in `predict.py`) so they're easy to
  revise once real operational feedback exists.
- **Moderate accuracy is expected and intentional**, reflecting genuine
  overlap between adjacent synthetic risk levels rather than an
  artificially "cleaned up" result — see "Evaluation metrics" above.
- This is a **decision-support prototype**, not a safety-certified system;
  it should not be the sole basis for real expedition go/no-go decisions
  without further validation.

## Project structure

```
ml/
├── data/
│   ├── expedition_data.csv         # synthetic training data (generated)
│   └── expedition_data_test.csv    # held-out test split (saved by train_model.py)
├── models/
│   ├── risk_model.pkl               # saved sklearn Pipeline (preprocessing + classifier)
│   └── risk_model_metadata.json     # feature list, chosen model, metrics, disclaimers
├── generate_dataset.py              # synthetic dataset generator
├── train_model.py                   # trains, compares, tunes-selects, saves model
├── evaluate_model.py                # standalone re-evaluation of the saved model
├── predict.py                       # predict_expedition_risk() + validation + explainability
├── app.py                           # Flask API (imports predict.py; no ML logic of its own)
├── test_predictions.py              # 3 demo scenarios for live presentation
├── requirements.txt
└── README.md
```
