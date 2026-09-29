from flask import Flask, jsonify, request, send_from_directory, session
from flask_cors import CORS
from datetime import datetime, timedelta
import math
import os

from database import Base, engine, SessionLocal
from models import *  # noqa: F401,F403
from serializers import model_to_dict
from live_services import fetch_weather, interpolate_position, fetch_research_updates
from alerts_utils import (
    check_inventory_shortage_and_alert,
    create_emergency_alert,
    create_movement_anomaly_alert,
    create_risk_alert,
    create_sos_message_alert,
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_BUILD = os.path.join(BASE_DIR, 'frontend', 'build')
app = Flask(__name__, static_folder=None)
app.config['SECRET_KEY'] = os.environ.get('POLAR_SECRET_KEY', 'polar-hackathon-change-me')
CORS(app, supports_credentials=True)

# Make sure a fresh checkout can start without a separate migration framework.
Base.metadata.create_all(bind=engine)


def ensure_legacy_schema():
    """Small compatibility migrations for existing SQLite databases."""
    from sqlalchemy import text, inspect
    with engine.begin() as conn:
        inspector = inspect(conn)
        tables = set(inspector.get_table_names())
        if "messages" in tables:
            cols = {c["name"] for c in inspector.get_columns("messages")}
            if "recipient_personnel_id" not in cols:
                conn.execute(text("ALTER TABLE messages ADD COLUMN recipient_personnel_id INTEGER"))
        if "weather_places" in tables:
            cols = {c["name"] for c in inspector.get_columns("weather_places")}
            if "visibility_km" not in cols:
                conn.execute(text("ALTER TABLE weather_places ADD COLUMN visibility_km FLOAT"))
            if "weather_risk_score" not in cols:
                conn.execute(text("ALTER TABLE weather_places ADD COLUMN weather_risk_score FLOAT"))


def seed_inventory_categories():
    """Create the category table and preserve categories already used by inventory."""
    db = SessionLocal()
    try:
        defaults = [
            ("FUEL", "Fuel and energy supplies"),
            ("RATIONS", "Food and ration supplies"),
            ("MEDICAL", "Medical and first-aid supplies"),
            ("SCIENTIFIC", "Scientific equipment and samples"),
            ("SURVIVAL", "Survival and field safety equipment"),
            ("SPARE PARTS", "Maintenance and spare parts"),
            ("COMMUNICATIONS", "Radio, satellite and communication equipment"),
            ("GENERAL", "General operational inventory"),
        ]
        existing = {str(x.name).strip().upper() for x in db.query(InventoryCategory).all() if x.name}
        for name, description in defaults:
            if name not in existing:
                db.add(InventoryCategory(name=name, description=description, status="ACTIVE", created_at=datetime.utcnow()))
                existing.add(name)
        db.flush()
        used = {str(x.category).upper() for x in db.query(InventoryItem).all() if x.category}
        existing = {str(x.name).strip().upper() for x in db.query(InventoryCategory).all() if x.name}
        for name in used:
            if name and name not in existing:
                db.add(InventoryCategory(name=name, description="Imported from existing inventory", status="ACTIVE", created_at=datetime.utcnow()))
                existing.add(name)
        db.commit()
    finally:
        db.close()


def ensure_demo_employee_accounts():
    """Ensure seeded personnel can log into the field portal in a local demo."""
    from werkzeug.security import generate_password_hash
    db = SessionLocal()
    try:
        password = os.environ.get('POLAR_EMPLOYEE_DEMO_PASSWORD', 'polar123')
        for person in db.query(Personnel).filter(Personnel.personnel_status != 'INACTIVE').all():
            username = str(person.personnel_code).strip().lower()
            if not username or db.query(EmployeeAccount).filter(EmployeeAccount.personnel_id == person.id).first():
                continue
            if db.query(EmployeeAccount).filter(EmployeeAccount.username == username).first():
                continue
            db.add(EmployeeAccount(personnel_id=person.id, username=username, password_hash=generate_password_hash(password), active=True, created_at=datetime.utcnow()))
        db.commit()
    finally:
        db.close()


ensure_legacy_schema()
seed_inventory_categories()
ensure_demo_employee_accounts()


def json_error(message, status=400):
    return jsonify({'success': False, 'error': message}), status


def parse_dt(value):
    if value in (None, ''):
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value).replace('Z', '+00:00')).replace(tzinfo=None)
    except ValueError:
        raise ValueError(f'Invalid date/time: {value}')


def get_json():
    return request.get_json(silent=True) or {}


def upsert(model, obj_id, data, fields):
    db = SessionLocal()
    try:
        obj = db.query(model).filter(model.id == obj_id).first()
        if not obj:
            return None, json_error(f'{model.__name__} not found.', 404)
        for field in fields:
            if field in data:
                value = data[field]
                if field in {'start_date','expected_end_date','actual_end_date','expected_arrival','actual_arrival','reported_time','resolved_time','movement_time','assignment_start','assignment_end','transaction_time','assigned_time','released_time','created_at','update_time'}:
                    value = parse_dt(value)
                setattr(obj, field, value)
        db.commit(); db.refresh(obj)
        return obj, None
    except ValueError as e:
        db.rollback(); return None, json_error(str(e), 400)
    except Exception as e:
        db.rollback(); return None, json_error(str(e), 500)
    finally:
        db.close()


@app.get('/api/health')
def health():
    return jsonify({'success': True, 'status': 'ok', 'service': 'POLAR Expedition Management'})


# ---------------- AUTH ----------------
@app.post('/api/auth/register')
def register():
    from werkzeug.security import generate_password_hash
    data = get_json(); name = str(data.get('name') or '').strip(); email = str(data.get('email') or '').strip().lower(); password = str(data.get('password') or '')
    if not name or not email or len(password) < 8: return json_error('Name, email and a password of at least 8 characters are required.')
    db = SessionLocal()
    try:
        if db.query(User).filter(User.email == email).first(): return json_error('An account with this email already exists.', 409)
        user = User(name=name, email=email, password_hash=generate_password_hash(password), role=(data.get('role') or 'VIEWER').upper(), created_at=datetime.utcnow())
        db.add(user); db.commit(); db.refresh(user); session['user_id'] = user.id
        out = model_to_dict(user); out.pop('password_hash', None); return jsonify({'success': True, 'user': out}), 201
    finally: db.close()

@app.post('/api/auth/login')
def login():
    from werkzeug.security import check_password_hash
    data = get_json(); email = str(data.get('email') or '').strip().lower(); password = str(data.get('password') or '')
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if not user or not check_password_hash(user.password_hash, password): return json_error('Invalid email or password.', 401)
        session['user_id'] = user.id; out = model_to_dict(user); out.pop('password_hash', None)
        return jsonify({'success': True, 'user': out})
    finally: db.close()

@app.post('/api/auth/logout')
def logout(): session.clear(); return jsonify({'success': True})

@app.get('/api/auth/me')
def me():
    uid = session.get('user_id')
    if not uid: return jsonify({'success': True, 'user': None})
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == uid).first(); out = model_to_dict(user) if user else None
        if out: out.pop('password_hash', None)
        return jsonify({'success': True, 'user': out})
    finally: db.close()


# ---------------- DASHBOARD ----------------
@app.get('/api/dashboard')
def dashboard():
    db = SessionLocal()
    try:
        exps = db.query(Expedition).order_by(Expedition.id.desc()).all()
        personnel = db.query(Personnel).all(); cargo = db.query(Cargo).all(); inventory = db.query(InventoryItem).all(); resources = db.query(Resource).all(); emergencies = db.query(Emergency).order_by(Emergency.id.desc()).all(); alerts = db.query(Alert).order_by(Alert.id.desc()).all(); locations = db.query(Location).all()
        active_exp = [e for e in exps if (e.status or '').upper() == 'ACTIVE']
        active_em = [e for e in emergencies if (e.status or '').upper() not in {'RESOLVED','CLOSED'}]
        critical = [e for e in active_em if (e.severity or '').upper() == 'CRITICAL']
        shortage = [i for i in inventory if i.quantity is not None and i.minimum_stock is not None and i.quantity < i.minimum_stock]
        unread = [a for a in alerts if not a.is_read]
        return jsonify({'success': True,
            'summary': {'total_expeditions': len(exps), 'active_expeditions': len(active_exp), 'planning_expeditions': sum((e.status or '').upper() == 'PLANNED' for e in exps), 'personnel': len(personnel), 'deployed_personnel': sum((p.personnel_status or '').upper() == 'DEPLOYED' for p in personnel), 'cargo': len(cargo), 'inventory_items': len(inventory), 'assets': len(resources), 'operational_assets': sum((r.status or '').upper() in {'AVAILABLE','OPERATIONAL'} for r in resources), 'active_alerts': len(unread), 'critical_alerts': len(critical), 'inventory_shortages': len(shortage)},
            'inventory': [inventory_view(i) for i in inventory],
            'recent_alerts': [model_to_dict(a) for a in alerts[:8]],
            'active_expeditions': [expedition_view(db,e) for e in exps if (e.status or '').upper() in {'ACTIVE','PLANNED'}],
            'tracking': [model_to_dict(l) for l in locations],
            'recent_emergencies': [model_to_dict(e) for e in emergencies[:5]],
        })
    finally: db.close()


def inventory_view(i):
    minimum = float(i.minimum_stock or 0); qty = float(i.quantity or 0)
    pct = 100 if minimum <= 0 and qty > 0 else (0 if minimum <= 0 else min(100, round(qty/(minimum*2)*100)))
    state = 'CRITICAL' if minimum > 0 and qty <= minimum*0.5 else ('LOW' if minimum > 0 and qty < minimum else 'NORMAL')
    d = model_to_dict(i); d.update({'item_name': i.name, 'threshold': minimum, 'station': getattr(i, 'storage_location_name', None), 'percentage': pct, 'stock_state': state}); return d


def expedition_view(db, e):
    d = model_to_dict(e)
    locations = {x.id: x.name for x in db.query(Location).all()}
    d['origin_location_name'] = locations.get(e.origin_location_id)
    d['destination_location_name'] = locations.get(e.destination_location_id)
    d['personnel_count'] = db.query(PersonnelAssignment).filter(PersonnelAssignment.expedition_id == e.id).count()
    d['cargo_count'] = db.query(Cargo).filter(Cargo.expedition_id == e.id).count()
    return d


# ---------------- GENERIC CRUD HELPERS ----------------
def list_model(model, order='id'):
    db=SessionLocal()
    try: return jsonify([model_to_dict(x) for x in db.query(model).order_by(getattr(model, order).desc()).all()])
    finally: db.close()


def delete_model(model, obj_id):
    db=SessionLocal()
    try:
        obj=db.query(model).filter(model.id==obj_id).first()
        if not obj: return json_error(f'{model.__name__} not found.',404)
        db.delete(obj); db.commit(); return jsonify({'success':True,'message':f'{model.__name__} deleted.'})
    except Exception as e: db.rollback(); return json_error(str(e),400)
    finally: db.close()


# ---------------- EXPEDITIONS ----------------
@app.get('/api/expeditions')
def expeditions():
    db=SessionLocal()
    try: return jsonify([expedition_view(db,e) for e in db.query(Expedition).order_by(Expedition.id.desc()).all()])
    finally: db.close()

@app.post('/api/expeditions')
def create_expedition():
    data=get_json(); code=str(data.get('expedition_code') or '').strip(); name=str(data.get('name') or '').strip()
    if not code or not name: return json_error('expedition_code and name are required.')
    db=SessionLocal()
    try:
        if db.query(Expedition).filter(Expedition.expedition_code==code).first(): return json_error('expedition_code already exists.',409)
        origin_id=data.get('origin_location_id'); destination_id=data.get('destination_location_id')
        if not origin_id and data.get('origin'):
            origin=db.query(Location).filter(Location.name.ilike(f"%{str(data['origin']).strip()}%")).first(); origin_id=origin.id if origin else None
        if not destination_id and data.get('destination'):
            destination=db.query(Location).filter(Location.name.ilike(f"%{str(data['destination']).strip()}%")).first(); destination_id=destination.id if destination else None
        e=Expedition(expedition_code=code,name=name,objective=data.get('objective'),manager=data.get('manager'),budget=data.get('budget'),status=(data.get('status') or 'PLANNED').upper(),origin_location_id=origin_id,destination_location_id=destination_id,start_date=parse_dt(data.get('start_date')),expected_end_date=parse_dt(data.get('expected_end_date')),actual_end_date=parse_dt(data.get('actual_end_date')))
        db.add(e); db.commit(); db.refresh(e); return jsonify({'success':True,'data':model_to_dict(e)}),201
    except ValueError as e: db.rollback(); return json_error(str(e))
    except Exception as e: db.rollback(); return json_error(str(e),500)
    finally: db.close()

@app.get('/api/expeditions/<int:obj_id>')
def get_expedition(obj_id):
    db=SessionLocal()
    try:
        e=db.query(Expedition).filter(Expedition.id==obj_id).first()
        if not e: return json_error('Expedition not found.',404)
        return jsonify(expedition_view(db,e))
    finally: db.close()

@app.put('/api/expeditions/<int:obj_id>')
def update_expedition(obj_id):
    return update_entity(Expedition,obj_id,get_json(),['name','objective','budget','status','manager','origin_location_id','destination_location_id','start_date','expected_end_date','actual_end_date'])
@app.delete('/api/expeditions/<int:obj_id>')
def del_expedition(obj_id): return delete_model(Expedition,obj_id)


# ---------------- CARGO ----------------
@app.get('/api/cargo')
def cargo_list():
    db=SessionLocal()
    try:
        locations = {x.id: x.name for x in db.query(Location).all()}
        rows=[]
        for c in db.query(Cargo).order_by(Cargo.id.desc()).all():
            d=model_to_dict(c); d['current_location_name']=locations.get(c.current_location_id); rows.append(d)
        return jsonify(rows)
    finally: db.close()
@app.post('/api/cargo')
def cargo_create():
    data=get_json();
    if not data.get('cargo_code') or not data.get('description'): return json_error('cargo_code and description are required.')
    db=SessionLocal()
    try:
        if db.query(Cargo).filter(Cargo.cargo_code==data['cargo_code']).first(): return json_error('cargo_code already exists.',409)
        c=Cargo(cargo_code=data['cargo_code'],description=data.get('description'),category=data.get('category'),quantity=data.get('quantity',0),unit=data.get('unit'),weight_kg=data.get('weight_kg',0),sender=data.get('sender'),receiver=data.get('receiver'),expedition_id=data.get('expedition_id'),current_location_id=data.get('current_location_id'),shipment_status=(data.get('shipment_status') or 'REGISTERED').upper(),expected_arrival=parse_dt(data.get('expected_arrival')),actual_arrival=parse_dt(data.get('actual_arrival')),delay_reason=data.get('delay_reason'))
        db.add(c); db.commit(); db.refresh(c); return jsonify({'success':True,'data':model_to_dict(c)}),201
    except ValueError as e: db.rollback(); return json_error(str(e))
    finally: db.close()
@app.put('/api/cargo/<int:obj_id>')
def cargo_update(obj_id): return update_entity(Cargo,obj_id,get_json(),['description','category','quantity','unit','weight_kg','sender','receiver','expedition_id','current_location_id','shipment_status','expected_arrival','actual_arrival','delay_reason'])
@app.delete('/api/cargo/<int:obj_id>')
def cargo_delete(obj_id): return delete_model(Cargo,obj_id)


# ---------------- INVENTORY ----------------
@app.get('/api/inventory')
def inventory_list():
    db=SessionLocal()
    try:
        locations = {x.id: x.name for x in db.query(Location).all()}
        rows=[]
        for i in db.query(InventoryItem).order_by(InventoryItem.id.desc()).all():
            d=inventory_view(i); d['storage_location_name']=locations.get(i.storage_location_id); d['station']=locations.get(i.storage_location_id); rows.append(d)
        return jsonify(rows)
    finally: db.close()
@app.post('/api/inventory')
def inventory_create():
    data=get_json();
    item_name=str(data.get('name') or data.get('item_name') or '').strip()
    item_code=str(data.get('item_code') or f"INV-{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')[-12:]}").strip().upper()
    if not item_name: return json_error('item_name is required.')
    db=SessionLocal()
    try:
        if db.query(InventoryItem).filter(InventoryItem.item_code==item_code).first(): return json_error('item_code already exists.',409)
        location_id=data.get('storage_location_id')
        if not location_id and data.get('storage_location_name'):
            location=db.query(Location).filter(Location.name.ilike(str(data['storage_location_name']).strip())).first()
            location_id=location.id if location else None
        i=InventoryItem(item_code=item_code,name=item_name,category=(data.get('category') or '').upper(),description=data.get('description'),quantity=float(data.get('quantity',0)),unit=data.get('unit'),minimum_stock=float(data.get('minimum_stock',data.get('threshold',0))),quality_status=data.get('quality_status') or 'GOOD',storage_location_id=location_id,supplier_id=data.get('supplier_id'),received_cargo_id=data.get('received_cargo_id'),status=(data.get('status') or 'AVAILABLE').upper())
        db.add(i); db.commit(); db.refresh(i); check_inventory_shortage_and_alert(db,i); return jsonify({'success':True,'data':inventory_view(i)}),201
    except Exception as e: db.rollback(); return json_error(str(e),400)
    finally: db.close()
@app.put('/api/inventory/<int:obj_id>')
def inventory_update(obj_id):
    response = update_entity(InventoryItem,obj_id,get_json(),['name','category','description','quantity','unit','minimum_stock','quality_status','storage_location_id','supplier_id','received_cargo_id','status'])
    return response
@app.delete('/api/inventory/<int:obj_id>')
def inventory_delete(obj_id): return delete_model(InventoryItem,obj_id)
@app.get('/api/inventory/shortages')
def shortages():
    db=SessionLocal()
    try: return jsonify([inventory_view(i) for i in db.query(InventoryItem).all() if i.quantity is not None and i.minimum_stock is not None and i.quantity<i.minimum_stock])
    finally: db.close()
@app.get('/api/inventory/categories')
def inventory_categories():
    db=SessionLocal()
    try:
        categories = db.query(InventoryCategory).filter(InventoryCategory.status == 'ACTIVE').order_by(InventoryCategory.name.asc()).all()
        stats = []
        for c in categories:
            items = db.query(InventoryItem).filter(InventoryItem.category == c.name).all()
            stats.append({'id': c.id, 'category': c.name, 'description': c.description, 'status': c.status, 'item_count': len(items), 'total_units': sum(float(i.quantity or 0) for i in items), 'low_stock_count': sum(1 for i in items if i.minimum_stock is not None and i.quantity is not None and i.quantity < i.minimum_stock)})
        return jsonify({'success':True,'categories':stats})
    finally: db.close()

@app.get('/api/inventory/station-summary')
def inventory_station_summary():
    db=SessionLocal()
    try:
        rows=[]
        for location in db.query(Location).order_by(Location.name.asc()).all():
            items=db.query(InventoryItem).filter(InventoryItem.storage_location_id==location.id).all()
            people=db.query(Personnel).filter(Personnel.current_location_id==location.id).order_by(Personnel.name.asc()).all()
            rows.append({'id':location.id,'station':location.name,'inventory_units':sum(float(i.quantity or 0) for i in items),'sku_count':len(items),'low_stock_count':sum(1 for i in items if i.minimum_stock is not None and i.quantity is not None and i.quantity < i.minimum_stock),'personnel':[{'id':p.id,'name':p.name,'personnel_code':p.personnel_code,'role':p.role} for p in people]})
        return jsonify({'success':True,'data':rows})
    finally: db.close()

@app.post('/api/inventory/categories')
def inventory_category_create():
    data=get_json(); name=str(data.get('name') or '').strip().upper()
    if not name: return json_error('Category name is required.')
    db=SessionLocal()
    try:
        if db.query(InventoryCategory).filter(InventoryCategory.name.ilike(name)).first(): return json_error('Category already exists.',409)
        c=InventoryCategory(name=name,description=data.get('description'),status=(data.get('status') or 'ACTIVE').upper(),created_at=datetime.utcnow())
        db.add(c); db.commit(); db.refresh(c); return jsonify({'success':True,'data':model_to_dict(c)}),201
    except Exception as ex: db.rollback(); return json_error(str(ex),400)
    finally: db.close()

@app.put('/api/inventory/categories/<int:category_id>')
def inventory_category_update(category_id):
    return update_entity(InventoryCategory,category_id,get_json(),['name','description','status'])

@app.delete('/api/inventory/categories/<int:category_id>')
def inventory_category_delete(category_id):
    db=SessionLocal()
    try:
        c=db.query(InventoryCategory).filter(InventoryCategory.id==category_id).first()
        if not c:return json_error('Category not found.',404)
        if db.query(InventoryItem).filter(InventoryItem.category==c.name).count():
            return json_error('Category is in use by inventory items. Deactivate it instead of deleting it.',409)
        db.delete(c);db.commit();return jsonify({'success':True})
    finally:db.close()

def inventory_request_view(db, request_row):
    data=model_to_dict(request_row)
    person=db.query(Personnel).filter(Personnel.id==request_row.personnel_id).first()
    data['personnel_name']=person.name if person else 'Unknown employee'
    data['personnel_code']=person.personnel_code if person else None
    return data

@app.get('/api/inventory/requests')
def inventory_requests_list():
    db=SessionLocal()
    try:
        rows=db.query(InventoryRequest).order_by(InventoryRequest.id.desc()).all()
        return jsonify({'success':True,'data':[inventory_request_view(db,x) for x in rows]})
    finally: db.close()

@app.route('/api/inventory/requests/<int:request_id>', methods=['PUT', 'PATCH'])
def inventory_request_update(request_id):
    data=get_json(); db=SessionLocal()
    try:
        row=db.query(InventoryRequest).filter(InventoryRequest.id==request_id).first()
        if not row:return json_error('Inventory request not found.',404)
        if 'status' in data: row.status=str(data['status']).upper()
        if 'command_response' in data: row.command_response=str(data['command_response'] or '').strip()
        row.updated_at=datetime.utcnow(); db.commit(); db.refresh(row)
        return jsonify({'success':True,'data':inventory_request_view(db,row)})
    except Exception as ex: db.rollback(); return json_error(str(ex),400)
    finally: db.close()


# ---------------- PERSONNEL ----------------
@app.get('/api/personnel')
def personnel_list(): return list_model(Personnel)
@app.post('/api/personnel')
def personnel_create():
    data=get_json();
    if not data.get('personnel_code') or not data.get('name'): return json_error('personnel_code and name are required.')
    db=SessionLocal()
    try:
        if db.query(Personnel).filter(Personnel.personnel_code==data['personnel_code']).first(): return json_error('personnel_code already exists.',409)
        p=Personnel(personnel_code=data['personnel_code'],name=data['name'],role=data.get('role'),department=data.get('department'),contact=data.get('contact'),current_location_id=data.get('current_location_id'),availability_status=(data.get('availability_status') or 'AVAILABLE').upper(),personnel_status=(data.get('personnel_status') or 'ACTIVE').upper())
        db.add(p); db.commit(); db.refresh(p); return jsonify({'success':True,'data':model_to_dict(p)}),201
    except Exception as e: db.rollback(); return json_error(str(e),400)
    finally: db.close()
@app.put('/api/personnel/<int:obj_id>')
def personnel_update(obj_id): return update_entity(Personnel,obj_id,get_json(),['name','role','department','contact','current_location_id','availability_status','personnel_status'])
@app.delete('/api/personnel/<int:obj_id>')
def personnel_delete(obj_id): return delete_model(Personnel,obj_id)

def personnel_task_view(db, task):
    data=model_to_dict(task)
    person=db.query(Personnel).filter(Personnel.id==task.personnel_id).first()
    data['personnel_name']=person.name if person else 'Unknown employee'
    data['personnel_code']=person.personnel_code if person else None
    return data

@app.get('/api/personnel/<int:personnel_id>/tasks')
def personnel_tasks_list(personnel_id):
    db=SessionLocal()
    try:
        if not db.query(Personnel).filter(Personnel.id==personnel_id).first(): return json_error('Personnel not found.',404)
        rows=db.query(PersonnelTask).filter(PersonnelTask.personnel_id==personnel_id).order_by(PersonnelTask.status.asc(), PersonnelTask.id.desc()).all()
        return jsonify({'success':True,'data':[personnel_task_view(db,row) for row in rows]})
    finally: db.close()

@app.post('/api/personnel/<int:personnel_id>/tasks')
def personnel_task_create(personnel_id):
    data=get_json(); title=str(data.get('title') or '').strip()
    if not title:return json_error('Task title is required.')
    db=SessionLocal()
    try:
        if not db.query(Personnel).filter(Personnel.id==personnel_id).first(): return json_error('Personnel not found.',404)
        now=datetime.utcnow()
        task=PersonnelTask(personnel_id=personnel_id,title=title,description=str(data.get('description') or '').strip(),priority=str(data.get('priority') or 'NORMAL').upper(),status='ASSIGNED',assigned_at=now,due_date=parse_dt(data.get('due_date')),created_at=now)
        db.add(task);db.commit();db.refresh(task)
        return jsonify({'success':True,'data':personnel_task_view(db,task)}),201
    except Exception as ex: db.rollback(); return json_error(str(ex),400)
    finally: db.close()

@app.route('/api/personnel-tasks/<int:task_id>', methods=['PUT', 'PATCH'])
def personnel_task_update(task_id):
    data=get_json(); db=SessionLocal()
    try:
        task=db.query(PersonnelTask).filter(PersonnelTask.id==task_id).first()
        if not task:return json_error('Task not found.',404)
        if 'title' in data and str(data['title']).strip(): task.title=str(data['title']).strip()
        if 'description' in data: task.description=str(data['description'] or '').strip()
        if 'priority' in data: task.priority=str(data['priority']).upper()
        if 'due_date' in data: task.due_date=parse_dt(data.get('due_date'))
        if 'completion_notes' in data: task.completion_notes=str(data['completion_notes'] or '').strip()
        if 'status' in data:
            task.status=str(data['status']).upper()
            task.completed_at=datetime.utcnow() if task.status == 'COMPLETED' else None
        db.commit();db.refresh(task)
        return jsonify({'success':True,'data':personnel_task_view(db,task)})
    except Exception as ex: db.rollback(); return json_error(str(ex),400)
    finally: db.close()


# ---------------- RESOURCES / ASSETS ----------------
@app.get('/api/resources')
def resources_list(): return list_model(Resource)
@app.post('/api/resources')
def resources_create():
    data=get_json();
    if not data.get('resource_code') or not data.get('name'): return json_error('resource_code and name are required.')
    db=SessionLocal()
    try:
        if db.query(Resource).filter(Resource.resource_code==data['resource_code']).first(): return json_error('resource_code already exists.',409)
        r=Resource(resource_code=data['resource_code'],name=data['name'],resource_type=data.get('resource_type'),quantity=float(data.get('quantity',1)),location_id=data.get('location_id'),status=(data.get('status') or 'AVAILABLE').upper())
        db.add(r); db.commit(); db.refresh(r); return jsonify({'success':True,'data':model_to_dict(r)}),201
    except Exception as e: db.rollback(); return json_error(str(e),400)
    finally: db.close()
@app.put('/api/resources/<int:obj_id>')
def resources_update(obj_id): return update_entity(Resource,obj_id,get_json(),['name','resource_type','quantity','location_id','status'])
@app.delete('/api/resources/<int:obj_id>')
def resources_delete(obj_id): return delete_model(Resource,obj_id)


# ---------------- LOCATIONS ----------------
@app.get('/api/locations')
def locations_list(): return list_model(Location)
@app.post('/api/locations')
def locations_create():
    data=get_json();
    if not data.get('name'): return json_error('name is required.')
    db=SessionLocal()
    try:
        l=Location(name=data['name'],location_type=data.get('location_type'),latitude=data.get('latitude'),longitude=data.get('longitude'),description=data.get('description')); db.add(l); db.commit(); db.refresh(l); return jsonify({'success':True,'data':model_to_dict(l)}),201
    except Exception as e: db.rollback(); return json_error(str(e),400)
    finally: db.close()



# ---------------- EXPEDITION INTELLIGENCE ----------------
def _haversine_km(a, b):
    if not a or not b or a.latitude is None or b.latitude is None:
        return 8.0
    radius = 6371.0
    p1, p2 = math.radians(a.latitude), math.radians(b.latitude)
    dp = math.radians(b.latitude - a.latitude)
    dl = math.radians(b.longitude - a.longitude)
    x = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return round(radius * 2 * math.atan2(math.sqrt(x), math.sqrt(1 - x)), 1)

def _risk_label(score):
    return 'CRITICAL' if score >= 80 else 'HIGH' if score >= 60 else 'MODERATE' if score >= 35 else 'LOW'

def _intelligence_context(db, expedition_id):
    expedition = db.query(Expedition).filter(Expedition.id == expedition_id).first()
    if not expedition:
        return None
    locations = {x.id: x for x in db.query(Location).all()}
    origin = locations.get(expedition.origin_location_id)
    destination = locations.get(expedition.destination_location_id)
    assignments = db.query(PersonnelAssignment).filter(PersonnelAssignment.expedition_id == expedition.id).all()
    personnel_ids = [a.personnel_id for a in assignments]
    people = db.query(Personnel).filter(Personnel.id.in_(personnel_ids)).all() if personnel_ids else []
    cargo = db.query(Cargo).filter(Cargo.expedition_id == expedition.id).all()
    destination_inventory = (
        db.query(InventoryItem)
        .filter(InventoryItem.storage_location_id == expedition.destination_location_id)
        .all()
        if expedition.destination_location_id else []
    )
    tasks = db.query(PersonnelTask).filter(PersonnelTask.personnel_id.in_(personnel_ids)).all() if personnel_ids else []
    open_emergencies = [e for e in db.query(Emergency).all() if (e.status or '').upper() not in {'RESOLVED', 'CLOSED'}]
    weather = db.query(WeatherPlace).filter(WeatherPlace.name == destination.name).first() if destination else None
    wind = float(getattr(weather, 'wind_speed_kmh', None) or 0)
    temperature = float(getattr(weather, 'temperature_c', None) or 0)
    visibility = float(getattr(weather, 'visibility_km', None) or 20)
    precipitation = float(getattr(weather, 'precipitation_mm', None) or 0)
    weather_code = int(getattr(weather, 'weather_code', None) or 0)
    distance = _haversine_km(origin, destination)
    food = sum(float(i.quantity or 0) for i in destination_inventory if (i.category or '').upper() in {'RATIONS', 'FOOD'})
    fuel = sum(float(i.quantity or 0) for i in destination_inventory if (i.category or '').upper() == 'FUEL')
    medical = [i for i in destination_inventory if (i.category or '').upper() == 'MEDICAL']
    medical_pct = round(min(100, sum(float(i.quantity or 0) for i in medical) / max(1, sum(float(i.minimum_stock or 0) for i in medical)) * 100)) if medical else 0
    overdue = sum(1 for t in tasks if t.due_date and t.due_date < datetime.utcnow() and (t.status or '').upper() not in {'COMPLETED', 'SUBMITTED'})
    food_days = max(1, round(food / max(1, len(people) * 1.4)))
    cold_score = min(10, round(max(0, abs(temperature) - 15) * 0.25))
    precipitation_score = min(8, round(precipitation * 2))
    severe_code_score = 7 if weather_code >= 95 else 5 if weather_code in {45, 48, 71, 73, 75, 77, 85, 86} else 0
    weather_score = min(25, cold_score + precipitation_score + severe_code_score)
    visibility_score = min(15, round(max(0, 8 - visibility) * 1.5))
    total_cargo_weight = sum(float(c.weight_kg or 0) for c in cargo)
    route_factors = [
        {'name': 'Weather', 'score': weather_score, 'detail': f'Cold/precipitation/weather-code composite at destination: {weather_score}/25'},
        {'name': 'Wind', 'score': min(20, round(wind * 0.22)), 'detail': f'Crosswind exposure: {wind:.1f} km/h'},
        {'name': 'Visibility', 'score': visibility_score, 'detail': f'Observed visibility: {visibility:.1f} km; poor-visibility exposure scored directly'},
        {'name': 'Previous incidents', 'score': min(15, sum(1 for e in db.query(Emergency).filter(Emergency.location_id == expedition.destination_location_id).all()) * 4), 'detail': 'Historical incident density near destination'},
        {'name': 'Cargo hazard', 'score': min(12, round(total_cargo_weight / 250)), 'detail': f'Manifest weight: {total_cargo_weight:.0f} kg; handling exposure scaled to the mission envelope'},
        {'name': 'Distance', 'score': min(13, round(distance / 160)), 'detail': f'{distance:.0f} km origin-to-destination'},
    ]
    risk_score = min(100, sum(f['score'] for f in route_factors))
    task_score = min(16, overdue * 6)
    stock_penalty = min(18, sum(1 for i in destination_inventory if i.minimum_stock and i.quantity < i.minimum_stock) * 4)
    readiness = max(18, min(98, round(100 - risk_score * 0.30 - task_score - stock_penalty + min(8, medical_pct / 20))))
    status = _risk_label(risk_score)
    alerts = []
    if food_days <= 7: alerts.append({'type': 'FOOD SUPPLY', 'message': f'Expected shortage in {food_days} days', 'severity': 'warning'})
    else: alerts.append({'type': 'FOOD SUPPLY', 'message': f'{food_days} days of ration reserve modeled', 'severity': 'ok'})
    if wind >= 40: alerts.append({'type': 'WEATHER', 'message': 'High wind expected in 18 hours', 'severity': 'warning'})
    if overdue: alerts.append({'type': 'PERSONNEL', 'message': f'{overdue} assigned task(s) overdue', 'severity': 'warning'})
    else: alerts.append({'type': 'PERSONNEL', 'message': 'No overdue tasks on this expedition', 'severity': 'ok'})
    alerts.append({'type': 'MEDICAL', 'message': 'Sufficient for planned duration' if medical_pct >= 90 else 'Review medical reserve before dispatch', 'severity': 'ok' if medical_pct >= 90 else 'warning'})
    cargo_ok = all((c.shipment_status or '').upper() in {'DELIVERED','AT_STATION'} for c in cargo)
    alerts.append({'type': 'CARGO', 'message': 'All critical cargo delivered' if cargo_ok else 'Critical cargo still in transit', 'severity': 'ok' if cargo_ok else 'warning'})
    return {'expedition': expedition_view(db, expedition), 'twin': {'personnel': len(people), 'cargo_shipments': len(cargo), 'food_kg': round(food * 12.5), 'fuel_l': round(fuel * 12), 'medical_pct': medical_pct, 'weather': {'temperature_c': temperature, 'wind_kmh': wind, 'visibility_km': visibility, 'weather_risk_score': weather_score}, 'overdue_tasks': overdue, 'nearby_emergencies': sum(1 for e in open_emergencies if e.location_id in {expedition.destination_location_id, expedition.origin_location_id}), 'readiness': readiness}, 'alerts': alerts, 'route': {'score': risk_score, 'label': status, 'distance_km': distance, 'segments': [{'name': (origin.name if origin else 'Base') + ' → ' + (destination.name if destination else 'Research Zone'), 'risk': risk_score, 'label': status}], 'factors': sorted(route_factors, key=lambda x: x['score'], reverse=True)}, 'people': [model_to_dict(p) for p in people], 'tasks': [model_to_dict(t) for t in tasks]}

def _recommendations(db, expedition_id, title, description, urgency):
    context = _intelligence_context(db, expedition_id)
    if not context: return []
    destination_id = context['expedition'].get('destination_location_id')
    destination = db.query(Location).filter(Location.id == destination_id).first() if destination_id else None
    keywords = set((f'{title} {description}').lower().replace('-', ' ').split())
    rows = []
    for person in db.query(Personnel).all():
        role_words = set((f'{person.role or ""} {person.department or ""}').lower().replace('-', ' ').split())
        skill = min(98, 58 + len(keywords & role_words) * 9 + (12 if any(w in role_words for w in {'engineer','technician','mechanical'}) and any(w in keywords for w in {'generator','repair','inspect','maintenance'}) else 0))
        person_location = db.query(Location).filter(Location.id == person.current_location_id).first()
        distance = _haversine_km(person_location, destination)
        workload = db.query(PersonnelTask).filter(PersonnelTask.personnel_id == person.id, PersonnelTask.status.notin_(['COMPLETED','SUBMITTED'])).count()
        availability = str(person.availability_status or person.personnel_status or 'UNKNOWN').upper()
        availability_score = 18 if availability in {'AVAILABLE','ON_CALL','ACTIVE'} else 7 if availability == 'DEPLOYED' else 2
        workload_score = max(0, 15 - workload * 5)
        score = min(99, round(skill * 0.58 + max(0, 18 - distance / 8) + availability_score + workload_score))
        rows.append({'personnel_id': person.id, 'name': person.name, 'personnel_code': person.personnel_code, 'role': person.role or person.department or 'Field personnel', 'skill_match': skill, 'distance_km': distance, 'workload': 'LOW' if workload <= 1 else 'MEDIUM' if workload <= 3 else 'HIGH', 'availability': availability, 'recommendation_score': score, 'reason': f'{skill}% skill match · {distance} km away · {availability.lower()}'})
    return sorted(rows, key=lambda x: x['recommendation_score'], reverse=True)[:5]

@app.get('/api/intelligence/expeditions/<int:expedition_id>')
def intelligence_snapshot(expedition_id):
    db = SessionLocal()
    try:
        result = _intelligence_context(db, expedition_id)
        return jsonify(result) if result else json_error('Expedition not found.', 404)
    finally: db.close()

@app.post('/api/intelligence/scenario')
def intelligence_scenario():
    data = get_json(); expedition_id = data.get('expedition_id')
    db = SessionLocal()
    try:
        current = _intelligence_context(db, int(expedition_id)) if expedition_id else None
        if not current: return json_error('Expedition not found.', 404)
        if str(data.get('scenario') or 'WEATHER_WORSENS').upper() != 'WEATHER_WORSENS': return json_error('Unsupported scenario.')
        base = current['twin']['readiness']; wind = current['twin']['weather']['wind_kmh']; delay = 14
        simulated = max(10, base - 13 - round(max(0, wind - 35) / 10))
        return jsonify({'success': True, 'scenario': {'name': 'Weather worsens', 'delta_wind_pct': 30, 'travel_delay_hours': delay, 'fuel_delta_pct': 18, 'food_reserve_delta_days': -2, 'current_readiness': base, 'simulated_readiness': simulated, 'steps': ['Wind +30%', f'Travel delay +{delay} hours', 'Fuel consumption increases', 'Food reserve decreases', f'Readiness: {base}% → {simulated}%']}})
    finally: db.close()

@app.post('/api/intelligence/recommend-personnel')
def intelligence_recommend_personnel():
    data = get_json(); db = SessionLocal()
    try:
        rows = _recommendations(db, int(data.get('expedition_id')), str(data.get('title') or ''), str(data.get('description') or ''), data.get('urgency'))
        return jsonify({'success': True, 'recommendations': rows})
    except (TypeError, ValueError): return json_error('expedition_id is required.')
    finally: db.close()

# ---------------- WEATHER MANAGEMENT ----------------
def weather_condition(code):
    code=int(code or 0)
    if code == 0:return 'Clear sky'
    if code in (1,2,3):return 'Partly cloudy'
    if code in (45,48):return 'Fog'
    if code in range(51,68):return 'Rain / drizzle'
    if code in range(71,78):return 'Snowfall'
    if code in range(80,83):return 'Rain showers'
    if code in (85,86):return 'Snow showers'
    if code >= 95:return 'Thunderstorm'
    return 'Variable conditions'


def calculate_weather_risk_score(temperature_c, wind_speed_kmh, visibility_km):
    """Match the ML generator's transparent 0-100 weather-risk formula."""
    if temperature_c is None or wind_speed_kmh is None or visibility_km is None:
        return None
    temp_component = min(max((abs(float(temperature_c)) - 5) / 45, 0), 1)
    wind_component = min(max(float(wind_speed_kmh) / 100, 0), 1)
    visibility_component = min(max(1 - (float(visibility_km) / 20), 0), 1)
    return round(100 * (0.4 * temp_component + 0.35 * wind_component + 0.25 * visibility_component), 1)

def weather_place_view(place):
    data=model_to_dict(place); data['conditions']=place.conditions or weather_condition(place.weather_code); return data

def refresh_weather_place(place):
    payload=fetch_weather(place.latitude, place.longitude); current=payload.get('current') or {}
    visibility_m = current.get('visibility'); visibility_km = float(visibility_m) / 1000 if visibility_m is not None else None
    place.temperature_c=current.get('temperature_2m'); place.feels_like_c=current.get('apparent_temperature'); place.humidity=current.get('relative_humidity_2m'); place.wind_speed_kmh=current.get('wind_speed_10m'); place.wind_direction=current.get('wind_direction_10m'); place.visibility_km=visibility_km; place.weather_risk_score=calculate_weather_risk_score(place.temperature_c, place.wind_speed_kmh, place.visibility_km); place.precipitation_mm=current.get('precipitation'); place.weather_code=current.get('weather_code'); place.conditions=weather_condition(place.weather_code); place.timezone=payload.get('timezone'); place.last_updated=datetime.utcnow(); return place

def ensure_weather_places(db):
    """Create weather cards from existing locations with coordinates."""
    existing={place.name.lower() for place in db.query(WeatherPlace).all()}
    for location in db.query(Location).filter(Location.latitude.isnot(None), Location.longitude.isnot(None)).all():
        if location.name.lower() in existing: continue
        place=WeatherPlace(name=location.name,latitude=location.latitude,longitude=location.longitude,created_at=datetime.utcnow()); db.add(place); db.flush()
        try: refresh_weather_place(place)
        except RuntimeError: pass
    db.commit()

@app.get('/api/weather/places')
def weather_places_list():
    db=SessionLocal()
    try:
        ensure_weather_places(db)
        return jsonify({'success':True,'data':[weather_place_view(x) for x in db.query(WeatherPlace).order_by(WeatherPlace.name.asc()).all()]})
    finally:db.close()

@app.post('/api/weather/places')
def weather_place_create():
    data=get_json(); name=str(data.get('name') or '').strip()
    if not name:return json_error('Place name is required.')
    try:lat=float(data.get('latitude'));lon=float(data.get('longitude'))
    except (TypeError,ValueError):return json_error('Valid latitude and longitude are required.')
    if not -90 <= lat <= 90 or not -180 <= lon <= 180:return json_error('Coordinates are outside valid ranges.')
    db=SessionLocal()
    try:
        place=WeatherPlace(name=name,latitude=lat,longitude=lon,created_at=datetime.utcnow()); db.add(place); db.flush()
        try:refresh_weather_place(place)
        except RuntimeError:pass
        db.commit();db.refresh(place);return jsonify({'success':True,'data':weather_place_view(place)}),201
    except Exception as ex:db.rollback();return json_error(str(ex),400)
    finally:db.close()

@app.post('/api/weather/places/<int:place_id>/refresh')
def weather_place_refresh(place_id):
    db=SessionLocal()
    try:
        place=db.query(WeatherPlace).filter(WeatherPlace.id==place_id).first()
        if not place:return json_error('Weather place not found.',404)
        try:refresh_weather_place(place)
        except RuntimeError as ex:return json_error(str(ex),502)
        db.commit();db.refresh(place);return jsonify({'success':True,'data':weather_place_view(place)})
    finally:db.close()

@app.delete('/api/weather/places/<int:place_id>')
def weather_place_delete(place_id):
    db=SessionLocal()
    try:
        place=db.query(WeatherPlace).filter(WeatherPlace.id==place_id).first()
        if not place:return json_error('Weather place not found.',404)
        db.delete(place);db.commit();return jsonify({'success':True,'deleted_id':place_id})
    finally:db.close()

@app.post('/api/weather/refresh-all')
def weather_refresh_all():
    db=SessionLocal();updated=0;errors=[]
    try:
        for place in db.query(WeatherPlace).all():
            try:refresh_weather_place(place);updated+=1
            except RuntimeError as ex:errors.append({'place':place.name,'error':str(ex)})
        db.commit();return jsonify({'success':True,'updated':updated,'errors':errors,'data':[weather_place_view(x) for x in db.query(WeatherPlace).order_by(WeatherPlace.name.asc()).all()]})
    finally:db.close()

# ---------------- EMERGENCIES / ALERTS ----------------
def emergency_view(db, emergency):
    data = model_to_dict(emergency)
    location = db.query(Location).filter(Location.id == emergency.location_id).first() if emergency.location_id else None
    reporter = db.query(Personnel).filter(Personnel.id == emergency.reported_by).first() if emergency.reported_by else None
    data['location_name'] = location.name if location else None
    data['reported_by_name'] = reporter.name if reporter else None
    return data

@app.get('/api/emergencies')
def emergencies_list():
    db=SessionLocal()
    try: return jsonify([emergency_view(db,e) for e in db.query(Emergency).order_by(Emergency.id.desc()).all()])
    finally: db.close()
@app.post('/api/emergencies')
def emergency_create():
    data=get_json();
    if not data.get('emergency_code') or not data.get('emergency_type') or not data.get('severity'): return json_error('emergency_code, emergency_type and severity are required.')
    db=SessionLocal()
    try:
        if db.query(Emergency).filter(Emergency.emergency_code==data['emergency_code']).first(): return json_error('emergency_code already exists.',409)
        location_id=data.get('location_id')
        if not location_id and data.get('location_name'):
            location = db.query(Location).filter(Location.name.ilike(f"%{str(data['location_name']).strip()}%")).first()
            location_id = location.id if location else None
        reported_by=data.get('reported_by')
        if isinstance(reported_by, str) and not reported_by.isdigit():
            reported_by = None
        description = data.get('description') or ''
        if data.get('reported_by_name'):
            description = f"{description}\nReported by: {data['reported_by_name']}".strip()
        e=Emergency(emergency_code=data['emergency_code'],emergency_type=data['emergency_type'],severity=str(data['severity']).upper(),location_id=location_id,reported_by=int(reported_by) if reported_by else None,reported_time=parse_dt(data.get('reported_time')) or datetime.utcnow(),description=description,status=(data.get('status') or 'REPORTED').upper(),resolved_time=parse_dt(data.get('resolved_time')))
        db.add(e); db.commit(); db.refresh(e); create_emergency_alert(db,e); return jsonify({'success':True,'data':emergency_view(db,e)}),201
    except Exception as ex: db.rollback(); return json_error(str(ex),400)
    finally: db.close()
@app.put('/api/emergencies/<int:obj_id>')
def emergency_update(obj_id):
    data=get_json()
    if str(data.get('status','')).upper() in {'RESOLVED','CLOSED'} and not data.get('resolved_time'):
        data['resolved_time']=datetime.utcnow().isoformat()
    return update_entity(Emergency,obj_id,data,['emergency_type','severity','location_id','reported_by','reported_time','description','status','resolved_time'])
@app.delete('/api/emergencies/<int:obj_id>')
def emergency_delete(obj_id): return delete_model(Emergency,obj_id)

@app.post('/api/emergencies/<int:obj_id>/dispatch')
def emergency_dispatch(obj_id):
    data=get_json(); db=SessionLocal()
    try:
        emergency=db.query(Emergency).filter(Emergency.id==obj_id).first()
        if not emergency: return json_error('Emergency not found.',404)
        if (emergency.status or '').upper() in {'RESOLVED','CLOSED'}: return json_error('Resolved emergencies cannot be dispatched.',409)
        emergency.status='RESPONDING'
        update=EmergencyUpdate(emergency_id=emergency.id,updated_by=data.get('updated_by'),update_time=datetime.utcnow(),status='RESPONDING',update_message=data.get('message') or 'Response team dispatched from POLARIS command.')
        db.add(update); db.commit(); db.refresh(emergency); db.refresh(update)
        return jsonify({'success':True,'emergency':emergency_view(db, emergency),'update':model_to_dict(update)})
    except Exception as ex:
        db.rollback(); return json_error(str(ex),400)
    finally: db.close()

@app.get('/api/emergencies/<int:obj_id>/updates')
def emergency_updates(obj_id):
    db=SessionLocal()
    try:
        return jsonify([model_to_dict(x) for x in db.query(EmergencyUpdate).filter(EmergencyUpdate.emergency_id==obj_id).order_by(EmergencyUpdate.id.desc()).all()])
    finally: db.close()

@app.get('/api/alerts')
def alerts_list():
    db=SessionLocal()
    try: return jsonify([model_to_dict(a) for a in db.query(Alert).order_by(Alert.id.desc()).all()])
    finally: db.close()
@app.put('/api/alerts/<int:alert_id>/read')
def alert_read(alert_id):
    db=SessionLocal()
    try:
        a=db.query(Alert).filter(Alert.id==alert_id).first()
        if not a:return json_error('Alert not found.',404)
        a.is_read=True;db.commit();db.refresh(a);return jsonify(model_to_dict(a))
    finally:db.close()

# ---------------- MESSAGES (two-way communication) ----------------
def message_view(db, message):
    data = model_to_dict(message)
    sender = db.query(Personnel).filter(Personnel.id == message.sender_personnel_id).first() if message.sender_personnel_id else None
    data['sender_personnel_code'] = sender.personnel_code if sender else None
    recipient_person = db.query(Personnel).filter(Personnel.id == message.recipient_personnel_id).first() if message.recipient_personnel_id else None
    data['recipient_personnel_code'] = recipient_person.personnel_code if recipient_person else None
    return data

@app.get('/api/messages')
def messages_list():
    """List messages, newest last (thread order), optionally filtered by
    channel, related emergency (SOS thread) or sender personnel."""
    db = SessionLocal()
    try:
        q = db.query(Message)
        channel = request.args.get('channel')
        if channel:
            q = q.filter(Message.channel == channel.upper())
        emergency_id = request.args.get('emergency_id')
        if emergency_id:
            q = q.filter(Message.related_emergency_id == int(emergency_id))
        personnel_id = request.args.get('personnel_id')
        if personnel_id:
            pid = int(personnel_id)
            q = q.filter((Message.sender_personnel_id == pid) | (Message.recipient_personnel_id == pid) | (Message.recipient == 'ALL'))
        limit = min(int(request.args.get('limit', 200)), 500)
        rows = q.order_by(Message.sent_at.asc(), Message.id.asc()).all()[-limit:]
        return jsonify({'success': True, 'data': [message_view(db, m) for m in rows]})
    finally:
        db.close()

@app.post('/api/messages')
def messages_create():
    """Send a message. This is the core of two-way communication: field
    personnel and command center both post here, and both read the same
    thread back through GET /api/messages. priority=SOS also raises a
    CRITICAL alert so it surfaces on the Alerts feed."""
    data = get_json()
    if not data.get('body'):
        return json_error('body is required.')
    db = SessionLocal()
    try:
        sender_personnel_id = data.get('sender_personnel_id')
        if isinstance(sender_personnel_id, str) and not sender_personnel_id.isdigit():
            sender_personnel_id = None
        recipient_personnel_id = data.get('recipient_personnel_id')
        if isinstance(recipient_personnel_id, str) and not recipient_personnel_id.isdigit():
            recipient_personnel_id = None
        related_emergency_id = data.get('related_emergency_id')
        if isinstance(related_emergency_id, str) and not related_emergency_id.isdigit():
            related_emergency_id = None
        m = Message(
            channel=(data.get('channel') or 'OPS').upper(),
            direction=(data.get('direction') or 'FIELD_TO_COMMAND').upper(),
            sender_name=data.get('sender_name') or 'Unknown unit',
            sender_role=data.get('sender_role'),
            sender_personnel_id=int(sender_personnel_id) if sender_personnel_id else None,
            recipient=data.get('recipient') or 'ALL',
            recipient_personnel_id=int(recipient_personnel_id) if recipient_personnel_id else None,
            related_emergency_id=int(related_emergency_id) if related_emergency_id else None,
            body=data['body'],
            is_read=False,
            priority=(data.get('priority') or 'NORMAL').upper(),
            sent_at=parse_dt(data.get('sent_at')) or datetime.utcnow(),
        )
        if m.direction == 'COMMAND_TO_FIELD' and m.related_emergency_id and not m.recipient_personnel_id:
            emergency = db.query(Emergency).filter(Emergency.id == m.related_emergency_id).first()
            if emergency and emergency.reported_by:
                m.recipient_personnel_id = emergency.reported_by
        db.add(m); db.commit(); db.refresh(m)
        if m.priority == 'SOS':
            create_sos_message_alert(db, m)
        return jsonify({'success': True, 'data': message_view(db, m)}), 201
    except Exception as ex:
        db.rollback(); return json_error(str(ex), 400)
    finally:
        db.close()

@app.put('/api/messages/<int:message_id>/read')
def messages_mark_read(message_id):
    db = SessionLocal()
    try:
        m = db.query(Message).filter(Message.id == message_id).first()
        if not m: return json_error('Message not found.', 404)
        m.is_read = True; db.commit(); db.refresh(m)
        return jsonify({'success': True, 'data': message_view(db, m)})
    finally:
        db.close()

@app.delete('/api/messages/<int:message_id>')
def messages_delete(message_id): return delete_model(Message, message_id)


# ---------------- EMPLOYEE FIELD PORTAL ----------------
@app.post('/api/employee/login')
def employee_login():
    """Prototype field login using a provisioned employee account."""
    from werkzeug.security import check_password_hash
    data=get_json(); username=str(data.get('username') or '').strip().lower(); password=str(data.get('password') or '')
    db=SessionLocal()
    try:
        account=db.query(EmployeeAccount).filter(EmployeeAccount.username==username, EmployeeAccount.active==True).first()
        if not account or not check_password_hash(account.password_hash,password): return json_error('Invalid employee credentials.',401)
        personnel=db.query(Personnel).filter(Personnel.id==account.personnel_id).first()
        if not personnel:return json_error('Employee profile not found.',404)
        session['employee_personnel_id']=personnel.id
        return jsonify({'success':True,'employee':model_to_dict(personnel)})
    finally: db.close()

@app.post('/api/employee/signup')
def employee_signup():
    from werkzeug.security import generate_password_hash
    data=get_json()
    name=str(data.get('name') or '').strip()
    personnel_code=str(data.get('personnel_code') or '').strip().upper()
    username=str(data.get('username') or '').strip().lower()
    password=str(data.get('password') or '')
    role=str(data.get('role') or 'Field Employee').strip()
    department=str(data.get('department') or 'Field Operations').strip()
    contact=str(data.get('contact') or '').strip()
    if not name or not personnel_code or not username or len(password)<8:
        return json_error('Name, employee code, username and a password of at least 8 characters are required.')
    db=SessionLocal()
    try:
        if db.query(Personnel).filter(Personnel.personnel_code==personnel_code).first(): return json_error('Employee code already exists.',409)
        if db.query(EmployeeAccount).filter(EmployeeAccount.username==username).first(): return json_error('Username already exists.',409)
        person=Personnel(personnel_code=personnel_code,name=name,role=role,department=department,contact=contact,availability_status='AVAILABLE',personnel_status='ACTIVE')
        db.add(person); db.flush()
        account=EmployeeAccount(personnel_id=person.id,username=username,password_hash=generate_password_hash(password),active=True,created_at=datetime.utcnow())
        db.add(account); db.commit(); db.refresh(person)
        session['employee_personnel_id']=person.id
        return jsonify({'success':True,'employee':model_to_dict(person)}),201
    except Exception as ex:
        db.rollback(); return json_error(str(ex),400)
    finally: db.close()

@app.post('/api/employee/logout')
def employee_logout():
    session.pop('employee_personnel_id',None); return jsonify({'success':True})

@app.get('/api/employee/me')
def employee_me():
    pid=session.get('employee_personnel_id')
    if not pid:return jsonify({'success':True,'employee':None})
    db=SessionLocal()
    try:
        p=db.query(Personnel).filter(Personnel.id==pid).first()
        if not p:return jsonify({'success':True,'employee':None})
        return jsonify({'success':True,'employee':model_to_dict(p)})
    finally:db.close()

@app.get('/api/employee/messages')
def employee_messages():
    pid=session.get('employee_personnel_id')
    if not pid:return json_error('Employee login required.',401)
    db=SessionLocal()
    try:
        emergency_ids=[x.id for x in db.query(Emergency).filter(Emergency.reported_by==pid).all()]
        visibility=(Message.sender_personnel_id==pid)|(Message.recipient_personnel_id==pid)|(Message.recipient=='ALL')
        if emergency_ids:
            visibility = visibility | Message.related_emergency_id.in_(emergency_ids)
        rows=db.query(Message).filter(visibility).order_by(Message.sent_at.asc(),Message.id.asc()).all()
        return jsonify({'success':True,'data':[message_view(db,m) for m in rows]})
    finally:db.close()

@app.post('/api/employee/messages')
def employee_send_message():
    pid=session.get('employee_personnel_id')
    if not pid:return json_error('Employee login required.',401)
    data=get_json(); body=str(data.get('body') or '').strip()
    if not body:return json_error('Message body is required.')
    db=SessionLocal()
    try:
        p=db.query(Personnel).filter(Personnel.id==pid).first()
        if not p:return json_error('Employee profile not found.',404)
        recipient_pid=data.get('recipient_personnel_id')
        recipient_pid=int(recipient_pid) if str(recipient_pid).isdigit() else None
        m=Message(channel=(data.get('channel') or 'OPS').upper(),direction='FIELD_TO_COMMAND',sender_name=p.name,sender_role=p.role,sender_personnel_id=p.id,recipient=data.get('recipient') or 'COMMAND',recipient_personnel_id=recipient_pid,body=body,is_read=False,priority=(data.get('priority') or 'NORMAL').upper(),sent_at=datetime.utcnow())
        db.add(m);db.commit();db.refresh(m)
        if m.priority=='SOS': create_sos_message_alert(db,m)
        return jsonify({'success':True,'data':message_view(db,m)}),201
    except Exception as ex:db.rollback();return json_error(str(ex),400)
    finally:db.close()

@app.post('/api/employee/gps')
def employee_gps():
    pid=session.get('employee_personnel_id')
    if not pid:return json_error('Employee login required.',401)
    data=get_json()
    try: lat=float(data['latitude']); lon=float(data['longitude'])
    except (KeyError,TypeError,ValueError): return json_error('latitude and longitude are required.')
    db=SessionLocal()
    try:
        point=LiveTelemetry(entity_type='PERSONNEL',entity_id=pid,latitude=lat,longitude=lon,speed_kmh=float(data.get('speed_kmh') or 0),heading=float(data.get('heading') or 0),source='EMPLOYEE_BROWSER_GPS',recorded_at=datetime.utcnow())
        db.add(point);db.commit();db.refresh(point)
        return jsonify({'success':True,'data':model_to_dict(point)})
    except Exception as ex:db.rollback();return json_error(str(ex),400)
    finally:db.close()

@app.get('/api/employee/assigned')
def employee_assigned():
    pid=session.get('employee_personnel_id')
    if not pid:return json_error('Employee login required.',401)
    db=SessionLocal()
    try:
        assignments=db.query(PersonnelAssignment).filter(PersonnelAssignment.personnel_id==pid).all()
        exp_ids=[x.expedition_id for x in assignments]
        exps=db.query(Expedition).filter(Expedition.id.in_(exp_ids)).all() if exp_ids else []
        cargo=db.query(Cargo).filter(Cargo.expedition_id.in_(exp_ids)).all() if exp_ids else []
        return jsonify({'success':True,'expeditions':[model_to_dict(x) for x in exps],'cargo':[model_to_dict(x) for x in cargo]})
    finally: db.close()

@app.get('/api/employee/tasks')
def employee_tasks():
    """Return only the logged-in employee's assigned work."""
    pid=session.get('employee_personnel_id')
    if not pid:return json_error('Employee login required.',401)
    db=SessionLocal()
    try:
        rows=db.query(PersonnelTask).filter(PersonnelTask.personnel_id==pid).order_by(PersonnelTask.status.asc(),PersonnelTask.id.desc()).all()
        return jsonify({'success':True,'data':[personnel_task_view(db,row) for row in rows]})
    finally: db.close()

@app.patch('/api/employee/tasks/<int:task_id>/submit')
def employee_task_submit(task_id):
    """Let an employee submit completed work for command review."""
    pid=session.get('employee_personnel_id')
    if not pid:return json_error('Employee login required.',401)
    data=get_json(); notes=str(data.get('completion_notes') or '').strip()
    if not notes:return json_error('Please add a short completion note before submitting.')
    db=SessionLocal()
    try:
        task=db.query(PersonnelTask).filter(PersonnelTask.id==task_id,PersonnelTask.personnel_id==pid).first()
        if not task:return json_error('Task not found for this employee.',404)
        if task.status=='COMPLETED':return json_error('This task is already completed.',409)
        task.completion_notes=notes; task.status='SUBMITTED'; db.commit(); db.refresh(task)
        return jsonify({'success':True,'data':personnel_task_view(db,task)})
    except Exception as ex:db.rollback();return json_error(str(ex),400)
    finally:db.close()

@app.post('/api/employee/sos')
def employee_sos():
    pid=session.get('employee_personnel_id')
    if not pid:return json_error('Employee login required.',401)
    data=get_json(); db=SessionLocal()
    try:
        p=db.query(Personnel).filter(Personnel.id==pid).first()
        if not p:return json_error('Employee profile not found.',404)
        lat=data.get('latitude'); lon=data.get('longitude')
        location_id=None
        if lat is not None and lon is not None:
            point=LiveTelemetry(entity_type='PERSONNEL',entity_id=pid,latitude=float(lat),longitude=float(lon),source='EMPLOYEE_SOS_GPS',recorded_at=datetime.utcnow())
            db.add(point);db.flush()
        code=f"SOS-{p.personnel_code}-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
        desc=str(data.get('description') or 'Emergency SOS reported by field employee.')
        e=Emergency(emergency_code=code,emergency_type='EMPLOYEE SOS',severity='CRITICAL',location_id=location_id,reported_by=p.id,reported_time=datetime.utcnow(),description=desc,status='REPORTED')
        db.add(e);db.flush();create_emergency_alert(db,e)
        m=Message(channel='SOS',direction='FIELD_TO_COMMAND',sender_name=p.name,sender_role=p.role,sender_personnel_id=p.id,recipient='COMMAND',related_emergency_id=e.id,body=desc,is_read=False,priority='SOS',sent_at=datetime.utcnow())
        db.add(m);db.commit();db.refresh(e);db.refresh(m)
        return jsonify({'success':True,'emergency':emergency_view(db,e),'message':message_view(db,m),'gps_shared':lat is not None and lon is not None}),201
    except Exception as ex:db.rollback();return json_error(str(ex),400)
    finally:db.close()

@app.get('/api/employee/command-info')
def employee_command_info():
    pid=session.get('employee_personnel_id')
    if not pid:return json_error('Employee login required.',401)
    db=SessionLocal()
    try:
        alerts=db.query(Alert).filter(Alert.is_read==False).order_by(Alert.created_at.desc(),Alert.id.desc()).limit(20).all()
        return jsonify({'success':True,'alerts':[model_to_dict(a) for a in alerts]})
    finally:db.close()

@app.get('/api/employee/inventory-requests')
def employee_inventory_requests():
    pid=session.get('employee_personnel_id')
    if not pid:return json_error('Employee login required.',401)
    db=SessionLocal()
    try:
        rows=db.query(InventoryRequest).filter(InventoryRequest.personnel_id==pid).order_by(InventoryRequest.id.desc()).all()
        return jsonify({'success':True,'data':[inventory_request_view(db,x) for x in rows]})
    finally: db.close()

@app.post('/api/employee/inventory-requests')
def employee_inventory_request_create():
    pid=session.get('employee_personnel_id')
    if not pid:return json_error('Employee login required.',401)
    data=get_json(); item_name=str(data.get('item_name') or '').strip(); category=str(data.get('category') or 'GENERAL').strip().upper(); unit=str(data.get('unit') or 'units').strip(); destination=str(data.get('destination') or '').strip(); reason=str(data.get('reason') or '').strip()
    if not item_name or not category or not destination:return json_error('Item name, category and destination are required.')
    db=SessionLocal()
    try:
        row=InventoryRequest(personnel_id=pid,item_name=item_name,category=category,quantity=float(data.get('quantity') or 1),unit=unit,needed_by=parse_dt(data.get('needed_by')),destination=destination,reason=reason,status='PENDING',created_at=datetime.utcnow())
        db.add(row);db.commit();db.refresh(row)
        return jsonify({'success':True,'data':inventory_request_view(db,row)}),201
    except Exception as ex: db.rollback(); return json_error(str(ex),400)
    finally: db.close()

@app.get('/api/employee/accounts')
def employee_accounts():
    db=SessionLocal()
    try:
        rows=[]
        for a in db.query(EmployeeAccount).order_by(EmployeeAccount.id.desc()).all():
            p=db.query(Personnel).filter(Personnel.id==a.personnel_id).first()
            rows.append({'id':a.id,'username':a.username,'active':a.active,'personnel_id':a.personnel_id,'personnel_code':p.personnel_code if p else None,'name':p.name if p else None})
        return jsonify({'success':True,'data':rows})
    finally:db.close()

@app.post('/api/employee/accounts')
def employee_account_create():
    from werkzeug.security import generate_password_hash
    data=get_json(); pid=data.get('personnel_id'); username=str(data.get('username') or '').strip().lower(); password=str(data.get('password') or '')
    if not str(pid).isdigit() or not username or len(password)<6:return json_error('personnel_id, username and a password of at least 6 characters are required.')
    db=SessionLocal()
    try:
        if not db.query(Personnel).filter(Personnel.id==int(pid)).first():return json_error('Personnel not found.',404)
        if db.query(EmployeeAccount).filter(EmployeeAccount.username==username).first():return json_error('Username already exists.',409)
        if db.query(EmployeeAccount).filter(EmployeeAccount.personnel_id==int(pid)).first():return json_error('This employee already has an account.',409)
        a=EmployeeAccount(personnel_id=int(pid),username=username,password_hash=generate_password_hash(password),active=True,created_at=datetime.utcnow());db.add(a);db.commit();db.refresh(a)
        return jsonify({'success':True,'data':{'id':a.id,'username':a.username,'personnel_id':a.personnel_id}}),201
    except Exception as ex:db.rollback();return json_error(str(ex),400)
    finally:db.close()

# ---------------- MOVEMENT ----------------
@app.get('/api/movements')
def movements_list(): return list_model(PersonnelMovement)
@app.post('/api/movements')
def movements_create():
    data=get_json();
    if not data.get('personnel_id'): return json_error('personnel_id is required.')
    db=SessionLocal()
    try:
        p=db.query(Personnel).filter(Personnel.id==data['personnel_id']).first()
        if not p:return json_error('Personnel not found.',404)
        m=PersonnelMovement(personnel_id=data['personnel_id'],from_location_id=data.get('from_location_id'),to_location_id=data.get('to_location_id'),movement_time=parse_dt(data.get('movement_time')) or datetime.utcnow(),movement_status=(data.get('movement_status') or 'PLANNED').upper(),remarks=data.get('remarks'));db.add(m);db.commit();db.refresh(m)
        if m.movement_status in {'ANOMALY','DEVIATED','DELAYED','MISSING'}: create_movement_anomaly_alert(db,p,m)
        return jsonify({'success':True,'data':model_to_dict(m)}),201
    except Exception as e:db.rollback();return json_error(str(e),400)
    finally:db.close()


# ---------------- LIVE DATA / TELEMETRY ----------------
@app.get('/api/live/weather')
def live_weather():
    try:
        latitude = float(request.args.get('latitude'))
        longitude = float(request.args.get('longitude'))
    except (TypeError, ValueError):
        return json_error('latitude and longitude are required numeric parameters.')
    try:
        return jsonify({'success': True, **fetch_weather(latitude, longitude)})
    except RuntimeError as ex:
        return json_error(str(ex), 502)


@app.get('/api/live/research-updates')
def live_research_updates():
    try:
        limit = max(1, min(int(request.args.get('limit', 8)), 20))
    except ValueError:
        limit = 8
    try:
        return jsonify({'success': True, **fetch_research_updates(limit)})
    except RuntimeError as ex:
        return json_error(str(ex), 502)


@app.post('/api/live/gps')
def receive_gps():
    """Receive a real GPS point from a tracker/mobile device.

    Example payload:
    {"entity_type":"CARGO","entity_id":1,"latitude":-70.7,
     "longitude":11.8,"speed_kmh":18,"heading":42,"source":"GPS"}
    """
    data = get_json()
    try:
        entity_type = str(data.get('entity_type') or '').upper()
        entity_id = int(data.get('entity_id'))
        latitude = float(data.get('latitude'))
        longitude = float(data.get('longitude'))
    except (TypeError, ValueError):
        return json_error('entity_type, entity_id, latitude and longitude are required.')
    if entity_type not in {'CARGO', 'PERSONNEL', 'VEHICLE'}:
        return json_error('entity_type must be CARGO, PERSONNEL or VEHICLE.')
    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        return json_error('Invalid latitude/longitude range.')

    db = SessionLocal()
    try:
        point = LiveTelemetry(
            entity_type=entity_type,
            entity_id=entity_id,
            latitude=latitude,
            longitude=longitude,
            speed_kmh=data.get('speed_kmh'),
            heading=data.get('heading'),
            source=str(data.get('source') or 'GPS'),
            recorded_at=parse_dt(data.get('recorded_at')) or datetime.utcnow()
        )
        db.add(point)
        db.commit()
        db.refresh(point)
        return jsonify({'success': True, 'data': model_to_dict(point)}), 201
    except Exception as ex:
        db.rollback()
        return json_error(str(ex), 400)
    finally:
        db.close()


def _latest_telemetry(db, entity_type, entity_id):
    return db.query(LiveTelemetry).filter(
        LiveTelemetry.entity_type == entity_type,
        LiveTelemetry.entity_id == entity_id
    ).order_by(LiveTelemetry.recorded_at.desc(), LiveTelemetry.id.desc()).first()


@app.get('/api/live/gps/<entity_type>/<int:entity_id>')
def latest_gps(entity_type, entity_id):
    """Pull the last known real GPS point for one entity. This is the
    'pull' half of two-way GPS: a device/tracker POSTs its position to
    /api/live/gps, and any client (including that same device, to confirm
    receipt) can GET it back here."""
    db = SessionLocal()
    try:
        point = _latest_telemetry(db, entity_type.upper(), entity_id)
        if not point:
            return json_error('No telemetry recorded for this entity yet.', 404)
        return jsonify({'success': True, 'data': model_to_dict(point)})
    finally:
        db.close()


@app.get('/api/live/positions')
def all_live_positions():
    """Latest known point for every entity that has ever reported GPS —
    used to plot everyone on one live map."""
    db = SessionLocal()
    try:
        rows = db.query(LiveTelemetry).order_by(LiveTelemetry.recorded_at.desc(), LiveTelemetry.id.desc()).all()
        latest = {}
        for r in rows:
            key = (r.entity_type, r.entity_id)
            if key not in latest:
                latest[key] = r
        return jsonify({'success': True, 'data': [model_to_dict(v) for v in latest.values()]})
    finally:
        db.close()


@app.get('/api/live/cargo-tracking')
def live_cargo_tracking():
    db = SessionLocal()
    try:
        locations = {x.id: x for x in db.query(Location).all()}
        expeditions = {x.id: x for x in db.query(Expedition).all()}
        rows = []
        for cargo in db.query(Cargo).order_by(Cargo.id.desc()).all():
            expedition = expeditions.get(cargo.expedition_id)
            current = locations.get(cargo.current_location_id)
            destination = locations.get(expedition.destination_location_id) if expedition else None
            point = _latest_telemetry(db, 'CARGO', cargo.id)

            simulated = False
            progress = None
            lat = point.latitude if point else (current.latitude if current else None)
            lon = point.longitude if point else (current.longitude if current else None)
            source = point.source if point else 'DATABASE_LOCATION'

            if point is None and str(cargo.shipment_status or '').upper() == 'IN_TRANSIT' and current and destination and current.latitude is not None and destination.latitude is not None:
                lat, lon, progress = interpolate_position(current.latitude, current.longitude, destination.latitude, destination.longitude)
                simulated = True
                source = 'SIMULATED_DEMO_GPS'

            rows.append({
                'id': cargo.id,
                'cargo_code': cargo.cargo_code,
                'description': cargo.description,
                'shipment_status': cargo.shipment_status,
                'expedition_code': expedition.expedition_code if expedition else None,
                'from_location': current.name if current else None,
                'destination': destination.name if destination else cargo.receiver,
                'latitude': lat,
                'longitude': lon,
                'progress_percent': round(progress * 100, 1) if progress is not None else None,
                'speed_kmh': point.speed_kmh if point else None,
                'heading': point.heading if point else None,
                'updated_at': point.recorded_at.isoformat() if point else None,
                'tracking_source': source,
                'simulation': simulated,
                'note': 'Demo moving telemetry; connect a real GPS tracker through POST /api/live/gps.' if simulated else None
            })
        return jsonify({'success': True, 'updated_at_epoch': __import__('time').time(), 'tracking': rows})
    finally:
        db.close()


@app.get('/api/live/personnel-tracking')
def live_personnel_tracking():
    db = SessionLocal()
    try:
        locations = {x.id: x for x in db.query(Location).all()}
        rows = []
        for person in db.query(Personnel).order_by(Personnel.id.desc()).all():
            loc = locations.get(person.current_location_id)
            point = _latest_telemetry(db, 'PERSONNEL', person.id)
            rows.append({
                'id': person.id,
                'personnel_code': person.personnel_code,
                'name': person.name,
                'role': person.role,
                'location': loc.name if loc else None,
                'latitude': point.latitude if point else (loc.latitude if loc else None),
                'longitude': point.longitude if point else (loc.longitude if loc else None),
                'speed_kmh': point.speed_kmh if point else None,
                'heading': point.heading if point else None,
                'updated_at': point.recorded_at.isoformat() if point else None,
                'tracking_source': point.source if point else 'DATABASE_LOCATION',
            })
        return jsonify({'success': True, 'tracking': rows})
    finally:
        db.close()


@app.get('/api/live/operations')
def live_operations():
    """One dashboard payload for live weather, GPS, inventory, personnel,
    emergency, expedition and research information."""
    db = SessionLocal()
    try:
        locations = db.query(Location).all()
        weather = None
        weather_location = None
        for loc in locations:
            if loc.latitude is not None and loc.longitude is not None:
                weather_location = loc
                break
        if weather_location:
            try:
                weather = fetch_weather(weather_location.latitude, weather_location.longitude)
                weather['location_name'] = weather_location.name
            except RuntimeError as ex:
                weather = {'error': str(ex), 'location_name': weather_location.name}

        inventory = db.query(InventoryItem).all()
        personnel = db.query(Personnel).all()
        emergencies = db.query(Emergency).order_by(Emergency.id.desc()).all()
        expeditions = db.query(Expedition).order_by(Expedition.id.desc()).all()
        return jsonify({
            'success': True,
            'updated_at_epoch': __import__('time').time(),
            'weather': weather,
            'inventory': {
                'total_items': len(inventory),
                'shortages': sum(1 for i in inventory if (i.minimum_stock or 0) > 0 and (i.quantity or 0) < i.minimum_stock)
            },
            'personnel': {
                'total': len(personnel),
                'deployed': sum(1 for p in personnel if str(p.personnel_status or '').upper() == 'DEPLOYED')
            },
            'emergencies': {
                'open': sum(1 for e in emergencies if str(e.status or '').upper() not in {'RESOLVED', 'CLOSED'}),
                'critical': sum(1 for e in emergencies if str(e.severity or '').upper() == 'CRITICAL' and str(e.status or '').upper() not in {'RESOLVED', 'CLOSED'})
            },
            'expeditions': {
                'active': sum(1 for e in expeditions if str(e.status or '').upper() == 'ACTIVE'),
                'planned': sum(1 for e in expeditions if str(e.status or '').upper() == 'PLANNED')
            }
        })
    finally:
        db.close()



@app.get('/api/expeditions/<int:expedition_id>/live-planning')
def live_planning(expedition_id):
    db = SessionLocal()
    try:
        expedition = db.query(Expedition).filter(Expedition.id == expedition_id).first()
        if not expedition:
            return json_error('Expedition not found.', 404)
        locations = {x.id: x for x in db.query(Location).all()}
        destination = locations.get(expedition.destination_location_id)
        personnel_count = db.query(PersonnelAssignment).filter(PersonnelAssignment.expedition_id == expedition.id).count()
        cargo_count = db.query(Cargo).filter(Cargo.expedition_id == expedition.id).count()
        shortages = [
            i for i in db.query(InventoryItem).all()
            if (i.minimum_stock or 0) > 0 and (i.quantity or 0) < i.minimum_stock
        ]
        resources = db.query(Resource).filter(Resource.status.in_(['AVAILABLE', 'OPERATIONAL'])).count()
        weather = None
        recommendations = []
        if destination and destination.latitude is not None and destination.longitude is not None:
            try:
                weather = fetch_weather(destination.latitude, destination.longitude)
            except RuntimeError as ex:
                recommendations.append(str(ex))

        readiness = 100
        if personnel_count == 0:
            readiness -= 20
            recommendations.append('Assign expedition personnel before dispatch.')
        if cargo_count == 0:
            readiness -= 15
            recommendations.append('Attach required cargo manifests before dispatch.')
        if shortages:
            readiness -= min(30, len(shortages) * 10)
            recommendations.append(f'{len(shortages)} inventory item(s) are below minimum stock.')
        if resources == 0:
            readiness -= 15
            recommendations.append('No available operational resource is currently recorded.')

        if weather:
            current = weather.get('current') or {}
            wind = float(current.get('wind_speed_10m') or 0)
            visibility = float(current.get('visibility') or 999999)
            if wind >= 60:
                readiness -= 20
                recommendations.append('High wind: review the departure window.')
            elif wind >= 40:
                readiness -= 10
                recommendations.append('Elevated wind: review route timing.')
            if visibility < 5000:
                readiness -= 15
                recommendations.append('Reduced visibility: review field movement plan.')

        readiness = max(0, readiness)
        level = 'READY' if readiness >= 80 else 'REVIEW' if readiness >= 60 else 'HIGH ATTENTION'
        return jsonify({
            'success': True,
            'expedition': expedition_view(db, expedition),
            'readiness_score': readiness,
            'readiness_level': level,
            'destination': model_to_dict(destination) if destination else None,
            'weather': weather,
            'personnel_count': personnel_count,
            'cargo_count': cargo_count,
            'inventory_shortage_count': len(shortages),
            'available_resources': resources,
            'recommendations': recommendations,
            'planning_note': 'Operational planning aid only; not a safety certification.'
        })
    finally:
        db.close()

# ---------------- AI ASSISTANT ----------------
@app.get('/api/ai/history/<session_id>')
def ai_history(session_id):
    db=SessionLocal()
    try:
        rows=db.query(AIChatMessage).filter(AIChatMessage.session_id==session_id).order_by(AIChatMessage.id.asc()).all()
        return jsonify({'success':True,'data':[{'role':x.role,'text':x.text,'created_at':x.created_at.isoformat()} for x in rows]})
    finally: db.close()

@app.post('/api/ai/chat')
def ai_chat():
    """
    Local POLARIS AI-style assistant.
    Does not use OpenAI or any external AI service.
    """

    data = get_json()

    session_id = str(
        data.get('session_id') or ''
    ).strip()

    prompt = str(
        data.get('prompt') or ''
    ).strip()

    if not session_id or not prompt:
        return json_error(
            'session_id and prompt are required.'
        )

    db = SessionLocal()

    try:
        # Get previous conversation
        previous = (
            db.query(AIChatMessage)
            .filter(
                AIChatMessage.session_id == session_id
            )
            .order_by(AIChatMessage.id.asc())
            .all()[-20:]
        )

        # Save user message
        db.add(
            AIChatMessage(
                session_id=session_id,
                role='user',
                text=prompt,
                created_at=datetime.utcnow()
            )
        )

        db.commit()

        # ------------------------------------------------
        # LOCAL RESPONSE ENGINE
        # ------------------------------------------------

        p = prompt.lower()

        if any(word in p for word in [
            'weather',
            'temperature',
            'wind',
            'storm',
            'snow',
            'visibility'
        ]):

            answer = (
                "For weather-related operations, POLARIS "
                "should consider temperature, wind speed, "
                "visibility and current weather conditions. "
                "Check the Live Data Center for the latest "
                "available weather information before making "
                "operational decisions."
            )

        elif any(word in p for word in [
            'cargo',
            'shipment',
            'transport',
            'load'
        ]):

            answer = (
                "For cargo operations, verify cargo status, "
                "location, assigned expedition and transport "
                "conditions. POLARIS can centralize cargo "
                "tracking and operational status information."
            )

        elif any(word in p for word in [
            'inventory',
            'stock',
            'fuel',
            'diesel',
            'supplies'
        ]):

            answer = (
                "For inventory planning, check current stock "
                "against minimum stock levels. Items below "
                "their threshold should be prioritized for "
                "resupply. The diesel calculator can provide "
                "a local planning estimate without requiring "
                "an external AI service."
            )

        elif any(word in p for word in [
            'personnel',
            'employee',
            'team',
            'crew'
        ]):

            answer = (
                "For personnel operations, verify personnel "
                "location, assigned expedition, movement "
                "status and task assignments. Any unusual "
                "movement should be reviewed by the "
                "responsible expedition team."
            )

        elif any(word in p for word in [
            'emergency',
            'alert',
            'danger',
            'risk',
            'incident'
        ]):

            answer = (
                "For emergency operations, POLARIS can use "
                "risk information, alerts, personnel status, "
                "cargo status and location data to support "
                "operational awareness. Always follow official "
                "emergency and safety procedures."
            )

        elif any(word in p for word in [
            'gps',
            'location',
            'tracking',
            'coordinates'
        ]):

            answer = (
                "POLARIS supports GPS telemetry architecture. "
                "GPS data can contain latitude, longitude, "
                "speed and heading. The current demonstration "
                "can use simulated telemetry, while real GPS "
                "devices can be connected through the GPS API."
            )

        elif any(word in p for word in [
            'risk',
            'prediction',
            'machine learning',
            'ml'
        ]):

            answer = (
                "POLARIS uses a machine-learning-based "
                "operational risk estimate with LOW, MEDIUM "
                "and HIGH risk levels. The current prototype "
                "uses the project's trained ML pipeline. "
                "Results should be treated as operational "
                "decision support rather than a safety "
                "certification."
            )

        elif any(word in p for word in [
            'help',
            'what can you do',
            'capabilities'
        ]):

            answer = (
                "I can provide local operational guidance "
                "about weather, cargo, inventory, personnel, "
                "GPS tracking, emergencies and operational "
                "risk. I can also explain how POLARIS modules "
                "work."
            )

        else:

            answer = (
                "POLARIS is an integrated polar expedition "
                "operations platform. It provides centralized "
                "information for logistics, cargo, inventory, "
                "personnel, weather, GPS tracking, emergency "
                "response and operational risk. "
                "Please ask about one of these areas for "
                "more specific guidance."
            )

        # Save assistant response
        db.add(
            AIChatMessage(
                session_id=session_id,
                role='assistant',
                text=answer,
                created_at=datetime.utcnow()
            )
        )

        db.commit()

        return jsonify({
            'success': True,
            'data': {
                'role': 'assistant',
                'text': answer
            }
        })

    except Exception as ex:

        db.rollback()

        return json_error(
            str(ex),
            500
        )

    finally:

        db.close()
# ---------------- ML ----------------
@app.post('/api/expeditions/<int:expedition_id>/risk-analysis')
def risk_analysis(expedition_id):
    db=SessionLocal()
    try:
        e=db.query(Expedition).filter(Expedition.id==expedition_id).first()
        if not e:return json_error('Expedition not found.',404)
        try:
            from risk_mapping import build_ml_input_for_expedition
            import sys
            ml_dir=os.path.join(BASE_DIR,'polar_expedition_ml','ml')
            if ml_dir not in sys.path:sys.path.insert(0,ml_dir)
            from predict import predict_expedition_risk
            mapping=build_ml_input_for_expedition(db,expedition_id); result=predict_expedition_risk(mapping['features'])
            alert=create_risk_alert(db,e,result['risk_level'],result['risk_probability'])
            return jsonify({'success':True,'expedition_id':e.id,'risk_analysis_label':'ML-based operational risk estimate',**result,'data_mapping':mapping['data_mapping'],'additional_context':mapping['context'],'alert_created':model_to_dict(alert) if alert else None})
        except Exception as ex:return json_error(f'ML analysis failed: {ex}',500)
    finally:db.close()


def update_entity(model,obj_id,data,fields):
    db=SessionLocal()
    try:
        obj=db.query(model).filter(model.id==obj_id).first()
        if not obj:return json_error(f'{model.__name__} not found.',404)
        for f in fields:
            if f in data:
                v=data[f]
                if f in {'start_date','expected_end_date','actual_end_date','expected_arrival','actual_arrival','reported_time','resolved_time','movement_time'}: v=parse_dt(v)
                if f in {'status','shipment_status','availability_status','personnel_status','quality_status','category','severity'} and isinstance(v,str): v=v.upper()
                setattr(obj,f,v)
        db.commit(); db.refresh(obj)
        return jsonify({'success':True,'data':model_to_dict(obj)}),200
    except ValueError as e:
        db.rollback(); return json_error(str(e),400)
    except Exception as e:
        db.rollback(); return json_error(str(e),400)
    finally: db.close()


@app.route('/')
def index(): return send_from_directory(FRONTEND_BUILD, 'index.html')

@app.route('/employee')
@app.route('/employee/')
def employee_portal(): return send_from_directory(BASE_DIR, 'employee.html')

@app.route('/database-manager')
@app.route('/database-manager/')
def database_manager_portal(): return send_from_directory(BASE_DIR, 'database-manager.html')

@app.route('/live-data.html')
def live_data_portal(): return send_from_directory(BASE_DIR, 'live-data.html')
# Serve the React build. API routes are registered above and keep priority.
@app.route('/<path:filename>')
def static_files(filename):
    candidate = os.path.join(FRONTEND_BUILD, filename)
    if os.path.isfile(candidate):
        return send_from_directory(FRONTEND_BUILD, filename)
    if '.' not in os.path.basename(filename):
        return send_from_directory(FRONTEND_BUILD, 'index.html')
    return json_error('Resource not found.', 404)

@app.errorhandler(404)
def not_found(e): return json_error('Resource not found.',404)
@app.errorhandler(405)
def method_not_allowed(e): return json_error('Method not allowed.',405)
# ---------------- DIESEL CALCULATOR ----------------

@app.post('/api/diesel/calculate')
def calculate_diesel():
    """
    Local deterministic diesel consumption calculator.

    This does NOT use OpenAI or any external AI service.
    It provides a planning estimate based on user-supplied
    vehicle and camp consumption assumptions.
    """

    try:
        data = request.get_json(silent=True) or {}

        # Basic expedition inputs
        people = int(data.get('people', 0))
        days = int(data.get('days', 0))
        sledges = int(data.get('sledges', 0))
        skidoos = int(data.get('skidoos', 0))

        # Consumption assumptions
        skidoo_lph = float(data.get('skidoo_lph', 8.0))
        skidoo_hours_per_day = float(
            data.get('skidoo_hours_per_day', 6.0)
        )

        # Diesel used for camp/heating/generator planning
        camp_lpd_per_person = float(
            data.get('camp_lpd_per_person', 2.0)
        )

        # Safety/planning reserve
        reserve_percent = float(
            data.get('reserve_percent', 20.0)
        )

    except (TypeError, ValueError):
        return jsonify({
            'success': False,
            'error': 'All diesel calculator inputs must be numeric.'
        }), 400

    # ---------------- VALIDATION ----------------

    if people <= 0:
        return jsonify({
            'success': False,
            'error': 'People must be greater than zero.'
        }), 400

    if days <= 0:
        return jsonify({
            'success': False,
            'error': 'Days must be greater than zero.'
        }), 400

    if sledges < 0:
        return jsonify({
            'success': False,
            'error': 'Sledges cannot be negative.'
        }), 400

    if skidoos < 0:
        return jsonify({
            'success': False,
            'error': 'Skidoos cannot be negative.'
        }), 400

    if skidoo_lph < 0:
        return jsonify({
            'success': False,
            'error': 'Skidoo fuel consumption cannot be negative.'
        }), 400

    if skidoo_hours_per_day < 0:
        return jsonify({
            'success': False,
            'error': 'Skidoo operating hours cannot be negative.'
        }), 400

    if camp_lpd_per_person < 0:
        return jsonify({
            'success': False,
            'error': 'Camp diesel consumption cannot be negative.'
        }), 400

    if reserve_percent < 0:
        return jsonify({
            'success': False,
            'error': 'Reserve percentage cannot be negative.'
        }), 400

    # ---------------- SKIDOO CALCULATION ----------------

    # Litres consumed by all skidoos per day
    skidoo_daily_liters = (
        skidoos
        * skidoo_lph
        * skidoo_hours_per_day
    )

    # Total skidoo consumption
    skidoo_total_liters = (
        skidoo_daily_liters
        * days
    )

    # ---------------- CAMP / GENERATOR CALCULATION ----------------

    # Approximate camp diesel per day
    camp_daily_liters = (
        people
        * camp_lpd_per_person
    )

    # Total camp diesel
    camp_total_liters = (
        camp_daily_liters
        * days
    )

    # ---------------- BASE CONSUMPTION ----------------

    base_liters = (
        skidoo_total_liters
        + camp_total_liters
    )

    # ---------------- RESERVE ----------------

    reserve_liters = (
        base_liters
        * reserve_percent
        / 100
    )

    # ---------------- FINAL TOTAL ----------------

    total_liters = (
        base_liters
        + reserve_liters
    )

    # Approximate number of 200-litre drums
    drums_200l = total_liters / 200

    # ---------------- RESPONSE ----------------

    return jsonify({

        'success': True,

        'calculation_method': 'LOCAL_DETERMINISTIC',

        'inputs': {

            'people': people,

            'days': days,

            'sledges': sledges,

            'skidoos': skidoos,

            'skidoo_lph': skidoo_lph,

            'skidoo_hours_per_day': skidoo_hours_per_day,

            'camp_lpd_per_person': camp_lpd_per_person,

            'reserve_percent': reserve_percent
        },

        'results': {

            'skidoo_daily_liters': round(
                skidoo_daily_liters,
                2
            ),

            'skidoo_total_liters': round(
                skidoo_total_liters,
                2
            ),

            'camp_daily_liters': round(
                camp_daily_liters,
                2
            ),

            'camp_total_liters': round(
                camp_total_liters,
                2
            ),

            'base_liters': round(
                base_liters,
                2
            ),

            'reserve_liters': round(
                reserve_liters,
                2
            ),

            'total_liters': round(
                total_liters,
                2
            ),

            'approx_200l_drums': round(
                drums_200l,
                2
            )
        },

        'note': (
            'Planning estimate only. Actual fuel consumption '
            'depends on vehicle model, terrain, load, temperature, '
            'engine operating conditions, generator use, heating '
            'requirements and mission conditions.'
        )
    }) 
if __name__=='__main__':
    app.run(host='127.0.0.1',port=5000,debug=True)
