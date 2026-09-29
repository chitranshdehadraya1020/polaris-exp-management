"""Idempotent POLARIS demonstration data for local evaluation and demos."""
from datetime import datetime, timedelta
from database import Base, engine, SessionLocal
from models import Location, Expedition, Personnel, PersonnelAssignment, Cargo, InventoryItem, Resource, Emergency, Alert
from alerts_utils import check_inventory_shortage_and_alert, create_emergency_alert, create_alert

Base.metadata.create_all(bind=engine)
db = SessionLocal()
now = datetime.utcnow()

def first(model, **filters):
    return db.query(model).filter_by(**filters).first()

def add_if_missing(model, unique_field, rows):
    created = []
    for row in rows:
        if not first(model, **{unique_field: row[unique_field]}):
            obj = model(**row); db.add(obj); db.flush(); created.append(obj)
    return created

try:
    locations = add_if_missing(Location, 'name', [
        {'name': 'MAITRI Research Station', 'location_type': 'BASE', 'latitude': -70.769, 'longitude': 11.736, 'description': 'Indian Antarctic research station in Schirmacher Oasis.'},
        {'name': 'BHARATI Research Station', 'location_type': 'BASE', 'latitude': -69.413, 'longitude': 76.187, 'description': 'Indian Antarctic coastal research station.'},
        {'name': 'HIMADRI Research Station', 'location_type': 'BASE', 'latitude': 78.923, 'longitude': 11.923, 'description': 'Indian Arctic research station at Ny-Alesund, Svalbard.'},
        {'name': 'Field Camp Alpha', 'location_type': 'CAMP', 'latitude': -71.200, 'longitude': 15.400, 'description': 'Remote Antarctic field camp supporting ice-core surveys.'},
        {'name': 'Kongsberg Ice Corridor', 'location_type': 'ROUTE', 'latitude': 79.000, 'longitude': 12.000, 'description': 'Tracked Arctic logistics corridor.'},
    ])
    loc = {x.name: x for x in db.query(Location).all()}
    ma, bh, hi, camp, corridor = (loc['MAITRI Research Station'], loc['BHARATI Research Station'], loc['HIMADRI Research Station'], loc['Field Camp Alpha'], loc['Kongsberg Ice Corridor'])

    add_if_missing(Expedition, 'expedition_code', [
        {'expedition_code': 'EXP-ANT-026', 'name': 'Southern Ice Core Survey', 'objective': 'Recover deep ice cores and calibrate autonomous weather stations.', 'manager': 'Dr. Rajiv Sharma', 'status': 'ACTIVE', 'start_date': now-timedelta(days=12), 'expected_end_date': now+timedelta(days=28), 'origin_location_id': ma.id, 'destination_location_id': camp.id, 'budget': 250000},
        {'expedition_code': 'EXP-ARC-027', 'name': 'Arctic Atmosphere Transect', 'objective': 'Measure aerosol transport and boundary-layer chemistry across the sea-ice edge.', 'manager': 'Dr. Ananya Rao', 'status': 'PLANNED', 'start_date': now+timedelta(days=20), 'expected_end_date': now+timedelta(days=65), 'origin_location_id': hi.id, 'destination_location_id': corridor.id, 'budget': 180000},
        {'expedition_code': 'EXP-LOG-028', 'name': 'Winter Resupply Run', 'objective': 'Deliver fuel, medical kits, and food reserves before the next weather window.', 'manager': 'Capt. Meera Nair', 'status': 'ACTIVE', 'start_date': now-timedelta(days=4), 'expected_end_date': now+timedelta(days=11), 'origin_location_id': bh.id, 'destination_location_id': ma.id, 'budget': 125000},
        {'expedition_code': 'EXP-TECH-029', 'name': 'Beacon Network Maintenance', 'objective': 'Restore remote telemetry beacons and validate redundant satellite uplinks.', 'manager': 'Arjun Mehta', 'status': 'COMPLETED', 'start_date': now-timedelta(days=48), 'expected_end_date': now-timedelta(days=30), 'origin_location_id': hi.id, 'destination_location_id': hi.id, 'budget': 68000},
    ])
    exp = {x.expedition_code: x for x in db.query(Expedition).all()}

    add_if_missing(Personnel, 'personnel_code', [
        {'personnel_code': 'ICE-001', 'name': 'Dr. Rajiv Sharma', 'role': 'Expedition Leader', 'department': 'Field Science', 'contact': '+91-9000000001', 'current_location_id': camp.id, 'availability_status': 'DEPLOYED', 'personnel_status': 'DEPLOYED'},
        {'personnel_code': 'ICE-002', 'name': 'Dr. Ananya Rao', 'role': 'Atmospheric Scientist', 'department': 'Climate Research', 'contact': '+91-9000000002', 'current_location_id': hi.id, 'availability_status': 'AVAILABLE', 'personnel_status': 'ACTIVE'},
        {'personnel_code': 'OPS-014', 'name': 'Arjun Mehta', 'role': 'Field Systems Engineer', 'department': 'Operations', 'contact': '+91-9000000003', 'current_location_id': camp.id, 'availability_status': 'DEPLOYED', 'personnel_status': 'DEPLOYED'},
        {'personnel_code': 'MED-006', 'name': 'Dr. Sofia Lind', 'role': 'Remote Medical Officer', 'department': 'Medical Response', 'contact': '+47-40000006', 'current_location_id': ma.id, 'availability_status': 'ON_CALL', 'personnel_status': 'ACTIVE'},
        {'personnel_code': 'SAR-021', 'name': 'Lars Nygaard', 'role': 'Search and Rescue Lead', 'department': 'Emergency Response', 'contact': '+47-40000021', 'current_location_id': bh.id, 'availability_status': 'ON_CALL', 'personnel_status': 'ACTIVE'},
        {'personnel_code': 'LOG-009', 'name': 'Meera Nair', 'role': 'Logistics Coordinator', 'department': 'Supply Chain', 'contact': '+91-9000000009', 'current_location_id': bh.id, 'availability_status': 'DEPLOYED', 'personnel_status': 'DEPLOYED'},
    ])
    people = {x.personnel_code: x for x in db.query(Personnel).all()}
    assignments = [('ICE-001','EXP-ANT-026','Expedition Leader'), ('OPS-014','EXP-ANT-026','Field Systems Engineer'), ('LOG-009','EXP-LOG-028','Logistics Coordinator')]
    for code, exp_code, role in assignments:
        if not db.query(PersonnelAssignment).filter_by(personnel_id=people[code].id, expedition_id=exp[exp_code].id).first():
            db.add(PersonnelAssignment(personnel_id=people[code].id, expedition_id=exp[exp_code].id, role=role, assignment_start=now-timedelta(days=10), status='ACTIVE'))

    add_if_missing(Cargo, 'cargo_code', [
        {'cargo_code': 'CAR-MED-041', 'description': 'Trauma kits, oxygen bottles, hypothermia blankets', 'category': 'MEDICAL', 'quantity': 40, 'unit': 'boxes', 'weight_kg': 220, 'sender': 'POLAR Logistics', 'receiver': 'MAITRI Research Station', 'expedition_id': exp['EXP-LOG-028'].id, 'current_location_id': bh.id, 'shipment_status': 'IN_TRANSIT', 'expected_arrival': now+timedelta(days=5)},
        {'cargo_code': 'CAR-SCI-118', 'description': 'Ice-core drill heads and cryogenic sample cases', 'category': 'SCIENTIFIC', 'quantity': 12, 'unit': 'crates', 'weight_kg': 650, 'sender': 'National Polar Lab', 'receiver': 'Field Camp Alpha', 'expedition_id': exp['EXP-ANT-026'].id, 'current_location_id': camp.id, 'shipment_status': 'AT_STATION', 'expected_arrival': now-timedelta(days=1)},
        {'cargo_code': 'CAR-FUEL-203', 'description': 'Aviation fuel and low-temperature diesel drums', 'category': 'FUEL', 'quantity': 96, 'unit': 'drums', 'weight_kg': 19000, 'sender': 'Polar Logistics Hub', 'receiver': 'BHARATI Research Station', 'expedition_id': exp['EXP-LOG-028'].id, 'current_location_id': bh.id, 'shipment_status': 'IN_TRANSIT', 'expected_arrival': now+timedelta(days=3)},
        {'cargo_code': 'CAR-COM-077', 'description': 'Iridium satellite terminals and antenna spares', 'category': 'COMMUNICATIONS', 'quantity': 8, 'unit': 'cases', 'weight_kg': 180, 'sender': 'Kongsberg Field Services', 'receiver': 'HIMADRI Research Station', 'expedition_id': exp['EXP-TECH-029'].id, 'current_location_id': hi.id, 'shipment_status': 'DELIVERED', 'expected_arrival': now-timedelta(days=33), 'actual_arrival': now-timedelta(days=34)},
    ])

    add_if_missing(InventoryItem, 'item_code', [
        {'item_code': 'INV-FUEL-01', 'name': 'Low-temperature diesel', 'category': 'FUEL', 'quantity': 75, 'unit': 'drums', 'minimum_stock': 50, 'quality_status': 'GOOD', 'storage_location_id': bh.id, 'status': 'AVAILABLE'},
        {'item_code': 'INV-FUEL-02', 'name': 'Aviation fuel reserve', 'category': 'FUEL', 'quantity': 18, 'unit': 'drums', 'minimum_stock': 30, 'quality_status': 'GOOD', 'storage_location_id': ma.id, 'status': 'AVAILABLE'},
        {'item_code': 'INV-FOOD-01', 'name': 'High-calorie field rations', 'category': 'RATIONS', 'quantity': 32, 'unit': 'boxes', 'minimum_stock': 40, 'quality_status': 'GOOD', 'storage_location_id': camp.id, 'status': 'AVAILABLE'},
        {'item_code': 'INV-MED-01', 'name': 'Remote trauma and hypothermia kits', 'category': 'MEDICAL', 'quantity': 25, 'unit': 'kits', 'minimum_stock': 20, 'quality_status': 'GOOD', 'storage_location_id': ma.id, 'status': 'AVAILABLE'},
        {'item_code': 'INV-SCI-01', 'name': 'Sterile ice-core sample sleeves', 'category': 'SCIENTIFIC', 'quantity': 840, 'unit': 'sleeves', 'minimum_stock': 400, 'quality_status': 'GOOD', 'storage_location_id': camp.id, 'status': 'AVAILABLE'},
        {'item_code': 'INV-COM-01', 'name': 'HF radio battery packs', 'category': 'COMMUNICATIONS', 'quantity': 9, 'unit': 'packs', 'minimum_stock': 12, 'quality_status': 'GOOD', 'storage_location_id': hi.id, 'status': 'AVAILABLE'},
    ])
    for item in db.query(InventoryItem).all(): check_inventory_shortage_and_alert(db, item)

    add_if_missing(Resource, 'resource_code', [
        {'resource_code': 'AST-PV-017', 'name': 'Polar Vehicle PV-017', 'resource_type': 'VEHICLE', 'quantity': 1, 'location_id': camp.id, 'status': 'AVAILABLE'},
        {'resource_code': 'AST-DRILL-02', 'name': 'Electromechanical ice-core drill', 'resource_type': 'SCIENTIFIC', 'quantity': 2, 'location_id': camp.id, 'status': 'OPERATIONAL'},
        {'resource_code': 'AST-SAT-04', 'name': 'Iridium satellite communication unit', 'resource_type': 'COMMUNICATION', 'quantity': 1, 'location_id': ma.id, 'status': 'AVAILABLE'},
        {'resource_code': 'AST-SAR-12', 'name': 'Tracked rescue snowmobile', 'resource_type': 'SAR', 'quantity': 1, 'location_id': bh.id, 'status': 'AVAILABLE'},
        {'resource_code': 'AST-SNOW-12', 'name': 'Snowmobile SM-12', 'resource_type': 'VEHICLE', 'quantity': 1, 'location_id': ma.id, 'status': 'MAINTENANCE'},
    ])

    add_if_missing(Emergency, 'emergency_code', [
        {'emergency_code': 'INC-ANT-026', 'emergency_type': 'Blizzard / extreme weather', 'severity': 'HIGH', 'location_id': camp.id, 'reported_by': people['ICE-001'].id, 'reported_time': now-timedelta(hours=6), 'description': 'Visibility below 50 m and wind gusts above 45 kt. Field team recalled to Camp Alpha; radio contact remains stable.', 'status': 'RESPONDING'},
        {'emergency_code': 'INC-ARC-019', 'emergency_type': 'Communications failure', 'severity': 'MEDIUM', 'location_id': hi.id, 'reported_by': people['OPS-014'].id, 'reported_time': now-timedelta(days=2), 'description': 'Secondary HF antenna intermittently dropping packets. Redundant satellite link active while technicians inspect the mast.', 'status': 'RESOLVED', 'resolved_time': now-timedelta(days=1)},
    ])
    for emergency in db.query(Emergency).all():
        if not db.query(Alert).filter(Alert.alert_type == 'EMERGENCY', Alert.message.like(f"%{emergency.emergency_code}%")).first(): create_emergency_alert(db, emergency)
    if not db.query(Alert).filter(Alert.alert_type == 'OPERATIONS', Alert.message.like('Polar network telemetry nominal%')).first():
        create_alert(db, 'OPERATIONS', 'LOW', 'Polar network telemetry nominal across Bharati, Maitri, Himadri, and Camp Alpha.')
    db.commit()
    print('Seed complete:', db.query(Location).count(), 'locations,', db.query(Expedition).count(), 'expeditions,', db.query(Emergency).count(), 'emergencies,', db.query(Alert).count(), 'alerts.')
finally:
    db.close()
