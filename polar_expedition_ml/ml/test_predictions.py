"""
test_predictions.py
----------------------
Runs three hand-crafted demo scenarios (LOW / MEDIUM / HIGH risk) through
predict_expedition_risk() and prints the results, formatted for a live
hackathon demo. These scenarios use deliberately extreme (but still
plausible) values so the three predictions are visibly different from
each other -- they're for demonstration, not for evaluating the model
(see evaluate_model.py for that).

Run:  python test_predictions.py
"""

import json

from predict import predict_expedition_risk

SCENARIOS = {
    "LOW-RISK expedition": {
        "expedition_duration_days": 10,
        "personnel_count": 8,
        "cargo_weight_kg": 400,
        "medical_supply_level": 95,
        "food_supply_level": 95,
        "fuel_supply_level": 90,
        "equipment_availability": 95,
        "temperature": -8,
        "wind_speed": 10,
        "visibility": 18,
        "distance_from_base_km": 20,
        "communication_status": 95,
        "vehicle_status": 95,
        "emergency_history": 0,
        "inventory_shortage_count": 0,
        "personnel_movement_deviation": 2,
        "previous_incidents": 0,
        "weather_risk_score": 8,
    },
    "MEDIUM-RISK expedition": {
        "expedition_duration_days": 40,
        "personnel_count": 15,
        "cargo_weight_kg": 900,
        "medical_supply_level": 45,
        "food_supply_level": 50,
        "fuel_supply_level": 50,
        "equipment_availability": 50,
        "temperature": -28,
        "wind_speed": 45,
        "visibility": 6,
        "distance_from_base_km": 350,
        "communication_status": 45,
        "vehicle_status": 55,
        "emergency_history": 0,
        "inventory_shortage_count": 3,
        "personnel_movement_deviation": 15,
        "previous_incidents": 2,
        "weather_risk_score": 54,
    },
    "HIGH-RISK expedition": {
        "expedition_duration_days": 90,
        "personnel_count": 25,
        "cargo_weight_kg": 2200,
        "medical_supply_level": 15,
        "food_supply_level": 20,
        "fuel_supply_level": 18,
        "equipment_availability": 25,
        "temperature": -48,
        "wind_speed": 85,
        "visibility": 1.5,
        "distance_from_base_km": 800,
        "communication_status": 15,
        "vehicle_status": 25,
        "emergency_history": 1,
        "inventory_shortage_count": 6,
        "personnel_movement_deviation": 35,
        "previous_incidents": 3,
        "weather_risk_score": 92,
    },
}


def main():
    for label, scenario in SCENARIOS.items():
        result = predict_expedition_risk(scenario)
        print("=" * 70)
        print(label)
        print("=" * 70)
        print(f"Risk level:        {result['risk_level']}")
        print(f"Risk probability:  {result['risk_probability']}")
        print(f"Contributing factors:")
        for f in result["contributing_factors"]:
            print(f"  - {f}")
        print(f"Resource shortage risk:   {result['resource_shortage_risk']['level']} "
              f"(score={result['resource_shortage_risk']['score']})")
        print(f"Personnel movement risk:  {result['personnel_movement_risk']['level']} "
              f"(deviation={result['personnel_movement_risk']['deviation_km_or_pct']})")
        print(f"Recommendation:    {result['recommendation']}")
        if result["warnings"]:
            print(f"Warnings: {result['warnings']}")
        print()


if __name__ == "__main__":
    main()
