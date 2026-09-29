import axios from "axios";

const BASE = process.env.REACT_APP_BACKEND_URL || "";
const http = axios.create({ baseURL: `${BASE}/api` });
const lower = (value, fallback = "") => String(value ?? fallback).toLowerCase();
const unwrap = (data) => (data && data.success && Object.prototype.hasOwnProperty.call(data, "data") ? data.data : data);
const iso = (value) => value ? String(value).slice(0, 10) : "";

function expeditionView(e) { const status = String(e.status || "PLANNED").toUpperCase(); return { ...e, code: e.expedition_code, lead: e.manager || "Unassigned", destination: e.destination_location_name || `Station ${e.destination_location_id || "—"}`, origin: e.origin_location_name || `Base ${e.origin_location_id || "—"}`, start_date: iso(e.start_date), end_date: iso(e.expected_end_date), status: lower(status, "planned"), crew_count: e.personnel_count || 0, risk_level: e.risk_level || "moderate", progress: status === "COMPLETED" ? 100 : status === "ACTIVE" ? 55 : 0 }; }
function cargoView(c) { const status = String(c.shipment_status || "REGISTERED").toUpperCase(); return { ...c, manifest_id: c.cargo_code, vessel: c.sender || "POLARIS logistics", contents: c.description || c.category || "Cargo manifest", weight_tons: Number(c.weight_kg || 0) / 1000, origin: c.sender || "Origin base", destination: c.receiver || "Destination station", current_location: c.current_location_name || "In transit", status: lower(status, "registered").replaceAll("_", "-"), eta: iso(c.expected_arrival), hazard: c.hazard || "none", progress: status === "DELIVERED" ? 100 : status === "IN_TRANSIT" ? 55 : 0 }; }
function inventoryView(i) { return { ...i, station: i.storage_location_name || (i.location_id ? `Location ${i.location_id}` : "Central Depot"), category: i.category || "General", item_name: i.item_name || i.name || i.inventory_code, quantity: Number(i.quantity || 0), unit: i.unit || "units", threshold: Number(i.minimum_stock || 0) }; }
function personnelView(p) { return { ...p, call_sign: p.personnel_code, role: p.role || p.department || "Field crew", station: p.department || "Polar station", medical_status: "cleared", heart_rate: 72, body_temp_c: 36.7, gps_beacon: "active" }; }
function incidentView(i) { return { ...i, incident_code: i.emergency_code, severity: lower(i.severity, "medium"), location: i.location_name || (i.location_id ? `Location ${i.location_id}` : "Unspecified sector"), description: i.description || i.emergency_type || "Operational incident", status: lower(i.status, "open"), reported_by: i.reported_by_name || i.reported_by || "POLARIS control", response_team: i.response_team || "Response team", emergency_type: i.emergency_type || "Operational incident" }; }
function mapRead(path, data) {
  if (path === "/overview") { const s = data.summary || {}; return { active_expeditions: s.active_expeditions || 0, total_expeditions: s.total_expeditions || 0, cargo_in_transit: s.cargo || 0, personnel_deployed: s.deployed_personnel || s.personnel || 0, critical_stock_items: s.inventory_shortages || 0, open_incidents: s.active_alerts || 0, stations: (data.tracking || []).map(x => x.name), utc: new Date().toISOString() }; }
  if (path === "/expeditions") return (Array.isArray(data) ? data : []).map(expeditionView);
  if (path === "/cargo") return (Array.isArray(data) ? data : []).map(cargoView);
  if (path === "/inventory") return (Array.isArray(data) ? data : []).map(inventoryView);
  if (path === "/personnel") return (Array.isArray(data) ? data : []).map(personnelView);
  if (path === "/incidents" || path === "/emergencies") return (Array.isArray(data) ? data : []).map(incidentView);
  return data;
}
function mapPayload(path, payload) {
  if (path === "/expeditions") return { expedition_code: payload.code, name: payload.name, manager: payload.lead, objective: payload.notes, status: String(payload.status || "planned").toUpperCase(), start_date: payload.start_date, expected_end_date: payload.end_date, origin_location_id: payload.origin_location_id, destination_location_id: payload.destination_location_id };
  if (path === "/cargo") return { cargo_code: payload.manifest_id, description: payload.contents, category: payload.hazard || "EXPEDITION CARGO", quantity: Number(payload.quantity || 1), unit: payload.unit || "manifest", weight_kg: Number(payload.weight_tons || 0) * 1000, sender: payload.vessel || payload.origin, receiver: payload.destination, expedition_id: payload.expedition_id, shipment_status: String(payload.status || "registered").toUpperCase().replaceAll("-", "_"), expected_arrival: payload.eta };
  if (path === "/inventory") return { item_code: payload.item_code || `INV-${Date.now()}`, name: payload.item_name, category: payload.category, quantity: Number(payload.quantity || 0), unit: payload.unit, minimum_stock: Number(payload.threshold || 0), storage_location_name: payload.storage_location_name || payload.station };
  if (path === "/personnel") return { personnel_code: payload.personnel_code || payload.call_sign, name: payload.name, role: payload.role, department: payload.department || payload.station, current_location_id: payload.current_location_id || null, personnel_status: payload.personnel_status || "ACTIVE", availability_status: payload.availability_status || "AVAILABLE", contact: payload.contact || "" };
  if (path === "/incidents" || path === "/emergencies") return { emergency_code: payload.incident_code, emergency_type: payload.emergency_type || "Operational incident", severity: String(payload.severity || "medium").toUpperCase(), description: payload.description, location_name: payload.location, reported_by_name: payload.reported_by, status: String(payload.status || "open").toUpperCase() };
  return payload;
}
async function request(method, path, payload) {
  const resource = path.split("/").filter(Boolean)[0]; let target = path; let body = payload;
  if (resource === "incidents") target = path.replace("/incidents", "/emergencies");
  if (method === "get" && path === "/overview") target = "/dashboard";
  if (method === "patch") { const id = path.split("/").filter(Boolean).pop(); target = `/${resource === "incidents" ? "emergencies" : resource}/${id}`; body = resource === "incidents" ? { status: String(payload.status || "open").toUpperCase(), resolved_time: payload.status === "resolved" ? new Date().toISOString() : undefined } : resource === "inventory" ? { quantity: payload.quantity } : resource === "expeditions" ? { status: String(payload.status || "planned").toUpperCase() } : { shipment_status: String(payload.status || "registered").toUpperCase().replaceAll("-", "_") }; method = "put"; }
  if (method === "post" && path === `/${resource}`) body = mapPayload(`/${resource}`, body);
  try { const response = await http({ method, url: target, data: body }); return { ...response, data: mapRead(path, unwrap(response.data)) }; }
  catch (error) { throw new Error(error.response?.data?.error || error.response?.data?.message || error.message); }
}
export const BACKEND_URL = BASE || window.location.origin;
export const API = `${BACKEND_URL}/api`;
export const api = { get: path => request("get", path), post: (path, data) => request("post", path, data), put: (path, data) => request("put", path, data), patch: (path, data) => request("patch", path, data), delete: path => request("delete", path) };
export async function streamChat(sessionId, message, onDelta) {
  const result = await request("post", "/ai/chat", { session_id: sessionId, prompt: message });
  onDelta(result.data?.text || "No response returned.");
}


export const live = {
  weather: (latitude, longitude) => request("get", `/live/weather?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}`),
  operations: () => request("get", "/live/operations"),
  cargoTracking: () => request("get", "/live/cargo-tracking"),
  personnelTracking: () => request("get", "/live/personnel-tracking"),
  researchUpdates: () => request("get", "/live/research-updates"),
  positions: () => request("get", "/live/positions"),
  pushGps: (payload) => request("post", "/live/gps", payload),
};

// Two-way communication (field <-> command center), also used for SOS threads.
export const messages = {
  list: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")).toString();
    return request("get", `/messages${qs ? `?${qs}` : ""}`);
  },
  send: (payload) => request("post", "/messages", payload),
  markRead: (id) => request("put", `/messages/${id}/read`),
};

// Inventory category breakdown (predefined + live counts).
export const inventoryCategories = { list: () => request("get", "/inventory/categories") };

export const intelligence = {
  snapshot: expeditionId => request("get", `/intelligence/expeditions/${expeditionId}`),
  scenario: payload => request("post", "/intelligence/scenario", payload),
  recommendPersonnel: payload => request("post", "/intelligence/recommend-personnel", payload),
  riskAnalysis: expeditionId => request("post", `/expeditions/${expeditionId}/risk-analysis`),
};
