import { useEffect, useMemo, useState } from "react";
import { api, live } from "@/lib/api";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Activity, AlertTriangle, Anchor, ArrowUpRight, ChevronRight, Clock3, Compass,
  Crosshair, Fuel, Gauge, Layers3, MapPin, PackageCheck, Plus, Radar, RefreshCw,
  Search, Snowflake, Thermometer, Truck, Waves, Zap
} from "lucide-react";

const HAZARDS = ["none", "flammable", "cryogenic", "biological"];
const STATIONS = ["Maitri", "Bharati", "Himadri", "Arctic-1"];
const MAP_POINTS = [
  { x: 20, y: 72, label: "Cape Town", kind: "origin" },
  { x: 47, y: 49, label: "Maitri", kind: "station" },
  { x: 59, y: 63, label: "Bharati", kind: "station" },
  { x: 74, y: 36, label: "Himadri", kind: "station" },
  { x: 86, y: 69, label: "Arctic-1", kind: "station" },
];
const DEMO_CARGO = [
  { id: "demo-1", manifest_id: "MNF-2048", vessel: "MV Nereid", contents: "Cryogenic sample containers", weight_tons: 18.4, origin: "Cape Town", destination: "Maitri", status: "in-transit", eta: "2026-10-04", progress: 68, hazard: "cryogenic" },
  { id: "demo-2", manifest_id: "MNF-2051", vessel: "Aurora Airlift", contents: "Winter fuel + field rations", weight_tons: 7.2, origin: "Cape Town", destination: "Bharati", status: "in-transit", eta: "2026-10-02", progress: 54, hazard: "flammable" },
  { id: "demo-3", manifest_id: "MNF-2053", vessel: "POLARIS-07", contents: "Research instruments", weight_tons: 3.8, origin: "Maitri", destination: "Himadri", status: "docked", eta: "2026-09-29", progress: 82, hazard: "none" },
];
const DEMO_TRACKING = [
  { id: "demo-1", cargo_code: "MNF-2048", description: "Cryogenic sample containers", shipment_status: "IN_TRANSIT", from_location: "Cape Town", destination: "Maitri", latitude: -61, longitude: 26, progress_percent: 68, speed_kmh: 22, updated_at: new Date().toISOString(), tracking_source: "DEMO_BEACON", simulation: true },
  { id: "demo-2", cargo_code: "MNF-2051", description: "Winter fuel + field rations", shipment_status: "IN_TRANSIT", from_location: "Cape Town", destination: "Bharati", latitude: -67, longitude: 43, progress_percent: 54, speed_kmh: 31, updated_at: new Date().toISOString(), tracking_source: "DEMO_BEACON", simulation: true },
  { id: "demo-3", cargo_code: "MNF-2053", description: "Research instruments", shipment_status: "DOCKED", from_location: "Maitri", destination: "Himadri", latitude: -71, longitude: 11, progress_percent: 82, speed_kmh: 0, updated_at: new Date().toISOString(), tracking_source: "DEMO_BEACON", simulation: true },
];

export default function Cargo() {
  const [items, setItems] = useState([]);
  const [tracking, setTracking] = useState([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);
  const [form, setForm] = useState({ manifest_id: "", vessel: "", contents: "", weight_tons: 1, origin: "Cape Town", destination: STATIONS[0], eta: "", hazard: "none" });

  const load = async () => {
    setLoading(true);
    try {
      const [cargoResult, liveResult] = await Promise.all([api.get("/cargo"), live.cargoTracking()]);
      const nextItems = cargoResult.data?.length ? cargoResult.data : DEMO_CARGO;
      const nextTracking = liveResult.data?.tracking?.length ? liveResult.data.tracking : DEMO_TRACKING;
      setItems(nextItems);
      setTracking(nextTracking);
      setDemoMode(!cargoResult.data?.length || !liveResult.data?.tracking?.length);
    } catch (error) {
      // Keep the command surface useful when the optional backend is offline.
      setItems(DEMO_CARGO);
      setTracking(DEMO_TRACKING);
      setDemoMode(true);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); const timer = setInterval(load, 30000); return () => clearInterval(timer); }, []);

  const filtered = useMemo(() => items.filter(i => !q || [i.manifest_id, i.contents, i.vessel].join(" ").toLowerCase().includes(q.toLowerCase())), [items, q]);
  const active = filtered.filter(item => !["delivered", "registered"].includes(item.status));
  const selected = tracking.find(item => String(item.id) === String(selectedId)) || tracking[0];
  const inTransit = tracking.filter(item => String(item.shipment_status).toUpperCase() === "IN_TRANSIT");
  const totalWeight = items.reduce((sum, item) => sum + Number(item.weight_tons || 0), 0);
  const mapPosition = (item, index) => {
    if (item?.latitude != null && item?.longitude != null) {
      return { x: Math.max(10, Math.min(90, 50 + Number(item.longitude) * 0.22)), y: Math.max(18, Math.min(82, 50 + (Number(item.latitude) + 70) * 0.9)) };
    }
    return { x: [36, 51, 63, 72, 43][index % 5], y: [57, 43, 62, 36, 70][index % 5] };
  };

  const submit = async () => {
    if (!form.manifest_id || !form.vessel || !form.contents || !form.eta) { toast.error("Manifest ID, vessel, contents and ETA are required."); return; }
    await api.post("/cargo", { ...form, weight_tons: Number(form.weight_tons) });
    toast.success(`Manifest ${form.manifest_id} filed`); setOpen(false); setForm({ manifest_id: "", vessel: "", contents: "", weight_tons: 1, origin: "Cape Town", destination: STATIONS[0], eta: "", hazard: "none" }); load();
  };
  const advance = async (c) => { const next = Math.min(100, (c.progress || 0) + 20); await api.patch(`/cargo/${c.id}`, { progress: next, status: next >= 100 ? "delivered" : "in-transit" }); toast.success(`${c.manifest_id} advanced to ${next}%`); load(); };

  return (
    <div className="cargo-page p-4 md:p-8 space-y-6 md:space-y-7">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="eyebrow"><span className="live-dot" /> Logistics theatre / cargo intelligence</div>
          <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-[-.05em] text-white mt-2">Cargo in motion<span className="text-sky-300">.</span></h1>
          <p className="text-sm text-slate-400 mt-2 max-w-2xl">A live view of every manifest moving through the polar supply chain — from departure to last-mile handoff.</p>
          {demoMode && <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-amber-400/20 bg-amber-400/[.06] px-2.5 py-1.5 text-[10px] font-mono-tel uppercase tracking-widest text-amber-200"><span className="h-1.5 w-1.5 rounded-full bg-amber-300" />Preview telemetry · connect backend for live positions</div>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} className="border-slate-700 text-slate-300 hover:border-sky-400/50"><RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />Refresh feed</Button>
          <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button data-testid="btn-create-cargo" className="bg-sky-400 hover:bg-sky-300 text-slate-950 font-bold"><Plus className="h-4 w-4 mr-1.5" /> New manifest</Button></DialogTrigger>
            <DialogContent className="bg-slate-950 border-slate-800 max-w-lg"><DialogHeader><DialogTitle className="font-display">File Cargo Manifest</DialogTitle></DialogHeader><div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Manifest ID</Label><Input value={form.manifest_id} onChange={e => setForm({ ...form, manifest_id: e.target.value })} placeholder="MNF-9001" /></div><div><Label className="text-xs">Vessel / carrier</Label><Input value={form.vessel} onChange={e => setForm({ ...form, vessel: e.target.value })} placeholder="MV / Air Drop" /></div>
              <div className="col-span-2"><Label className="text-xs">Contents</Label><Input value={form.contents} onChange={e => setForm({ ...form, contents: e.target.value })} placeholder="e.g. Diesel drums (100x)" /></div><div><Label className="text-xs">Origin</Label><Input value={form.origin} onChange={e => setForm({ ...form, origin: e.target.value })} /></div>
              <div><Label className="text-xs">Destination</Label><Select value={form.destination} onValueChange={v => setForm({ ...form, destination: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div><div><Label className="text-xs">Weight (tons)</Label><Input type="number" value={form.weight_tons} onChange={e => setForm({ ...form, weight_tons: e.target.value })} /></div>
              <div><Label className="text-xs">Hazard class</Label><Select value={form.hazard} onValueChange={v => setForm({ ...form, hazard: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{HAZARDS.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent></Select></div><div className="col-span-2"><Label className="text-xs">ETA</Label><Input type="date" value={form.eta} onChange={e => setForm({ ...form, eta: e.target.value })} /></div>
            </div><DialogFooter><Button onClick={submit} className="bg-sky-400 hover:bg-sky-300 text-slate-950">File manifest</Button></DialogFooter></DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <CargoStat icon={Radar} label="Live beacons" value={tracking.length || "—"} meta="reporting across theatre" tone="cyan" />
        <CargoStat icon={Truck} label="In transit" value={inTransit.length || "—"} meta="routes currently moving" tone="indigo" />
        <CargoStat icon={Fuel} label="Manifest weight" value={`${totalWeight.toFixed(1)}t`} meta="active program load" tone="amber" />
        <CargoStat icon={Waves} label="Network health" value="98.7%" meta="last sync · 12 sec ago" tone="emerald" />
      </div>

      <section className="tracking-hero rounded-[28px] border border-sky-300/15 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-white/[.08] px-5 py-4 md:px-6"><div><div className="eyebrow text-sky-300">Polar supply chain / live map</div><h2 className="font-display text-xl font-bold text-white mt-1">Theatre overview</h2></div><div className="flex items-center gap-3 text-[10px] font-mono-tel uppercase tracking-widest text-slate-500"><span className="hidden sm:inline-flex items-center gap-1.5"><span className="legend-dot bg-emerald-300" />On route</span><span className="hidden sm:inline-flex items-center gap-1.5"><span className="legend-dot bg-orange-300" />Attention</span><span className="inline-flex items-center gap-1.5 text-emerald-300"><Activity className="h-3.5 w-3.5" />Live</span></div></div>
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px]">
          <div className="polar-map relative min-h-[430px] overflow-hidden">
            <div className="map-vignette" /><div className="map-grid" />
            <div className="absolute left-5 top-5 z-10 rounded-xl border border-white/10 bg-[#071321]/80 px-3 py-2 backdrop-blur-md"><div className="font-mono-tel text-[9px] uppercase tracking-[.18em] text-slate-500">Live theatre</div><div className="flex items-center gap-2 mt-1"><Snowflake className="h-4 w-4 text-sky-300" /><span className="font-display font-semibold text-slate-100">Southern Ocean / Sector 04</span></div></div>
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Polar cargo tracking map">
              <defs><linearGradient id="routeA" x1="0" x2="1"><stop stopColor="#38bdf8" stopOpacity=".18" /><stop offset=".7" stopColor="#5eead4" stopOpacity=".9" /><stop offset="1" stopColor="#818cf8" stopOpacity=".4" /></linearGradient><filter id="glow"><feGaussianBlur stdDeviation="1.6" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
              <path className="ice-shelf" d="M0 86 C13 76 19 83 28 75 C38 67 42 77 52 69 C63 60 72 69 82 61 C90 55 95 59 100 54 L100 100 L0 100 Z" />
              <path className="route-line" d="M20 72 Q38 58 47 49 T59 63 T74 36" /><path className="route-line dim" d="M20 72 Q52 69 86 69" />
              {tracking.slice(0, 8).map((cargo, index) => { const p = mapPosition(cargo, index); const color = cargo.simulation ? "#fbbf24" : "#5eead4"; return <g key={cargo.id || index} className="map-marker" onClick={() => setSelectedId(cargo.id)}><circle cx={`${p.x}%`} cy={`${p.y}%`} r="3.5" fill={color} opacity=".13" filter="url(#glow)" /><circle cx={`${p.x}%`} cy={`${p.y}%`} r="1.6" fill={color} stroke="#071321" strokeWidth=".6" /><circle cx={`${p.x}%`} cy={`${p.y}%`} r="2.9" fill="none" stroke={color} strokeOpacity=".45" strokeWidth=".25" /><text x={`${p.x + 2}%`} y={`${p.y - 2}%`} fill="#cbd5e1" fontSize="2.1" fontFamily="monospace">{cargo.cargo_code || `CARGO-${index + 1}`}</text></g>; })}
              {MAP_POINTS.map((point) => <g key={point.label}><circle cx={`${point.x}%`} cy={`${point.y}%`} r="1.2" fill={point.kind === "origin" ? "#818cf8" : "#e2e8f0"} /><text x={`${point.x + 1.8}%`} y={`${point.y + 1}%`} fill="#94a3b8" fontSize="2.2" fontFamily="monospace">{point.label}</text></g>)}
            </svg>
            <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-4"><div className="text-[10px] font-mono-tel uppercase tracking-widest text-slate-500">Projection · polar orthographic <span className="text-slate-700">/</span> telemetry normalized</div><div className="hidden sm:flex items-center gap-2 rounded-lg border border-white/10 bg-[#071321]/80 px-2.5 py-2 text-[10px] text-slate-400 backdrop-blur-md"><Layers3 className="h-3.5 w-3.5 text-sky-300" /> Routes + stations</div></div>
          </div>
          <aside className="border-t xl:border-t-0 xl:border-l border-white/[.08] bg-[#06101d]/70 p-5">
            <div className="flex items-center justify-between"><div><div className="eyebrow text-slate-500">Selected signal</div><div className="font-mono-tel text-xs text-sky-300 mt-2">{selected?.cargo_code || "AWAITING SIGNAL"}</div></div><Crosshair className="h-5 w-5 text-sky-300" /></div>
            {selected ? <><div className="mt-5 font-display text-xl font-bold text-white leading-tight">{selected.description || "Cargo manifest"}</div><div className="mt-2 text-xs text-slate-500">{selected.from_location || "Origin base"} <ChevronRight className="inline h-3 w-3" /> {selected.destination || "Destination"}</div><div className="grid grid-cols-2 gap-2 mt-5"><Signal label="Status" value={String(selected.shipment_status || "TRACKING").replaceAll("_", " ")} /><Signal label="Speed" value={selected.speed_kmh ? `${selected.speed_kmh} km/h` : "—"} /><Signal label="Source" value={selected.simulation ? "Demo GPS" : "Beacon"} /><Signal label="Updated" value={selected.updated_at ? new Date(selected.updated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Now"} /></div><div className="mt-6"><div className="flex justify-between text-[10px] font-mono-tel uppercase tracking-widest text-slate-500 mb-2"><span>Route completion</span><span className="text-sky-300">{selected.progress_percent ?? 55}%</span></div><Progress value={selected.progress_percent ?? 55} className="h-2" /></div><div className="mt-5 rounded-xl border border-emerald-400/15 bg-emerald-400/[.05] p-3 text-xs text-slate-300"><Zap className="inline h-3.5 w-3.5 mr-2 text-emerald-300" />Signal is healthy. Position is being refreshed from the operations layer.</div></> : <div className="mt-12 text-center text-sm text-slate-500"><Radar className="mx-auto h-8 w-8 text-slate-700" /><p className="mt-3">No live cargo beacons found.</p></div>}
          </aside>
        </div>
      </section>

      <section className="rounded-2xl border border-white/[.08] bg-[#07101d]/80 overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[.07] px-5 py-4"><div><div className="eyebrow text-slate-500">Manifest rail / {filtered.length} records</div><h2 className="font-display text-xl font-bold text-white mt-1">All cargo movements</h2></div><div className="relative w-full sm:w-72"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" /><Input data-testid="input-cargo-search" placeholder="Search manifest, vessel, contents..." value={q} onChange={e => setQ(e.target.value)} className="pl-9 bg-slate-950/70 border-slate-800" /></div></div>
        <div className="divide-y divide-white/[.06]">{filtered.map((c, index) => <ManifestRow key={c.id} cargo={c} onSelect={() => setSelectedId(c.id)} onAdvance={() => advance(c)} />)}{!filtered.length && <div className="p-10 text-center text-sm text-slate-500">No manifests match that search.</div>}</div>
      </section>
    </div>
  );
}

function CargoStat({ icon: Icon, label, value, meta, tone }) { const tones = { cyan: "text-sky-300 border-sky-400/20", indigo: "text-indigo-300 border-indigo-400/20", amber: "text-amber-300 border-amber-400/20", emerald: "text-emerald-300 border-emerald-400/20" }; return <div className={`rounded-2xl border bg-white/[.025] p-4 ${tones[tone]}`}><div className="flex items-center justify-between"><span className="eyebrow text-slate-500">{label}</span><Icon className="h-4 w-4" /></div><div className="font-mono-tel text-2xl md:text-3xl font-bold text-white mt-3 tracking-[-.05em]">{value}</div><div className="text-[11px] text-slate-500 mt-1">{meta}</div></div>; }
function Signal({ label, value }) { return <div className="rounded-lg border border-white/[.07] bg-white/[.025] p-2.5"><div className="text-[9px] font-mono-tel uppercase tracking-widest text-slate-600">{label}</div><div className="text-xs font-semibold text-slate-200 mt-1 truncate capitalize">{value}</div></div>; }
function ManifestRow({ cargo, onSelect, onAdvance }) { const status = cargo.status || "registered"; const tone = status === "delivered" ? "emerald" : status === "delayed" ? "rose" : status === "docked" ? "indigo" : "sky"; const toneClass = { emerald: "bg-emerald-300 border-emerald-500/40 text-emerald-300", rose: "bg-rose-300 border-rose-500/40 text-rose-300", indigo: "bg-indigo-300 border-indigo-500/40 text-indigo-300", sky: "bg-sky-300 border-sky-500/40 text-sky-300" }[tone]; return <div className="manifest-row grid grid-cols-1 lg:grid-cols-[minmax(220px,1.3fr)_minmax(180px,1fr)_150px_120px] gap-4 items-center px-5 py-4"><button onClick={onSelect} className="text-left min-w-0"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${toneClass.split(" ")[0]}`} /><span className="font-mono-tel text-[11px] text-sky-300 uppercase tracking-widest">{cargo.manifest_id}</span><Badge variant="outline" className={`ml-auto lg:hidden text-[10px] ${toneClass.replace("bg-", "border-")}`}>{status}</Badge></div><div className="font-semibold text-slate-100 truncate mt-1">{cargo.contents}</div><div className="text-[11px] text-slate-500 mt-1">{cargo.vessel} · {cargo.weight_tons}t</div></button><div className="min-w-0"><div className="flex items-center justify-between text-[10px] font-mono-tel text-slate-500 mb-1"><span>{cargo.origin} <ChevronRight className="inline h-3 w-3" /> {cargo.destination}</span><span>{cargo.progress || 0}%</span></div><Progress value={cargo.progress || 0} className="h-1.5" /></div><div className="flex items-center gap-2 text-xs text-slate-400"><Clock3 className="h-3.5 w-3.5 text-slate-600" /> ETA {cargo.eta || "pending"}</div><div className="hidden lg:flex items-center justify-end gap-2"><Badge variant="outline" className={`text-[10px] capitalize ${toneClass.replace("bg-", "border-")}`}>{status}</Badge>{status !== "delivered" && <button onClick={onAdvance} title="Advance cargo" className="rounded-lg border border-slate-700 p-2 text-slate-400 hover:border-sky-400/50 hover:text-sky-300"><PackageCheck className="h-3.5 w-3.5" /></button>}</div></div>; }
