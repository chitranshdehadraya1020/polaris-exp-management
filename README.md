# POLAR – Expedition Operations Management

A Flask + SQLite + JavaScript expedition operations prototype for the SIH problem statement covering expedition planning, cargo, inventory, personnel, assets/resources, tracking, emergency response, alerts and ML-based operational risk assessment.

## Run on Windows

Open PowerShell in this folder:

```powershell
python -m venv venv
venv\Scripts\activate
python -m pip install -r requirements.txt
python create_database.py
python seed.py
python run.py
```

Open `http://127.0.0.1:5000`.

## Important

- The frontend and API are served by the same Flask application, so JavaScript uses relative `/api/...` URLs.
- Dashboard numbers are calculated from the database.
- Inventory shortage alerts are created only when an item is below its minimum stock.
- Emergency alerts are created when an emergency is reported.
- The ML model in `polar_expedition_ml/ml/models/risk_model.pkl` is reused; it is not retrained by the web app.
- Tracking displays recorded coordinates and does not claim to be live GPS.
- `seed.py` adds internally consistent demonstration records only when the database is empty.

## Polished React frontend

The repository now includes the polished POLARIS React frontend in `frontend/`. The Flask app serves `frontend/build/` at `/`, while the React API adapter maps the UI to the existing SQLite endpoints. To rebuild after frontend changes:

```bash
cd frontend
npm install --legacy-peer-deps
npm run build
cd ..
python run.py
```

Open `http://127.0.0.1:5000`. The existing database, CRUD APIs, alerts, and ML risk-analysis routes remain in place.

## Completed emergency workflow

The Emergency Response Center now supports incident creation, a clearly labeled Global SOS drill, severity and incident-type capture, location and reporter details, response-team dispatch, `RESPONDING` status updates, resolution timestamps, and an auditable emergency update endpoint at `/api/emergencies/<id>/updates`. Every new emergency creates an alert in the SQLite database.

The seed script is idempotent and includes realistic Antarctic and Arctic stations, active/planned/completed expeditions, logistics manifests, fuel/ration/medical/communications stock, deployed personnel, operational assets, two sample incidents, and derived alerts. Run `python seed.py` again safely to add any missing sample records without duplicating existing records.


## Live Data Center

This version adds a live operations layer at `http://127.0.0.1:5000/live-data.html`.

It provides:
- Live weather and short forecast data through Open-Meteo.
- Cargo GPS telemetry. `IN_TRANSIT` cargo gets clearly labelled simulated demo movement until a real tracker sends coordinates.
- Real GPS ingestion endpoint: `POST /api/live/gps`.
- Personnel location telemetry through stored location data or GPS points.
- Live inventory, personnel, expedition and emergency counts.
- Live polar research updates from the NSF News RSS feed, filtered for polar/research topics.
- Expedition live-readiness endpoint: `GET /api/expeditions/<id>/live-planning`.

### Real GPS payload

```json
{
  "entity_type": "CARGO",
  "entity_id": 1,
  "latitude": -70.769,
  "longitude": 11.736,
  "speed_kmh": 18,
  "heading": 42,
  "source": "GPS"
}
```

Send that payload to `POST /api/live/gps`. The latest point is persisted in the new `live_telemetry` table.

### Important

Weather is live external data. GPS is only genuinely live when a real tracker/mobile device posts telemetry; otherwise the dashboard uses database coordinates or an explicitly labelled simulated demo position. Research updates are fetched live from the official NSF news RSS feed. These external services require internet access.

## Two-way communication, two-way GPS and SOS threads (new)

- **Messages / Communications** — `GET/POST /api/messages`, `PUT /api/messages/<id>/read`. A shared thread between field personnel and Mission Control, filterable by `channel` (OPS, MEDICAL, LOGISTICS, EMERGENCY), `emergency_id`, or `personnel_id`. Sending a message with `"priority":"SOS"` also raises a CRITICAL alert. UI: the new **Communications** page in the sidebar.
- **Two-way GPS** — in addition to `POST /api/live/gps`, there is now `GET /api/live/gps/<entity_type>/<entity_id>` (pull back one entity's last known point) and `GET /api/live/positions` (latest point for every entity). The Live Data page has a **"Start sharing my GPS"** control that uses the browser's real `navigator.geolocation` API to push a device's live position and immediately reads it back, proving the round trip.
- **SOS, made two-way** — every incident in the Emergency Response Center now has an expandable **"Two-way SOS thread"** (backed by the same Messages API, filtered by `related_emergency_id`), so the field can report and command can reply on the same incident.
- **Inventory categories** — `GET /api/inventory/categories` returns live counts and low-stock counts merged with a standard category list; the Inventory page now has a category filter alongside the station filter.

## Rebuilding the frontend from this zip

`frontend/node_modules` is intentionally **not** included (it's large and regenerable). The `frontend/build` folder *is* included and pre-built, so `python run.py` works immediately without Node at all. Only rebuild if you change frontend source:

```bash
cd frontend
npm install --legacy-peer-deps
npm run build
cd ..
python run.py
```

Note: the original `package.json` referenced two packages hosted at `assets.emergent.sh` (an unrelated build-preview tool, not used anywhere in the app code) which are not publicly installable; they have been removed so `npm install` succeeds from a clean checkout.

## Employee Field Portal + Database Manager

The project now includes two connected web surfaces backed by the same Flask API and SQLite database:

- `http://127.0.0.1:5000/employee` — field employee portal for employee login, GPS sharing, two-way messages, assigned expeditions and SOS.
- `http://127.0.0.1:5000/database-manager` — database-management utility for dynamic inventory categories and provisioning employee portal accounts.

### Employee flow

1. Database manager provisions an employee account against a Personnel record.
2. Employee signs in at `/employee`.
3. Browser GPS is periodically sent to `/api/employee/gps` and stored in `live_telemetry` as `PERSONNEL` telemetry.
4. Messages are stored in `messages` and can be addressed to Command or a particular personnel record.
5. SOS creates a CRITICAL Emergency, a linked SOS message and an emergency alert. Current GPS is stored when browser location is available.
6. Command/operations can read the same messages and emergency records from the main POLAR application.

### Dynamic inventory categories

Inventory categories are now stored in the `inventory_categories` table. Existing inventory categories are preserved automatically. Database managers can add new categories without changing frontend source code. Inventory items may use any category accepted by the API.

### Frontend source build

If the React frontend source is changed and you want those source changes reflected in `frontend/build`, run from `frontend`:

```powershell
npm install
npm run build
```

The standalone Employee and Database Manager pages do not require a React rebuild.

## Expedition Intelligence (new)

The React command center now includes `/intelligence`, a decision-support layer for active missions:

- **Expedition Digital Twin** — a readiness score backed by personnel, cargo, food, fuel, medical, weather, overdue-task and emergency signals.
- **Run Scenario** — simulates a +30% wind event and shows the modeled cascade through travel delay, fuel use, food reserve and readiness.
- **Dynamic Route Risk Engine** — explainable route exposure with visible contributions for weather, wind, visibility, previous incidents, cargo hazard and distance.
- **AI-assisted Task & Team Assignment** — ranks personnel using skill match, distance, availability and workload, with an action to create the recommended task assignment.

The feature is implemented through `GET /api/intelligence/expeditions/<id>`, `POST /api/intelligence/scenario`, and `POST /api/intelligence/recommend-personnel`. These calculations are transparent decision support and should be reviewed by mission command before real-world operational decisions.
