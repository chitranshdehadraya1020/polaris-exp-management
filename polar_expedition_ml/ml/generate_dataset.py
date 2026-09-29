"""
generate_dataset.py
---------------------
Generates a CLEARLY SYNTHETIC demo dataset of polar expedition operational
records, with a risk label (LOW / MEDIUM / HIGH) derived from a weighted
combination of realistic risk-driving relationships (bad weather, low
supplies, poor communication, long distance from base, prior incidents,
abnormal personnel movement, etc.) plus random noise -- NOT a random label
and NOT real expedition data.

Run:  python generate_dataset.py
Output: data/expedition_data.csv  (>= 1000 rows)

*** THIS IS SYNTHETIC DATA FOR PROTOTYPE DEMONSTRATION ONLY. ***
See README.md "Why synthetic data is being used" for details on what real
data would be needed to replace it.
"""

import numpy as np
import pandas as pd
import os

RANDOM_SEED = 42
N_RECORDS = 1500
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "data", "expedition_data.csv")

# Weights used to combine normalized (0-1, higher = worse) risk components
# into one continuous risk score before bucketing into LOW/MEDIUM/HIGH.
# These are hand-set to reflect plausible operational priorities for a
# prototype -- NOT derived from real incident statistics.
RISK_WEIGHTS = {
    "weather": 0.20,
    "supply": 0.15,
    "communication": 0.15,
    "distance": 0.10,
    "equipment": 0.10,
    "movement": 0.10,
    "vehicle": 0.05,
    "emergency_history": 0.05,
    "shortage": 0.05,
    "incidents": 0.05,
}
assert abs(sum(RISK_WEIGHTS.values()) - 1.0) < 1e-9


def generate_raw_features(rng: np.random.Generator, n: int) -> pd.DataFrame:
    df = pd.DataFrame({
        "expedition_duration_days": rng.integers(5, 121, size=n),
        "personnel_count": rng.integers(4, 41, size=n),
        "cargo_weight_kg": rng.uniform(150, 3000, size=n).round(1),
        "medical_supply_level": rng.uniform(0, 100, size=n).round(1),
        "food_supply_level": rng.uniform(0, 100, size=n).round(1),
        "fuel_supply_level": rng.uniform(0, 100, size=n).round(1),
        "equipment_availability": rng.uniform(0, 100, size=n).round(1),
        "temperature": rng.uniform(-55, 5, size=n).round(1),          # deg C
        "wind_speed": rng.uniform(0, 100, size=n).round(1),           # km/h
        "visibility": rng.uniform(0.1, 20, size=n).round(2),          # km
        "distance_from_base_km": rng.uniform(0, 1000, size=n).round(1),
        "communication_status": rng.uniform(0, 100, size=n).round(1), # quality score, higher=better
        "vehicle_status": rng.uniform(0, 100, size=n).round(1),       # health score, higher=better
        "emergency_history": rng.choice([0, 1], size=n, p=[0.75, 0.25]),
        "inventory_shortage_count": rng.poisson(1.2, size=n),
        "personnel_movement_deviation": rng.gamma(shape=2.0, scale=6.0, size=n).round(2),  # km off planned route
        "previous_incidents": rng.poisson(0.6, size=n),
    })
    return df


def compute_weather_risk_score(df: pd.DataFrame) -> np.ndarray:
    """weather_risk_score (0-100, higher = worse) derived from temperature,
    wind speed, and visibility -- reflects that these raw sensor readings
    combine into one composite operational weather-danger signal, which is
    also handed to the model as its own feature (as specified)."""
    temp_component = np.clip((-df["temperature"]) / 55, 0, 1)          # colder -> worse
    wind_component = np.clip(df["wind_speed"] / 100, 0, 1)
    visibility_component = np.clip(1 - (df["visibility"] / 20), 0, 1)  # lower vis -> worse
    score = 100 * (0.4 * temp_component + 0.35 * wind_component + 0.25 * visibility_component)
    return score.round(1)


def compute_risk_label(df: pd.DataFrame, rng: np.random.Generator):
    """Builds a continuous 0-1 risk score from weighted, normalized adverse
    components, adds noise, then buckets into LOW/MEDIUM/HIGH via tertile
    thresholds (so the demo dataset has a reasonably balanced, usable class
    distribution -- see README for why tertile bucketing was chosen over
    fixed cutoffs for this synthetic set)."""
    weather_c = df["weather_risk_score"] / 100
    supply_c = 1 - (df[["medical_supply_level", "food_supply_level", "fuel_supply_level"]].min(axis=1) / 100)
    communication_c = 1 - (df["communication_status"] / 100)
    distance_c = np.clip(df["distance_from_base_km"] / 1000, 0, 1)
    equipment_c = 1 - (df["equipment_availability"] / 100)
    movement_c = np.clip(df["personnel_movement_deviation"] / 40, 0, 1)
    vehicle_c = 1 - (df["vehicle_status"] / 100)
    emergency_c = df["emergency_history"].astype(float)
    shortage_c = np.clip(df["inventory_shortage_count"] / 6, 0, 1)
    incidents_c = np.clip(df["previous_incidents"] / 4, 0, 1)

    raw_score = (
        RISK_WEIGHTS["weather"] * weather_c
        + RISK_WEIGHTS["supply"] * supply_c
        + RISK_WEIGHTS["communication"] * communication_c
        + RISK_WEIGHTS["distance"] * distance_c
        + RISK_WEIGHTS["equipment"] * equipment_c
        + RISK_WEIGHTS["movement"] * movement_c
        + RISK_WEIGHTS["vehicle"] * vehicle_c
        + RISK_WEIGHTS["emergency_history"] * emergency_c
        + RISK_WEIGHTS["shortage"] * shortage_c
        + RISK_WEIGHTS["incidents"] * incidents_c
    )

    noise = rng.normal(0, 0.06, size=len(df))
    noisy_score = np.clip(raw_score + noise, 0, 1)

    # Tertile bucketing -> a reasonably balanced 3-class synthetic dataset,
    # good for a clear, demonstrable comparison of models. Documented as a
    # prototype choice, not a clinically/operationally validated cutoff.
    low_cut, high_cut = np.quantile(noisy_score, [1 / 3, 2 / 3])
    risk_level = np.where(noisy_score <= low_cut, "LOW",
                  np.where(noisy_score <= high_cut, "MEDIUM", "HIGH"))

    return noisy_score.round(4), risk_level, {"low_cut": round(float(low_cut), 4), "high_cut": round(float(high_cut), 4)}


def generate_dataset(n: int = N_RECORDS, seed: int = RANDOM_SEED):
    rng = np.random.default_rng(seed)
    df = generate_raw_features(rng, n)
    df["weather_risk_score"] = compute_weather_risk_score(df)
    risk_score, risk_level, cutoffs = compute_risk_label(df, rng)
    df["risk_score_continuous"] = risk_score  # kept for transparency/debugging, not a model input
    df["risk_level"] = risk_level
    return df, cutoffs


if __name__ == "__main__":
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    df, cutoffs = generate_dataset()
    df.to_csv(OUTPUT_PATH, index=False)
    print(f"Generated {len(df)} synthetic records -> {OUTPUT_PATH}")
    print(f"Tertile cutoffs used for LOW/MEDIUM/HIGH: {cutoffs}")
    print("Class distribution:")
    print(df["risk_level"].value_counts())
