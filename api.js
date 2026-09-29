/*
 * api.js
 * -------
 * Connects the existing dashboard (index.html / polar.js) to the real
 * Flask backend. Loaded AFTER polar.js, so functions defined here (like
 * viewExpedition) intentionally override the static/demo versions in
 * polar.js. This file does not modify polar.js -- it replaces the pieces
 * that were hardcoded demo data with real fetch() calls.
 */

const API_BASE = "";  // same-origin: Flask serves both frontend and API

async function apiFetch(url, options = {}) {
    const opts = {
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        ...options,
    };
    const res = await fetch(API_BASE + url, opts);
    let body = null;
    try { body = await res.json(); } catch (e) { /* no JSON body */ }
    if (!res.ok) {
        const message = (body && body.error) ? body.error : `Request failed (${res.status})`;
        throw new Error(message);
    }
    return body;
}

// ---------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------
async function loadDashboardSummary() {
    try {
        const data = await apiFetch("/api/dashboard/summary");
        setText("statActiveExpeditions", pad2(data.expeditions.active));
        setText("statPersonnel", data.personnel.total);
        setText("statAssets", data.assets.total);
        setText("statAlerts", pad2(data.alerts.unread));
        return data;
    } catch (e) {
        console.error("Failed to load dashboard summary:", e.message);
    }
}

function pad2(n) {
    return n < 10 ? "0" + n : String(n);
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

// ---------------------------------------------------------------------
// Expeditions
// ---------------------------------------------------------------------
function statusBadgeClass(status) {
    const map = { ACTIVE: "active", PLANNED: "planning", COMPLETED: "completed", CANCELLED: "completed" };
    return map[(status || "").toUpperCase()] || "planning";
}

function formatDate(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    if (isNaN(d)) return "-";
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

async function loadExpeditionsTable() {
    const table = document.getElementById("expeditionTable");
    if (!table) return;
    const tbody = table.querySelector("tbody");
    if (!tbody) return;

    try {
        const expeditions = await apiFetch("/api/expeditions");
        tbody.innerHTML = "";
        if (expeditions.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6">No expeditions yet.</td></tr>`;
            return;
        }
        expeditions.forEach((exp) => {
            const tr = document.createElement("tr");
            tr.setAttribute("data-status", exp.status || "");
            tr.style.cursor = "pointer";
            tr.innerHTML = `
                <td>${escapeHTML(exp.expedition_code)}</td>
                <td>${escapeHTML(exp.name)}</td>
                <td>${escapeHTML(exp.manager || "-")}</td>
                <td>${escapeHTML(exp.manager || "-")}</td>
                <td>${formatDate(exp.start_date)}</td>
                <td><span class="status ${statusBadgeClass(exp.status)}">${escapeHTML(exp.status || "-")}</span></td>
            `;
            tr.addEventListener("click", () => viewExpedition(exp.id));
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error("Failed to load expeditions:", e.message);
        tbody.innerHTML = `<tr><td colspan="6">Could not load expeditions: ${escapeHTML(e.message)}</td></tr>`;
    }
}

// Overrides polar.js's hardcoded-data version of viewExpedition. Loads
// the real expedition record, and lets the user trigger the EXISTING ML
// model's risk analysis on demand.
async function viewExpedition(id) {
    let expedition;
    try {
        expedition = await apiFetch(`/api/expeditions/${id}`);
    } catch (e) {
        showToast("Expedition not found.", "error");
        return;
    }

    createModal(`
        <div class="space-y-5">
            <div>
                <p class="text-cyan-400 text-sm font-semibold">${escapeHTML(expedition.expedition_code)}</p>
                <h2 class="text-2xl font-bold mt-1">${escapeHTML(expedition.name)}</h2>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="bg-slate-800 p-4 rounded-xl">
                    <p class="text-slate-400 text-xs">Manager</p>
                    <p class="mt-1 font-semibold">${escapeHTML(expedition.manager || "-")}</p>
                </div>
                <div class="bg-slate-800 p-4 rounded-xl">
                    <p class="text-slate-400 text-xs">Status</p>
                    <p class="mt-1 font-semibold">${escapeHTML(expedition.status || "-")}</p>
                </div>
                <div class="bg-slate-800 p-4 rounded-xl">
                    <p class="text-slate-400 text-xs">Start Date</p>
                    <p class="mt-1 font-semibold">${formatDate(expedition.start_date)}</p>
                </div>
                <div class="bg-slate-800 p-4 rounded-xl">
                    <p class="text-slate-400 text-xs">Expected End</p>
                    <p class="mt-1 font-semibold">${formatDate(expedition.expected_end_date)}</p>
                </div>
            </div>

            <div class="bg-slate-800 p-4 rounded-xl">
                <p class="text-slate-400 text-xs">Objective</p>
                <p class="mt-1">${escapeHTML(expedition.objective || "-")}</p>
            </div>

            <button id="runRiskAnalysisBtn" class="primary-button w-full">
                Run ML Risk Analysis
            </button>
            <div id="riskAnalysisResult"></div>
        </div>
    `);

    const btn = document.getElementById("runRiskAnalysisBtn");
    if (btn) {
        btn.addEventListener("click", () => runRiskAnalysis(expedition.id));
    }
}

async function runRiskAnalysis(expeditionId) {
    const resultBox = document.getElementById("riskAnalysisResult");
    if (resultBox) resultBox.innerHTML = `<p class="text-slate-400 text-sm mt-2">Running risk analysis...</p>`;

    try {
        const result = await apiFetch(`/api/expeditions/${expeditionId}/risk-analysis`, { method: "POST" });
        const levelColor = { LOW: "text-green-400", MEDIUM: "text-yellow-400", HIGH: "text-red-400" };
        const color = levelColor[result.risk_level] || "text-slate-300";

        const factors = (result.contributing_factors || []).map(f => `<li>${escapeHTML(f)}</li>`).join("");
        const warnings = (result.ml_input_warnings || []);
        const warningsHtml = warnings.length
            ? `<p class="text-xs text-amber-400 mt-2">${warnings.length} input(s) unavailable in current data and estimated by the model (see console for details).</p>`
            : "";
        if (warnings.length) console.info("ML input warnings:", warnings);

        if (resultBox) {
            resultBox.innerHTML = `
                <div class="bg-slate-800 p-4 rounded-xl mt-2">
                    <p class="text-slate-400 text-xs">${escapeHTML(result.risk_analysis_label)}</p>
                    <p class="mt-1 text-xl font-bold ${color}">${escapeHTML(result.risk_level)}
                        <span class="text-sm font-normal text-slate-400">(${(result.risk_probability * 100).toFixed(0)}% confidence)</span>
                    </p>
                    <p class="text-slate-400 text-xs mt-3">Contributing factors</p>
                    <ul class="list-disc list-inside text-sm">${factors || "<li>None flagged</li>"}</ul>
                    <p class="text-slate-400 text-xs mt-3">Recommendation</p>
                    <p class="text-sm">${escapeHTML(result.recommendation)}</p>
                    ${warningsHtml}
                    <p class="text-xs text-slate-500 mt-3">${escapeHTML(result.model_disclaimer)}</p>
                </div>
            `;
        }
        loadDashboardSummary();
        loadAlertsPage();
    } catch (e) {
        if (resultBox) resultBox.innerHTML = `<p class="text-red-400 text-sm mt-2">Risk analysis failed: ${escapeHTML(e.message)}</p>`;
    }
}

function escapeHTML(str) {
    if (str === null || str === undefined) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------
// Personnel / Live Tracking / Alerts -- pages that didn't exist yet
// ---------------------------------------------------------------------
function ensurePageExists(pageId, titleHtml) {
    if (document.getElementById(pageId)) return document.getElementById(pageId);
    const main = document.querySelector(".page")?.parentElement;
    if (!main) return null;
    const div = document.createElement("div");
    div.id = pageId;
    div.className = "page hidden";
    div.innerHTML = titleHtml;
    main.appendChild(div);
    return div;
}

async function loadPersonnelPage() {
    const page = ensurePageExists("personnel", `
        <div class="page-heading">
            <div><h1>Personnel Management</h1><p>Track team members across expeditions and stations</p></div>
        </div>
        <div class="table-container">
            <table id="personnelTable">
                <thead><tr><th>Code</th><th>Name</th><th>Role</th><th>Department</th><th>Status</th><th>Availability</th></tr></thead>
                <tbody></tbody>
            </table>
        </div>
    `);
    if (!page) return;
    const tbody = page.querySelector("tbody");
    try {
        const personnel = await apiFetch("/api/personnel");
        tbody.innerHTML = personnel.map(p => `
            <tr>
                <td>${escapeHTML(p.personnel_code)}</td>
                <td>${escapeHTML(p.name)}</td>
                <td>${escapeHTML(p.role || "-")}</td>
                <td>${escapeHTML(p.department || "-")}</td>
                <td><span class="status ${p.personnel_status === "ACTIVE" ? "active" : "planning"}">${escapeHTML(p.personnel_status || "-")}</span></td>
                <td>${escapeHTML(p.availability_status || "-")}</td>
            </tr>
        `).join("") || `<tr><td colspan="6">No personnel records yet.</td></tr>`;
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="6">Could not load personnel: ${escapeHTML(e.message)}</td></tr>`;
    }
}

async function loadTrackingPage() {
    const page = ensurePageExists("tracking", `
        <div class="page-heading">
            <div><h1>Live Tracking</h1><p>Personnel movement status and anomalies</p></div>
        </div>
        <div class="table-container">
            <table id="movementTable">
                <thead><tr><th>Personnel ID</th><th>From</th><th>To</th><th>Time</th><th>Status</th></tr></thead>
                <tbody></tbody>
            </table>
        </div>
    `);
    if (!page) return;
    const tbody = page.querySelector("tbody");
    try {
        const movements = await apiFetch("/api/movements");
        tbody.innerHTML = movements.map(m => `
            <tr>
                <td>${escapeHTML(m.personnel_id)}</td>
                <td>${escapeHTML(m.from_location_id ?? "-")}</td>
                <td>${escapeHTML(m.to_location_id ?? "-")}</td>
                <td>${formatDate(m.movement_time)}</td>
                <td><span class="status ${m.movement_status === "COMPLETED" ? "active" : "completed"}">${escapeHTML(m.movement_status || "-")}</span></td>
            </tr>
        `).join("") || `<tr><td colspan="5">No movement records yet.</td></tr>`;
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="5">Could not load movements: ${escapeHTML(e.message)}</td></tr>`;
    }
}

async function loadAlertsPage() {
    const page = ensurePageExists("alerts", `
        <div class="page-heading">
            <div><h1>Alerts</h1><p>Inventory, movement, emergency, and risk alerts</p></div>
        </div>
        <div class="table-container">
            <table id="alertsTable">
                <thead><tr><th>Type</th><th>Severity</th><th>Message</th><th>Created</th><th>Status</th></tr></thead>
                <tbody></tbody>
            </table>
        </div>
    `);
    if (!page) return;
    const tbody = page.querySelector("tbody");
    try {
        const alerts = await apiFetch("/api/alerts");
        tbody.innerHTML = alerts.map(a => `
            <tr style="cursor:pointer" data-id="${a.id}">
                <td>${escapeHTML(a.alert_type)}</td>
                <td>${escapeHTML(a.severity)}</td>
                <td>${escapeHTML(a.message)}</td>
                <td>${formatDate(a.created_at)}</td>
                <td>${a.is_read ? "Read" : '<strong>Unread</strong>'}</td>
            </tr>
        `).join("") || `<tr><td colspan="5">No alerts yet.</td></tr>`;
        tbody.querySelectorAll("tr[data-id]").forEach(row => {
            row.addEventListener("click", async () => {
                await apiFetch(`/api/alerts/${row.dataset.id}/read`, { method: "PUT" });
                loadAlertsPage();
                loadDashboardSummary();
            });
        });
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="5">Could not load alerts: ${escapeHTML(e.message)}</td></tr>`;
    }
}

// ---------------------------------------------------------------------
// Wire up sidebar nav for the newly-added pages (buttons already exist
// in index.html and call showPage('personnel'|'tracking'|'alerts'),
// they just had no page to show -- this hooks data loading into that
// existing showPage() flow from polar.js).
// ---------------------------------------------------------------------
const _originalShowPage = window.showPage;
window.showPage = function (pageId, button = null) {
    if (pageId === "personnel") loadPersonnelPage();
    if (pageId === "tracking") loadTrackingPage();
    if (pageId === "alerts") loadAlertsPage();
    if (pageId === "dashboard") loadDashboardSummary();
    if (pageId === "expeditions") loadExpeditionsTable();
    return _originalShowPage(pageId, button);
};

document.addEventListener("DOMContentLoaded", () => {
    loadDashboardSummary();
    loadExpeditionsTable();
});
