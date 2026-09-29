from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    DateTime,
    ForeignKey,
    Text,
    Boolean
)

from database import Base


# =========================================================
# 1. LOCATIONS
# =========================================================

class Location(Base):
    __tablename__ = "locations"

    id = Column(Integer, primary_key=True, index=True)

    name = Column(String(150), nullable=False)

    location_type = Column(String(50))

    latitude = Column(Float)

    longitude = Column(Float)

    description = Column(Text)


# =========================================================
# 1A. WEATHER MONITORING PLACES
# =========================================================
class WeatherPlace(Base):
    __tablename__ = "weather_places"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    temperature_c = Column(Float)
    feels_like_c = Column(Float)
    humidity = Column(Float)
    wind_speed_kmh = Column(Float)
    wind_direction = Column(Float)
    visibility_km = Column(Float)
    weather_risk_score = Column(Float)
    precipitation_mm = Column(Float)
    weather_code = Column(Integer)
    conditions = Column(String(150))
    timezone = Column(String(80))
    last_updated = Column(DateTime)
    created_at = Column(DateTime, nullable=False)


# =========================================================
# 2. EXPEDITIONS
# =========================================================

class Expedition(Base):
    __tablename__ = "expeditions"

    id = Column(Integer, primary_key=True, index=True)

    expedition_code = Column(
        String(50),
        unique=True,
        nullable=False
    )

    name = Column(String(200), nullable=False)

    objective = Column(Text)

    start_date = Column(DateTime)

    expected_end_date = Column(DateTime)

    actual_end_date = Column(DateTime)

    budget = Column(Float)

    status = Column(
        String(50),
        default="PLANNED"
    )

    origin_location_id = Column(
        Integer,
        ForeignKey("locations.id")
    )

    destination_location_id = Column(
        Integer,
        ForeignKey("locations.id")
    )

    manager = Column(String(150))


# =========================================================
# 3. EXPEDITION LOCATIONS
# =========================================================

class ExpeditionLocation(Base):
    __tablename__ = "expedition_locations"

    id = Column(Integer, primary_key=True)

    expedition_id = Column(
        Integer,
        ForeignKey("expeditions.id"),
        nullable=False
    )

    location_id = Column(
        Integer,
        ForeignKey("locations.id"),
        nullable=False
    )

    sequence_number = Column(Integer)

    planned_arrival = Column(DateTime)

    actual_arrival = Column(DateTime)

    departure_time = Column(DateTime)

    status = Column(String(50))


# =========================================================
# 4. CARGO
# =========================================================

class Cargo(Base):
    __tablename__ = "cargo"

    id = Column(Integer, primary_key=True)

    cargo_code = Column(
        String(50),
        unique=True,
        nullable=False
    )

    description = Column(Text)

    category = Column(String(100))

    quantity = Column(Float)

    unit = Column(String(30))

    weight_kg = Column(Float)

    sender = Column(String(150))

    receiver = Column(String(150))

    expedition_id = Column(
        Integer,
        ForeignKey("expeditions.id")
    )

    current_location_id = Column(
        Integer,
        ForeignKey("locations.id")
    )

    shipment_status = Column(
        String(50),
        default="REGISTERED"
    )

    expected_arrival = Column(DateTime)

    actual_arrival = Column(DateTime)

    delay_reason = Column(Text)


# =========================================================
# 5. CARGO MOVEMENTS
# =========================================================

class CargoMovement(Base):
    __tablename__ = "cargo_movements"

    id = Column(Integer, primary_key=True)

    cargo_id = Column(
        Integer,
        ForeignKey("cargo.id"),
        nullable=False
    )

    from_location_id = Column(
        Integer,
        ForeignKey("locations.id")
    )

    to_location_id = Column(
        Integer,
        ForeignKey("locations.id")
    )

    movement_time = Column(DateTime)

    status = Column(String(50))

    remarks = Column(Text)


# =========================================================
# 6. SUPPLIERS
# =========================================================

class Supplier(Base):
    __tablename__ = "suppliers"

    id = Column(Integer, primary_key=True)

    supplier_code = Column(
        String(50),
        unique=True
    )

    name = Column(
        String(200),
        nullable=False
    )

    contact_person = Column(String(150))

    phone = Column(String(30))

    email = Column(String(150))

    address = Column(Text)

    status = Column(
        String(50),
        default="ACTIVE"
    )


# =========================================================
# 7. INVENTORY ITEMS
# =========================================================

class InventoryCategory(Base):
    __tablename__ = "inventory_categories"

    id = Column(Integer, primary_key=True)
    name = Column(String(100), unique=True, nullable=False)
    description = Column(Text)
    status = Column(String(30), default="ACTIVE")
    created_at = Column(DateTime)


# =========================================================
# 7B. INVENTORY ITEMS
# =========================================================

class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id = Column(Integer, primary_key=True)

    item_code = Column(
        String(50),
        unique=True,
        nullable=False
    )

    name = Column(
        String(200),
        nullable=False
    )

    category = Column(String(100))

    description = Column(Text)

    quantity = Column(
        Float,
        default=0
    )

    unit = Column(String(30))

    minimum_stock = Column(
        Float,
        default=0
    )

    quality_status = Column(String(50))

    storage_location_id = Column(
        Integer,
        ForeignKey("locations.id")
    )

    supplier_id = Column(
        Integer,
        ForeignKey("suppliers.id")
    )

    received_cargo_id = Column(
        Integer,
        ForeignKey("cargo.id")
    )

    status = Column(
        String(50),
        default="AVAILABLE"
    )


# =========================================================
# 8. INVENTORY TRANSACTIONS
# =========================================================

class InventoryTransaction(Base):
    __tablename__ = "inventory_transactions"

    id = Column(Integer, primary_key=True)

    item_id = Column(
        Integer,
        ForeignKey("inventory_items.id"),
        nullable=False
    )

    transaction_type = Column(String(30))

    quantity = Column(Float)

    transaction_time = Column(DateTime)

    location_id = Column(
        Integer,
        ForeignKey("locations.id")
    )

    cargo_id = Column(
        Integer,
        ForeignKey("cargo.id")
    )

    remarks = Column(Text)


# =========================================================
# 9. PERSONNEL
# =========================================================

class Personnel(Base):
    __tablename__ = "personnel"

    id = Column(Integer, primary_key=True)

    personnel_code = Column(
        String(50),
        unique=True,
        nullable=False
    )

    name = Column(
        String(150),
        nullable=False
    )

    role = Column(String(100))

    department = Column(String(100))

    contact = Column(String(50))

    current_location_id = Column(
        Integer,
        ForeignKey("locations.id")
    )

    availability_status = Column(
        String(50),
        default="AVAILABLE"
    )

    personnel_status = Column(
        String(50),
        default="ACTIVE"
    )


# =========================================================
# 10. PERSONNEL ASSIGNMENTS
# =========================================================

class PersonnelAssignment(Base):
    __tablename__ = "personnel_assignments"

    id = Column(Integer, primary_key=True)

    personnel_id = Column(
        Integer,
        ForeignKey("personnel.id"),
        nullable=False
    )

    expedition_id = Column(
        Integer,
        ForeignKey("expeditions.id"),
        nullable=False
    )

    role = Column(String(100))

    assignment_start = Column(DateTime)

    assignment_end = Column(DateTime)

    status = Column(String(50))


# =========================================================
# 10A. PERSONNEL TASKS
# =========================================================
class PersonnelTask(Base):
    __tablename__ = "personnel_tasks"

    id = Column(Integer, primary_key=True)
    personnel_id = Column(Integer, ForeignKey("personnel.id"), nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(Text)
    priority = Column(String(30), default="NORMAL")
    status = Column(String(30), default="ASSIGNED")
    assigned_at = Column(DateTime, nullable=False)
    due_date = Column(DateTime)
    completed_at = Column(DateTime)
    completion_notes = Column(Text)
    created_at = Column(DateTime, nullable=False)


# =========================================================
# 11. PERSONNEL MOVEMENTS
# =========================================================

class PersonnelMovement(Base):
    __tablename__ = "personnel_movements"

    id = Column(Integer, primary_key=True)

    personnel_id = Column(
        Integer,
        ForeignKey("personnel.id"),
        nullable=False
    )

    from_location_id = Column(
        Integer,
        ForeignKey("locations.id")
    )

    to_location_id = Column(
        Integer,
        ForeignKey("locations.id")
    )

    movement_time = Column(DateTime)

    movement_status = Column(String(50))

    remarks = Column(Text)


# =========================================================
# 12. RESOURCES
# =========================================================

class Resource(Base):
    __tablename__ = "resources"

    id = Column(Integer, primary_key=True)

    resource_code = Column(
        String(50),
        unique=True
    )

    name = Column(String(150))

    resource_type = Column(String(100))

    quantity = Column(
        Float,
        default=0
    )

    location_id = Column(
        Integer,
        ForeignKey("locations.id")
    )

    status = Column(
        String(50),
        default="AVAILABLE"
    )


# =========================================================
# 13. EMERGENCIES
# =========================================================

class Emergency(Base):
    __tablename__ = "emergencies"

    id = Column(Integer, primary_key=True)

    emergency_code = Column(
        String(50),
        unique=True,
        nullable=False
    )

    emergency_type = Column(String(100))

    severity = Column(String(30))

    location_id = Column(
        Integer,
        ForeignKey("locations.id")
    )

    reported_by = Column(
        Integer,
        ForeignKey("personnel.id")
    )

    reported_time = Column(DateTime)

    description = Column(Text)

    status = Column(
        String(50),
        default="REPORTED"
    )

    resolved_time = Column(DateTime)


# =========================================================
# 14. EMERGENCY RESOURCES
# =========================================================

class EmergencyResource(Base):
    __tablename__ = "emergency_resources"

    id = Column(Integer, primary_key=True)

    emergency_id = Column(
        Integer,
        ForeignKey("emergencies.id"),
        nullable=False
    )

    resource_id = Column(
        Integer,
        ForeignKey("resources.id"),
        nullable=False
    )

    quantity_used = Column(
        Float,
        default=1
    )

    assigned_time = Column(DateTime)

    released_time = Column(DateTime)

    status = Column(String(50))


# =========================================================
# 15. EMERGENCY UPDATES
# =========================================================

class EmergencyUpdate(Base):
    __tablename__ = "emergency_updates"

    id = Column(Integer, primary_key=True)

    emergency_id = Column(
        Integer,
        ForeignKey("emergencies.id"),
        nullable=False
    )

    updated_by = Column(
        Integer,
        ForeignKey("personnel.id")
    )

    update_time = Column(DateTime)

    status = Column(String(50))

    update_message = Column(Text)

# =========================================================
# 16. USERS
# =========================================================
# NEW TABLE -- added to support backend authentication.
# Existing tables/columns above are untouched.

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)

    name = Column(String(150), nullable=False)

    email = Column(
        String(150),
        unique=True,
        nullable=False
    )

    # Never store plaintext passwords -- this stores a Werkzeug-generated
    # hash (see auth_utils.py), not the password itself.
    password_hash = Column(String(255), nullable=False)

    role = Column(
        String(50),
        default="VIEWER"
    )

    created_at = Column(DateTime)


# =========================================================
# 17. ALERTS
# =========================================================
# NEW TABLE -- added to support the Alerts module (inventory shortages,
# movement anomalies, emergencies, expedition risk).

class EmployeeAccount(Base):
    __tablename__ = "employee_accounts"

    id = Column(Integer, primary_key=True)
    personnel_id = Column(Integer, ForeignKey("personnel.id"), unique=True, nullable=False)
    username = Column(String(100), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime)


# =========================================================
# 17B. ALERTS
# =========================================================

class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True)

    alert_type = Column(String(50))  # INVENTORY_SHORTAGE, MOVEMENT_ANOMALY, EMERGENCY, EXPEDITION_RISK

    severity = Column(String(30))    # LOW, MEDIUM, HIGH, CRITICAL

    message = Column(Text, nullable=False)

    related_expedition_id = Column(
        Integer,
        ForeignKey("expeditions.id"),
        nullable=True
    )

    is_read = Column(Boolean, default=False)

    created_at = Column(DateTime)


# =========================================================
# 18. LIVE TELEMETRY
# =========================================================
# Stores GPS/telemetry points received from an external tracker, mobile
# device, or simulated demo feed. This keeps real incoming GPS separate
# from the planned/current location fields used by the operational model.
class LiveTelemetry(Base):
    __tablename__ = "live_telemetry"

    id = Column(Integer, primary_key=True)
    entity_type = Column(String(30), nullable=False)  # CARGO / PERSONNEL / VEHICLE
    entity_id = Column(Integer, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    speed_kmh = Column(Float)
    heading = Column(Float)
    source = Column(String(50), default="GPS")
    recorded_at = Column(DateTime, nullable=False)


# =========================================================
# 19. MESSAGES (two-way communication)
# =========================================================
# Supports a real message thread between field personnel and command
# center. A message can stand alone on a channel (e.g. "OPS", "MEDICAL")
# or be attached to a specific emergency, which is what makes the SOS
# workflow two-way: the field can report and command can reply, and
# both sides read the same thread.
class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True)

    channel = Column(String(50), default="OPS")  # OPS, MEDICAL, LOGISTICS, EMERGENCY, SOS

    direction = Column(String(20), default="FIELD_TO_COMMAND")  # FIELD_TO_COMMAND / COMMAND_TO_FIELD

    sender_name = Column(String(150))

    sender_role = Column(String(100))

    sender_personnel_id = Column(
        Integer,
        ForeignKey("personnel.id"),
        nullable=True
    )

    recipient = Column(String(150))  # free text: station / call-sign / "ALL"

    recipient_personnel_id = Column(Integer, ForeignKey("personnel.id"), nullable=True)

    related_emergency_id = Column(
        Integer,
        ForeignKey("emergencies.id"),
        nullable=True
    )

    body = Column(Text, nullable=False)

    is_read = Column(Boolean, default=False)

    priority = Column(String(30), default="NORMAL")  # NORMAL, URGENT, SOS

    sent_at = Column(DateTime, nullable=False)


# =========================================================
# 20. EMPLOYEE INVENTORY REQUESTS
# =========================================================
class InventoryRequest(Base):
    __tablename__ = "inventory_requests"

    id = Column(Integer, primary_key=True)
    personnel_id = Column(Integer, ForeignKey("personnel.id"), nullable=False)
    item_name = Column(String(200), nullable=False)
    category = Column(String(100), nullable=False)
    quantity = Column(Float, default=1)
    unit = Column(String(30), default="units")
    needed_by = Column(DateTime)
    destination = Column(String(200))
    reason = Column(Text)
    status = Column(String(30), default="PENDING")
    command_response = Column(Text)
    created_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime)


# =========================================================
# 21. AI ASSISTANT CHAT HISTORY
# =========================================================
class AIChatMessage(Base):
    __tablename__ = "ai_chat_messages"
    id = Column(Integer, primary_key=True)
    session_id = Column(String(120), nullable=False, index=True)
    role = Column(String(20), nullable=False)
    text = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False)
    
