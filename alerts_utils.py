"""
alerts_utils.py
------------------
Small helpers for creating Alert rows. Alerts are created at the moment a
relevant event happens (inventory drops below minimum stock, an emergency
is reported, a risk analysis comes back HIGH) rather than via a background
job -- simplest thing that works for a hackathon-scale app.
"""

from datetime import datetime

from models import Alert, InventoryItem


def create_alert(db, alert_type: str, severity: str, message: str, related_expedition_id=None) -> Alert:
    alert = Alert(
        alert_type=alert_type,
        severity=severity,
        message=message,
        related_expedition_id=related_expedition_id,
        is_read=False,
        created_at=datetime.utcnow(),
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert


def check_inventory_shortage_and_alert(db, item: InventoryItem):
    """Call after creating/updating an inventory item. Creates a shortage
    alert if the item is now below its minimum stock. Avoids duplicate
    spam by checking for an existing UNREAD shortage alert mentioning the
    same item code first."""
    if item.quantity is None or item.minimum_stock is None:
        return None
    if item.quantity >= item.minimum_stock:
        return None

    existing = (
        db.query(Alert)
        .filter(Alert.alert_type == "INVENTORY_SHORTAGE")
        .filter(Alert.is_read == False)  # noqa: E712
        .filter(Alert.message.like(f"%{item.item_code}%"))
        .first()
    )
    if existing:
        return existing

    severity = "HIGH" if item.quantity <= item.minimum_stock * 0.5 else "MEDIUM"
    message = (
        f"Inventory shortage: {item.name} ({item.item_code}) is at {item.quantity} "
        f"{item.unit or 'units'}, below minimum stock of {item.minimum_stock}."
    )
    return create_alert(db, "INVENTORY_SHORTAGE", severity, message)


def create_emergency_alert(db, emergency):
    severity_map = {"LOW": "MEDIUM", "MEDIUM": "HIGH", "HIGH": "CRITICAL", "CRITICAL": "CRITICAL"}
    severity = severity_map.get((emergency.severity or "").upper(), "HIGH")
    message = (
        f"Emergency reported: {emergency.emergency_type} ({emergency.emergency_code}), "
        f"severity {emergency.severity}. {emergency.description or ''}".strip()
    )
    return create_alert(db, "EMERGENCY", severity, message)


def create_risk_alert(db, expedition, risk_level: str, risk_probability: float):
    if risk_level not in ("HIGH",):
        return None  # only alert on HIGH to avoid noise; MEDIUM/LOW are informational only
    message = (
        f"ML-based operational risk estimate for expedition '{expedition.name}' "
        f"({expedition.expedition_code}) is HIGH (probability {risk_probability:.2f})."
    )
    return create_alert(db, "EXPEDITION_RISK", "HIGH", message, related_expedition_id=expedition.id)


def create_movement_anomaly_alert(db, personnel, movement):
    message = (
        f"Personnel movement anomaly: {personnel.name} ({personnel.personnel_code}) movement "
        f"status is '{movement.movement_status}' (expected COMPLETED)."
    )
    return create_alert(db, "MOVEMENT_ANOMALY", "MEDIUM", message)


def create_sos_message_alert(db, message):
    """Called when a message is sent with priority SOS, so command center
    sees it in the shared Alerts feed too, not only the Communications page."""
    text = (
        f"SOS message from {message.sender_name or 'field unit'} on channel "
        f"{message.channel}: {message.body}"
    )
    return create_alert(db, "EMERGENCY", "CRITICAL", text)
