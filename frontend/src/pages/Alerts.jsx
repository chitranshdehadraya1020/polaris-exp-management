import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BellRing, ShieldAlert, Warehouse, Truck, CheckCheck, PackagePlus } from "lucide-react";

export default function Alerts() {
  const [incidents, setIncidents] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [cargo, setCargo] = useState([]);

  const load = async () => {
    const [i, inv, c] = await Promise.all([
      api.get("/incidents"), api.get("/inventory"), api.get("/cargo"),
    ]);
    setIncidents(i.data); setInventory(inv.data); setCargo(c.data);
  };
  useEffect(() => { load(); }, []);

  const openIncidents = useMemo(
    () => incidents.filter(i => i.status !== "resolved")
      .sort((a, b) => severityRank(b.severity) - severityRank(a.severity)),
    [incidents]
  );
  const lowStock = useMemo(
    () => inventory.filter(i => i.quantity <= i.threshold),
    [inventory]
  );
  const delayedCargo = useMemo(
    () => cargo.filter(c => c.status === "delayed"),
    [cargo]
  );

  const resolveIncident = async (i) => {
    await api.patch(`/incidents/${i.id}`, { status: "resolved" });
    toast.success(`${i.incident_code} resolved`);
    load();
  };

  const restock = async (item) => {
    const q = item.quantity + 10;
    await api.patch(`/inventory/${item.id}`, { quantity: q });
    toast.success(`${item.item_name} @ ${item.station} → ${q} ${item.unit}`);
    load();
  };

  const totalAlerts = openIncidents.length + lowStock.length + delayedCargo.length;

  return (
    <div className="p-4 md:p-8 space-y-8">
      <div>
        <div className="text-[10px] font-mono-tel uppercase tracking-widest text-slate-500">Module · 06</div>
        <h1 className="font-display text-2xl md:text-3xl font-bold flex items-center gap-2">
          <BellRing className="h-6 w-6 text-amber-400" /> Alerts & Notices
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          One place for active warnings, low-stock notices, and delayed shipments across the theatre.
        </p>
      </div>

      {totalAlerts === 0 && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-8 text-center text-emerald-300">
          All clear. No active alerts across any station.
        </div>
      )}

      {/* Open incidents */}
      {openIncidents.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-semibold flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-rose-400" /> Open Incidents
              <span className="font-mono-tel text-[10px] uppercase tracking-widest text-slate-500">· {openIncidents.length}</span>
            </h2>
            <Link to="/emergency" className="text-xs text-sky-400 hover:text-sky-300">Emergency Center →</Link>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {openIncidents.map(i => (
              <div key={i.id} className={`rounded-xl border p-5 bg-slate-950/70 ${
                i.severity === "critical" ? "border-rose-500/40" :
                i.severity === "high" ? "border-orange-500/40" : "border-slate-800"
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-mono-tel text-[10px] uppercase tracking-widest text-slate-500">{i.incident_code}</div>
                    <div className="font-semibold text-slate-100 mt-0.5">{i.location}</div>
                  </div>
                  <Badge variant="outline" className={`font-mono-tel text-[10px] uppercase ${
                    i.severity === "critical" ? "border-rose-500/50 text-rose-300" :
                    i.severity === "high" ? "border-orange-500/50 text-orange-300" :
                    i.severity === "medium" ? "border-amber-500/50 text-amber-300" :
                    "border-emerald-500/40 text-emerald-300"}`}>{i.severity}</Badge>
                </div>
                <div className="mt-3 text-sm text-slate-300">{i.description}</div>
                <div className="mt-3 text-xs font-mono-tel text-slate-500">
                  Reported by <span className="text-slate-300">{i.reported_by}</span>
                  {i.response_team && <> · Team <span className="text-slate-300">{i.response_team}</span></>}
                </div>
                <Button size="sm" variant="outline" className="mt-4 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
                  onClick={() => resolveIncident(i)}>
                  <CheckCheck className="h-3.5 w-3.5 mr-1" /> Mark Resolved
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Low stock */}
      {lowStock.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-semibold flex items-center gap-2">
              <Warehouse className="h-4 w-4 text-orange-400" /> Low Stock
              <span className="font-mono-tel text-[10px] uppercase tracking-widest text-slate-500">· {lowStock.length}</span>
            </h2>
            <Link to="/inventory" className="text-xs text-sky-400 hover:text-sky-300">Full inventory →</Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {lowStock.map(i => (
              <div key={i.id} className="rounded-xl border border-orange-500/30 bg-slate-950/70 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-mono-tel text-[10px] uppercase tracking-widest text-slate-500">{i.station} · {i.category}</div>
                    <div className="font-semibold text-slate-100 mt-0.5">{i.item_name}</div>
                  </div>
                  <Badge variant="outline" className="border-orange-500/50 text-orange-300 font-mono-tel text-[10px] uppercase">Low</Badge>
                </div>
                <div className="mt-3 font-mono-tel text-sm text-slate-300">
                  {i.quantity} {i.unit} <span className="text-slate-500">/ min {i.threshold}</span>
                </div>
                <Button size="sm" variant="outline" className="mt-3 border-slate-700 text-slate-200"
                  onClick={() => restock(i)}>
                  <PackagePlus className="h-3.5 w-3.5 mr-1" /> Restock +10
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Delayed cargo */}
      {delayedCargo.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-semibold flex items-center gap-2">
              <Truck className="h-4 w-4 text-sky-400" /> Delayed Cargo
              <span className="font-mono-tel text-[10px] uppercase tracking-widest text-slate-500">· {delayedCargo.length}</span>
            </h2>
            <Link to="/cargo" className="text-xs text-sky-400 hover:text-sky-300">Fleet manifest →</Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {delayedCargo.map(c => (
              <div key={c.id} className="rounded-xl border border-rose-500/30 bg-slate-950/70 p-4">
                <div className="font-mono-tel text-[10px] text-sky-300 uppercase tracking-widest">{c.manifest_id}</div>
                <div className="font-semibold text-slate-100 mt-0.5">{c.contents}</div>
                <div className="text-xs text-slate-400 mt-1">{c.vessel}</div>
                <div className="mt-3 text-xs font-mono-tel text-slate-500">{c.origin} → {c.destination} · ETA {c.eta}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function severityRank(s) {
  return { critical: 3, high: 2, medium: 1, low: 0 }[s] ?? 0;
}
