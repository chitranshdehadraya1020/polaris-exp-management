"""
app.py
-------
Flask API wrapper around the ML prediction module. This file contains NO
model training and NO ML logic of its own -- it only validates the HTTP
request shape, calls predict.py's predict_expedition_risk(), and returns
JSON. predict.py loads the trained model once at import time, so the
model is NOT retrained or reloaded on every request.

Endpoints:
  GET  /api/ml/health          -> basic liveness + model metadata check
  POST /api/ml/predict-risk    -> main prediction endpoint

Run:  python app.py
      (after generate_dataset.py and train_model.py have been run once)
"""

from flask import Flask, request, jsonify

from predict import predict_expedition_risk, InputValidationError, _METADATA

app = Flask(__name__)


@app.get("/api/ml/health")
def health():
    return jsonify({
        "status": "ok",
        "model_loaded": True,
        "chosen_model": _METADATA.get("chosen_model"),
        "dataset_type": _METADATA.get("dataset_type"),
        "trained_at_utc": _METADATA.get("trained_at_utc"),
    })


@app.post("/api/ml/predict-risk")
def predict_risk():
    if not request.is_json:
        return jsonify({"error": "Request body must be JSON with Content-Type: application/json."}), 400

    input_data = request.get_json(silent=True)
    if not isinstance(input_data, dict):
        return jsonify({"error": "Request body must be a JSON object of expedition features."}), 400

    try:
        result = predict_expedition_risk(input_data)
    except InputValidationError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:  # noqa: BLE001 -- last-resort guard for an API endpoint
        return jsonify({"error": "Internal prediction error.", "detail": str(e)}), 500

    return jsonify(result), 200


if __name__ == "__main__":
    # debug=False -- this is a prototype API but still shouldn't run with
    # the interactive debugger/reloader exposed by default.
    app.run(host="0.0.0.0", port=5000, debug=False)
