"""
risk_mapping.py
------------------
Maps an Expedition's REAL database records to the exact 18-feature input
format required by the EXISTING, already-trained ML model in
polar_expedition_ml/ml/predict.py (predict_expedition_risk).

This module does NOT retrain, replace, or duplicate the ML model. It only
prepares its input. See the ML model's own required features in
polar_expedition_ml/ml/predict.py::FIELD_RANGES.

HONESTY ABOUT WHAT'S DERIVABLE (per project instructions: "Do not silently
invent missing ML inputs"):

Genuinely derivable from the current schema (computed below):
    expedition_duration_days   <- expeditions.start_date / expected_end_date
    personnel_count             <- count of personnel_assignments for this expedition
    cargo_weight_kg              <- sum of cargo.weight_kg for this expedition
    distance_from_base_km        <- haversine distance, origin -> destination location
    medical_supply_level          <- inventory ratio (MEDICAL category) at destination
    food_supply_level              <- inventory ratio (FOOD or RATIONS category) at destination
    fuel_supply_level               <- inventory ratio (FUEL category) at destination
    equipment_availability           <- resource availability ratio (non-vehicle,
                                          non-communication types) at destination
    vehicle_status                    <- resource availability ratio (VEHICLE type)
    communication_status                <- resource availability ratio (COMMUNICATION type)
    inventory_shortage_count             <- count of items below minimum_stock at destination
    previous_incidents / emergency_history <- emergencies recorded at destination location
                                                (approximate: emergencies aren't directly
                                                foreign-keyed to expeditions in the current
                                                schema, only to a location, so this is a
                                                location-based proxy, not a guaranteed link)

Fields not populated in the current row remain unset -- the existing
predict.py already handles this correctly: it imputes with the ML model's
training-set median and flags it in the response's "warnings" list, rather
than us inventing a number here):
    temperature, wind_speed, visibility, weather_risk_score
        -> WeatherPlace readings at the expedition destination when populated.
    personnel_movement_deviation
        -> personnel_movements has no numeric planned-vs-actual deviation
           field. A different, non-comparable metric (count of non-
           COMPLETED movements) IS computed below as extra operational
           context, but it is NOT fed into the ML model as if it were the
           same thing -- that would misrepresent what the model was
           trained on. It's returned separately as
           "movement_anomaly_count_context".

Every field this module could NOT derive is listed explicitly in the
returned "data_mapping" report, so the API response is transparent about
what's real database-derived data versus what the ML model had to fall
back on.
"""

from __future__ import annotations

import math
from datetime import datetime
from typing import Any, Dict, Optional

from models import (
    Expedition, Location, Cargo, PersonnelAssignment, InventoryItem,
    Resource, Emergency, PersonnelMovement, Personnel, WeatherPlace,
)

DERIVABLE_FIELDS = [
    "expedition_duration_days", "personnel_count", "cargo_weight_kg",
    "distance_from_base_km", "medical_supply_level", "food_supply_level",
    "fuel_supply_level", "equipment_availability", "vehicle_status",
    "communication_status", "inventory_shortage_count",
    "previous_incidents", "emergency_history",
]

NOT_DERIVABLE_FIELDS = {
    "personnel_movement_deviation": (
        "personnel_movements has no numeric planned-vs-actual deviation field. "
        "A different metric (count of non-COMPLETED movements) is available as "
        "context but is not the same measurement the model was trained on, so "
        "it is not substituted in."
    ),
}


def _haversine_km(lat1, lon1, lat2, lon2) -> Optional[float]:
    if None in (lat1, lon1, lat2, lon2):
        return None
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _inventory_ratio_score(db, location_id: int, category: str) -> Optional[float]:
    """0-100 proxy: how far above/below minimum stock the items in this
    category are, at this location. 100 = at least 2x minimum stock on
    average; 0 = at or below minimum stock on average. Returns None if
    there are no items in this category at this location (nothing to
    compute from -- left for the model to impute, not guessed at)."""
    items = (
        db.query(InventoryItem)
        .filter(InventoryItem.storage_location_id == location_id)
        .filter(InventoryItem.category == category)
        .all()
    )
    if not items:
        return None
    ratios = []
    for item in items:
        if item.minimum_stock and item.minimum_stock > 0:
            ratios.append(min(item.quantity / item.minimum_stock, 2.0) / 2.0)
        else:
            ratios.append(1.0 if (item.quantity or 0) > 0 else 0.0)
    return round(100 * sum(ratios) / len(ratios), 1)


def _inventory_ratio_score_for_categories(db, location_id: int, categories: tuple[str, ...]) -> Optional[float]:
    """Aggregate equivalent labels so legacy RATIONS rows count as food."""
    items = (
        db.query(InventoryItem)
        .filter(InventoryItem.storage_location_id == location_id)
        .filter(InventoryItem.category.in_(categories))
        .all()
    )
    if not items:
        return None
    ratios = []
    for item in items:
        minimum = item.minimum_stock or 0
        ratios.append(min(item.quantity / minimum, 2.0) / 2.0 if minimum > 0 else (1.0 if (item.quantity or 0) > 0 else 0.0))
    return round(100 * sum(ratios) / len(ratios), 1)


def _weather_risk_score(temperature, wind_speed, visibility):
    if None in (temperature, wind_speed, visibility):
        return None
    temp_component = min(max((abs(float(temperature)) - 5) / 45, 0), 1)
    wind_component = min(max(float(wind_speed) / 100, 0), 1)
    visibility_component = min(max(1 - (float(visibility) / 20), 0), 1)
    return round(100 * (0.4 * temp_component + 0.35 * wind_component + 0.25 * visibility_component), 1)


def _weather_for_destination(db, destination):
    if not destination:
        return None
    weather = db.query(WeatherPlace).filter(WeatherPlace.name == destination.name).first()
    if weather:
        return weather
    places = db.query(WeatherPlace).all()
    if not places or destination.latitude is None or destination.longitude is None:
        return None
    return min(places, key=lambda place: _haversine_km(destination.latitude, destination.longitude, place.latitude, place.longitude) or float("inf"))


def _resource_availability_score(db, location_id: int, resource_types: list, exclude: bool = False) -> Optional[float]:
    """0-100 proxy: % of matching resources at this location with
    status == 'AVAILABLE'. If exclude=True, resource_types are EXCLUDED
    instead of matched (used for the general 'equipment' bucket, which is
    everything that isn't specifically a vehicle or a communication
    resource)."""
    query = db.query(Resource).filter(Resource.location_id == location_id)
    if exclude:
        query = query.filter(~Resource.resource_type.in_(resource_types))
    else:
        query = query.filter(Resource.resource_type.in_(resource_types))
    resources = query.all()
    if not resources:
        return None
    available = sum(1 for r in resources if (r.status or "").upper() == "AVAILABLE")
    return round(100 * available / len(resources), 1)


def build_ml_input_for_expedition(db, expedition_id: int) -> Dict[str, Any]:
    """
    Returns:
        {
            "features": {...partial dict of ML input features, only the
                          ones we could genuinely derive...},
            "data_mapping": {
                "derived_from_database": {field: explanation, ...},
                "not_available_in_schema": {field: reason, ...},
            },
            "context": {
                "movement_anomaly_count_context": int,  # NOT fed to the model
            },
            "error": None or a string if the expedition wasn't found,
        }
    """
    expedition = db.query(Expedition).filter(Expedition.id == expedition_id).first()
    if expedition is None:
        return {"features": {}, "data_mapping": {}, "context": {}, "error": f"Expedition {expedition_id} not found."}

    features: Dict[str, Any] = {}
    derived_notes: Dict[str, str] = {}

    # -- expedition_duration_days -------------------------------------------
    if expedition.start_date and expedition.expected_end_date:
        days = (expedition.expected_end_date - expedition.start_date).days
        features["expedition_duration_days"] = max(days, 0)
        derived_notes["expedition_duration_days"] = (
            f"(expected_end_date - start_date) = {days} days"
        )

    # -- personnel_count ------------------------------------------------------
    personnel_count = (
        db.query(PersonnelAssignment)
        .filter(PersonnelAssignment.expedition_id == expedition_id)
        .count()
    )
    features["personnel_count"] = personnel_count
    derived_notes["personnel_count"] = (
        f"count of personnel_assignments rows for this expedition = {personnel_count}"
    )

    # -- cargo_weight_kg -------------------------------------------------------
    cargo_rows = db.query(Cargo).filter(Cargo.expedition_id == expedition_id).all()
    if cargo_rows:
        total_weight = sum((c.weight_kg or 0) for c in cargo_rows)
        features["cargo_weight_kg"] = round(total_weight, 1)
        derived_notes["cargo_weight_kg"] = f"sum of cargo.weight_kg for this expedition = {total_weight} kg"

    # -- distance_from_base_km --------------------------------------------------
    origin = db.query(Location).filter(Location.id == expedition.origin_location_id).first()
    destination = db.query(Location).filter(Location.id == expedition.destination_location_id).first()
    if origin and destination:
        dist = _haversine_km(origin.latitude, origin.longitude, destination.latitude, destination.longitude)
        if dist is not None:
            features["distance_from_base_km"] = round(dist, 1)
            derived_notes["distance_from_base_km"] = (
                f"haversine distance from '{origin.name}' to '{destination.name}' = {round(dist, 1)} km"
            )

    dest_id = expedition.destination_location_id

    # -- supply levels (inventory ratio proxies) --------------------------------
    if dest_id:
        for field, category in [
            ("medical_supply_level", "MEDICAL"),
            ("fuel_supply_level", "FUEL"),
        ]:
            score = _inventory_ratio_score(db, dest_id, category)
            if score is not None:
                features[field] = score
                derived_notes[field] = (
                    f"proxy from inventory_items (category={category}) at destination location: "
                    f"quantity vs. minimum_stock ratio, scaled 0-100 = {score}"
                )

        food_score = _inventory_ratio_score_for_categories(db, dest_id, ("FOOD", "RATIONS"))
        if food_score is not None:
            features["food_supply_level"] = food_score
            derived_notes["food_supply_level"] = (
                "proxy from inventory_items (category in FOOD/RATIONS) at destination: "
                f"quantity vs. minimum_stock ratio, scaled 0-100 = {food_score}"
            )

        weather = _weather_for_destination(db, destination)
        if weather:
            visibility_km = getattr(weather, "visibility_km", None)
            # Older refreshes stored Open-Meteo's raw meters value; accept and
            # normalize those rows so an existing database remains usable.
            if visibility_km is not None and visibility_km > 100:
                visibility_km = float(visibility_km) / 1000
            weather_values = {
                "temperature": weather.temperature_c,
                "wind_speed": weather.wind_speed_kmh,
                "visibility": visibility_km,
            }
            weather_values["weather_risk_score"] = getattr(weather, "weather_risk_score", None) or _weather_risk_score(
                weather_values["temperature"], weather_values["wind_speed"], weather_values["visibility"]
            )
            for field, value in weather_values.items():
                if value is not None:
                    features[field] = round(float(value), 2)
                    derived_notes[field] = f"WeatherPlace '{weather.name}' current reading = {features[field]}"

        # -- equipment / vehicle / communication (resource availability proxies) --
        equip_score = _resource_availability_score(db, dest_id, ["VEHICLE", "COMMUNICATION"], exclude=True)
        if equip_score is not None:
            features["equipment_availability"] = equip_score
            derived_notes["equipment_availability"] = (
                f"proxy from resources (excluding VEHICLE/COMMUNICATION types) at destination: "
                f"% with status=AVAILABLE = {equip_score}"
            )

        vehicle_score = _resource_availability_score(db, dest_id, ["VEHICLE"])
        if vehicle_score is not None:
            features["vehicle_status"] = vehicle_score
            derived_notes["vehicle_status"] = (
                f"proxy from resources (type=VEHICLE) at destination: % AVAILABLE = {vehicle_score}"
            )

        comms_score = _resource_availability_score(db, dest_id, ["COMMUNICATION"])
        if comms_score is not None:
            features["communication_status"] = comms_score
            derived_notes["communication_status"] = (
                f"proxy from resources (type=COMMUNICATION) at destination: % AVAILABLE = {comms_score}"
            )

        # -- inventory_shortage_count -----------------------------------------
        shortage_items = (
            db.query(InventoryItem)
            .filter(InventoryItem.storage_location_id == dest_id)
            .all()
        )
        shortage_count = sum(1 for i in shortage_items if (i.quantity or 0) < (i.minimum_stock or 0))
        features["inventory_shortage_count"] = shortage_count
        derived_notes["inventory_shortage_count"] = (
            f"count of inventory_items at destination where quantity < minimum_stock = {shortage_count}"
        )

        # -- previous_incidents / emergency_history (location-based proxy) -----
        emergencies_at_dest = (
            db.query(Emergency).filter(Emergency.location_id == dest_id).count()
        )
        features["previous_incidents"] = emergencies_at_dest
        features["emergency_history"] = 1 if emergencies_at_dest > 0 else 0
        derived_notes["previous_incidents"] = derived_notes["emergency_history"] = (
            f"proxy: count of emergencies recorded at destination location = {emergencies_at_dest} "
            "(emergencies are linked to a location, not directly to an expedition, in the current "
            "schema, so this is an approximate location-based match, not a guaranteed link)"
        )

    # -- movement anomaly context (NOT fed to the model, see module docstring) --
    personnel_ids = [
        row.personnel_id for row in
        db.query(PersonnelAssignment.personnel_id).filter(PersonnelAssignment.expedition_id == expedition_id).all()
    ]
    movement_anomaly_count = 0
    if personnel_ids:
        movement_anomaly_count = (
            db.query(PersonnelMovement)
            .filter(PersonnelMovement.personnel_id.in_(personnel_ids))
            .filter(PersonnelMovement.movement_status != "COMPLETED")
            .count()
        )

    not_available = {k: v for k, v in NOT_DERIVABLE_FIELDS.items()}

    return {
        "features": features,
        "data_mapping": {
            "derived_from_database": derived_notes,
            "not_available_in_schema": not_available,
        },
        "context": {
            "movement_anomaly_count_context": movement_anomaly_count,
        },
        "error": None,
    }
