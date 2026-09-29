import { useEffect, useRef, useState } from "react";
import { live } from "@/lib/api";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, CloudSnow, Navigation, Package, Users, ShieldAlert, FlaskConical, MapPin, Satellite, PlayCircle, StopCircle } from "lucide-react";

function Weather({ data }) {
  const w = data?.weather;
  if (!w || w.error) return <div className="text-sm text-slate-500">Weather feed unavailable right now.</div>;
  const c = w.current || {};
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div className="rounded-lg border border-slate-800 p-3"><div className="text-[10px] text-slate-500 uppercase">Temperature</div><div className="text-xl font-bold text-sky-300">{c.temperature_2m ?? "—"} °C</div></div>
      <div className="rounded-lg border border-slate-800 p-3"><div className="text-[10px] text-slate-500 uppercase">Wind</div><div className="text-xl font-bold">{c.wind_speed_10m ?? "—"} km/h</div></div>
      <div className="rounded-lg border border-slate-800 p-3"><div className="text-[10px] text-slate-500 uppercase">Visibility</div><div className="text-xl font-bold">{c.visibility != null ? `${(c.visibility/1000).toFixed(1)} km` : "—"}</div></div>
      <div className="rounded-lg border border-slate-800 p-3"><div className="text-[10px] text-slate-500 uppercase">Precipitation</div><div className="text-xl font-bold">{c.precipitation ?? "—"} mm</div></div>
    </div>
  );
}

export default function LiveOperations() {
  const [ops, setOps] = useState(null);
  const [cargo, setCargo] = useState([]);
  const [people, setPeople] = useState([]);
  const [research, setResearch] = useState([]);
  const [loading, setLoading] = useState(true);
  const [last, setLast] = useState(null);

  const [entityId, setEntityId] = useState("1");
  const [sharing, setSharing] = useState(false);
  const [selfPos, setSelfPos] = useState(null);
  const watchIdRef = useRef(null);

  const load = async () => {
    try {
      const [o, c, p, r] = await Promise.all([
        live.operations(), live.cargoTracking(), live.personnelTracking(), live.researchUpdates()
      ]);
      setOps(o.data);
      setCargo(c.data?.tracking || []);
      setPeople(p.data?.tracking || []);
      setResearch(r.data?.items || []);
      setLast(new Date());
    } catch (e) {
      console.error(e);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => () => { if (watchIdRef.current != null) navigator.geolocation?.clearWatch(watchIdRef.current); }, []);

  const pushPosition = async (pos) => {
    const { latitude, longitude, speed, heading } = pos.coords;
    try {
      await live.pushGps({ entity_type: "PERSONNEL", entity_id: Number(entityId) || 1, latitude, longitude, speed_kmh: speed != null ? Math.round(speed * 3.6) : undefined, heading: heading ?? undefined, source: "DEVICE_GPS" });
      setSelfPos({ latitude, longitude, at: new Date() });
    } catch (e) { toast.error(`GPS push failed: ${e.message}`); }
  };

  const startSharing = () => {
    if (!navigator.geolocation) { toast.error("This browser does not support GPS/geolocation."); return; }
    const id = navigator.geolocation.watchPosition(pushPosition, (err) => toast.error(`GPS error: ${err.message}`), { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
    watchIdRef.current = id;
    setSharing(true);
    toast.success(`Sharing live GPS as PERSONNEL #${entityId}`);
  };
  const stopSharing = () => {
    if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
    setSharing(false);
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] font-mono-tel uppercase tracking-widest text-slate-500">Live Operations</div>
          <h1 className="font-display text-2xl md:text-3xl font-bold">POLAR Live Data Center</h1>
          <p className="text-sm text-slate-400 mt-1">Weather, GPS telemetry, cargo movement, personnel locations and research updates.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono-tel text-emerald-300">{loading ? "SYNCING…" : "LIVE · 15s REFRESH"}</span>
          <button onClick={load} className="p-2 rounded-lg border border-slate-700 hover:bg-white/5"><RefreshCw className="h-4 w-4" /></button>
        </div>
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-5">
        <div className="flex items-center gap-2 mb-4"><CloudSnow className="h-5 w-5 text-sky-400" /><h2 className="font-display text-lg font-semibold">Live Weather</h2></div>
        <div className="text-xs text-slate-500 mb-3">{ops?.weather?.location_name || "Research station"} · Source: Open-Meteo</div>
        <Weather data={ops} />
      </section>

      <section className="rounded-xl border border-emerald-500/20 bg-slate-950/70 p-5">
        <div className="flex items-center gap-2 mb-3"><Satellite className="h-5 w-5 text-emerald-400" /><h2 className="font-display text-lg font-semibold">Two-Way Live GPS</h2></div>
        <p className="text-xs text-slate-500 mb-3">Push this device's real browser GPS to the ops database, and pull it right back — proving the round trip actually works. Positions land in the Cargo/Personnel tracking tables below in real time.</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-mono-tel uppercase text-slate-500">Personnel ID</span>
          <Input value={entityId} onChange={e => setEntityId(e.target.value)} className="w-20 text-xs" />
          {!sharing ? (
            <Button size="sm" onClick={startSharing} className="bg-emerald-600 hover:bg-emerald-500 text-white"><PlayCircle className="h-3.5 w-3.5 mr-1.5" /> Start sharing my GPS</Button>
          ) : (
            <Button size="sm" onClick={stopSharing} variant="outline" className="border-rose-500/40 text-rose-300"><StopCircle className="h-3.5 w-3.5 mr-1.5" /> Stop sharing</Button>
          )}
          {sharing && <span className="text-[10px] font-mono-tel text-emerald-300 flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 pulse-dot" />LIVE</span>}
        </div>
        {selfPos && <div className="mt-3 text-xs font-mono-tel text-slate-300">Last position sent: {selfPos.latitude.toFixed(5)}, {selfPos.longitude.toFixed(5)} · {selfPos.at.toLocaleTimeString()}</div>}
      </section>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          [Package, "Cargo tracked", cargo.length],
          [Users, "Personnel tracked", people.length],
          [ShieldAlert, "Open emergencies", ops?.emergencies?.open ?? "—"],
          [FlaskConical, "Research updates", research.length],
        ].map(([Icon, label, value]) => (
          <div key={label} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4"><Icon className="h-4 w-4 text-sky-400" /><div className="text-2xl font-bold mt-2">{value}</div><div className="text-xs text-slate-500">{label}</div></div>
        ))}
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-950/70 overflow-hidden">
        <div className="p-5 border-b border-slate-800 flex items-center gap-2"><Navigation className="h-5 w-5 text-emerald-400" /><h2 className="font-display text-lg font-semibold">Cargo GPS Tracking</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm"><thead className="text-[10px] uppercase text-slate-500 bg-white/[0.02]"><tr><th className="text-left p-3">Cargo</th><th className="text-left p-3">Status</th><th className="text-left p-3">Location</th><th className="text-left p-3">Coordinates</th><th className="text-left p-3">Source</th></tr></thead>
          <tbody>{cargo.map(c => <tr key={c.id} className="border-t border-slate-800"><td className="p-3 font-mono-tel text-sky-300">{c.cargo_code}</td><td className="p-3"><Badge variant="outline">{c.shipment_status}</Badge></td><td className="p-3">{c.from_location || "—"} → {c.destination || "—"}</td><td className="p-3 font-mono-tel">{c.latitude != null ? `${Number(c.latitude).toFixed(4)}, ${Number(c.longitude).toFixed(4)}` : "—"}</td><td className="p-3 text-xs text-slate-400">{c.simulation ? "SIMULATED DEMO GPS" : c.tracking_source}</td></tr>)}</tbody></table>
        </div>
        <div className="px-5 py-3 text-[10px] text-slate-500 border-t border-slate-800">Real tracker data can be pushed to <span className="text-slate-300">POST /api/live/gps</span>. Simulated positions are clearly labeled and are not real satellite GPS.</div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-5">
        <div className="flex items-center gap-2 mb-4"><Users className="h-5 w-5 text-indigo-400" /><h2 className="font-display text-lg font-semibold">Personnel Location Telemetry</h2></div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {people.map(p => <div key={p.id} className="rounded-lg border border-slate-800 p-3"><div className="font-mono-tel text-sky-300 text-xs">{p.personnel_code}</div><div className="font-semibold">{p.name}</div><div className="text-xs text-slate-500">{p.role} · {p.location || "Unknown"}</div><div className="mt-2 text-xs font-mono-tel"><MapPin className="inline h-3 w-3 mr-1" />{p.latitude != null ? `${Number(p.latitude).toFixed(4)}, ${Number(p.longitude).toFixed(4)}` : "No coordinates"}</div></div>)}
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-5">
        <div className="flex items-center gap-2 mb-4"><FlaskConical className="h-5 w-5 text-violet-400" /><h2 className="font-display text-lg font-semibold">Live Polar Research Updates</h2></div>
        <div className="space-y-3">
          {research.map((r, i) => <a key={i} href={r.url} target="_blank" rel="noreferrer" className="block rounded-lg border border-slate-800 p-4 hover:border-sky-500/40"><div className="text-[10px] font-mono-tel text-slate-500">{r.source} · {r.published_at || "recent"}</div><div className="font-semibold text-slate-100 mt-1">{r.title}</div><div className="text-xs text-slate-400 mt-1 line-clamp-2">{r.summary?.replace(/<[^>]*>/g, "")}</div></a>)}
          {!research.length && <div className="text-sm text-slate-500">No polar-relevant research update was returned by the live feed.</div>}
        </div>
      </section>

      {last && <div className="text-[10px] font-mono-tel text-slate-600">Last synchronized: {last.toLocaleTimeString()}</div>}
    </div>
  );
}
