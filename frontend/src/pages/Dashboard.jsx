import { useEffect, useMemo, useState } from "react";
import { api, live } from "@/lib/api";
import KpiCard from "@/components/KpiCard";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Link } from "react-router-dom";
import {
  Activity, Anchor, ArrowUpRight, Compass, Crosshair, Gauge, MapPin,
  Navigation, Package, Radio, ShieldAlert, Snowflake, Sparkles, Target,
  Thermometer, TrendingUp, Users, Warehouse, Wind, Zap, CircleDot
} from "lucide-react";

const STATIONS = [
  { name: "Bharati Research Station", short: "BHARATI", lat: "69.4°S", lon: "76.2°E", temp: -22, wind: 34, status: "operational", accent: "cyan" },
  { name: "Maitri Research Station", short: "MAITRI", lat: "70.8°S", lon: "11.7°E", temp: -18, wind: 22, status: "operational", accent: "emerald" },
  { name: "Himadri Research Station", short: "HIMADRI", lat: "78.9°N", lon: "11.9°E", temp: -14, wind: 18, status: "operational", accent: "indigo" },
  { name: "Field Camp Alpha", short: "CAMP A", lat: "71.2°S", lon: "15.4°E", temp: -31, wind: 46, status: "alert", accent: "rose" },
];

export default function Dashboard() {
  const [ov, setOv] = useState(null);
  const [exps, setExps] = useState([]);
  const [cargo, setCargo] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [liveOps, setLiveOps] = useState(null);
  const [livePeople, setLivePeople] = useState([]);

  useEffect(() => {
    (async () => {
      const results = await Promise.allSettled([
        api.get("/overview"), api.get("/expeditions"), api.get("/cargo"),
        api.get("/incidents"), live.operations(), live.personnelTracking(),
      ]);
      const [o, e, c, i, l, p] = results;
      if (o.status === "fulfilled") setOv(o.value.data);
      if (e.status === "fulfilled") setExps(e.value.data || []);
      if (c.status === "fulfilled") setCargo(c.value.data || []);
      if (i.status === "fulfilled") setIncidents(i.value.data || []);
      if (l.status === "fulfilled") setLiveOps(l.value.data);
      if (p.status === "fulfilled") setLivePeople(p.value.data?.tracking || []);
    })();
  }, []);

  const activeExp = exps.filter(e => e.status === "active");
  const leadMission = activeExp[0] || exps[0];
  const trackedPeople = livePeople.length || ov?.personnel_deployed || 0;
  const openAlerts = ov?.open_incidents ?? 0;
  const weather = liveOps?.weather?.current;
  const riskCount = useMemo(() => activeExp.filter(e => ["high", "critical"].includes(e.risk_level)).length, [activeExp]);

  return (
    <div className="p-4 md:p-8 space-y-6 md:space-y-8">
      {/* New command header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-mono-tel uppercase tracking-[.24em] text-sky-300"><span className="h-1.5 w-1.5 rounded-full bg-sky-300 pulse-dot" />Command overview / live theatre</div>
          <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-[-.05em] text-slate-50 mt-2">Good morning, <span className="text-sky-300">Commander.</span></h1>
          <p className="text-sm text-slate-400 mt-2 max-w-2xl">A single view of mission momentum, station health, field teams, and the next decision that needs your attention.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/intelligence" className="inline-flex items-center gap-2 rounded-xl border border-indigo-400/30 bg-indigo-400/[.08] px-3.5 py-2.5 text-xs font-semibold text-indigo-200 hover:bg-indigo-400/[.14]"><Sparkles className="h-4 w-4" />Open intelligence</Link>
          <Link to="/expeditions" className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-3.5 py-2.5 text-xs font-bold text-slate-950 shadow-lg shadow-sky-500/20 hover:bg-sky-400"><Compass className="h-4 w-4" />New expedition</Link>
        </div>
      </div>

      {/* Mission spotlight: completely new asymmetric composition */}
      <section className="relative overflow-hidden rounded-[26px] border border-sky-400/25 bg-gradient-to-br from-[#0c2439] via-[#091526] to-[#0a0e1b] p-5 md:p-7 shadow-[0_24px_70px_rgba(14,165,233,.12)]">
        <div className="absolute -right-24 -top-28 h-80 w-80 rounded-full bg-sky-400/10 blur-3xl" />
        <div className="absolute right-0 bottom-0 h-44 w-2/3 bg-gradient-to-l from-indigo-500/[.08] to-transparent" />
        <div className="relative grid grid-cols-1 xl:grid-cols-[1.15fr_.85fr] gap-7 items-center">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-mono-tel uppercase tracking-[.22em] text-slate-500"><Crosshair className="h-3.5 w-3.5 text-sky-300" />Mission spotlight</div>
            <div className="flex items-start justify-between gap-4 mt-4"><div><div className="font-mono-tel text-xs text-sky-300">{leadMission?.code || "POL-26-041"}</div><h2 className="font-display text-2xl md:text-3xl font-bold text-white mt-1">{leadMission?.name || "Bharati Winter Traverse"}</h2><div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400 mt-3"><span><Navigation className="inline h-3.5 w-3.5 mr-1 text-sky-300" />{leadMission?.destination || "Bharati Research Station"}</span><span><Users className="inline h-3.5 w-3.5 mr-1 text-indigo-300" />Lead: {leadMission?.lead || "Cdr. Anika Rao"}</span></div></div><Badge variant="outline" className="border-emerald-400/40 bg-emerald-400/[.06] text-emerald-300">ACTIVE</Badge></div>
            <div className="grid grid-cols-3 gap-2 mt-7 max-w-xl"><SpotMetric label="Mission progress" value={`${leadMission?.progress ?? 55}%`} /><SpotMetric label="Risk exposure" value={leadMission?.risk_level || "moderate"} tone={riskCount ? "orange" : "emerald"} /><SpotMetric label="Crew in field" value={trackedPeople || "—"} /></div>
            <div className="mt-5 max-w-xl"><div className="flex justify-between text-[10px] font-mono-tel uppercase tracking-widest text-slate-500 mb-2"><span>Route completion</span><span>{leadMission?.progress ?? 55}%</span></div><Progress value={leadMission?.progress ?? 55} className="h-2" /></div>
            <div className="flex flex-wrap gap-2 mt-6"><Link to="/intelligence" className="rounded-lg bg-sky-400 px-3.5 py-2 text-xs font-bold text-slate-950 hover:bg-sky-300">Open mission twin <ArrowUpRight className="inline h-3.5 w-3.5 ml-1" /></Link><Link to="/live" className="rounded-lg border border-slate-700 bg-white/[.03] px-3.5 py-2 text-xs text-slate-300 hover:border-sky-400/50">Track live theatre</Link></div>
          </div>
          <div className="relative min-h-[260px] rounded-2xl border border-sky-300/15 bg-[#071321]/80 overflow-hidden grid-lines">
            <div className="absolute inset-0 grid place-items-center"><div className="h-52 w-52 rounded-full border border-sky-400/15 grid place-items-center"><div className="h-36 w-36 rounded-full border border-sky-400/20 grid place-items-center"><div className="h-16 w-16 rounded-full border border-sky-300/50 bg-sky-400/10 grid place-items-center shadow-[0_0_40px_rgba(56,189,248,.25)]"><Target className="h-6 w-6 text-sky-300" /></div></div></div></div>
            <div className="absolute left-[18%] top-[28%] h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_14px_#6ee7b7]" /><div className="absolute right-[24%] top-[22%] h-2.5 w-2.5 rounded-full bg-sky-300 shadow-[0_0_14px_#7dd3fc]" /><div className="absolute right-[18%] bottom-[27%] h-2.5 w-2.5 rounded-full bg-orange-300 shadow-[0_0_14px_#fdba74]" />
            <div className="absolute left-4 bottom-4 text-[10px] font-mono-tel uppercase tracking-widest text-slate-500">Operational theatre / 04 nodes</div><div className="absolute right-4 top-4 flex items-center gap-1.5 text-[10px] font-mono-tel text-emerald-300"><CircleDot className="h-3 w-3" />NETWORK STABLE</div>
          </div>
        </div>
      </section>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
        <KpiCard testId="kpi-card-active-expeditions" label="Active expeditions" value={ov?.active_expeditions ?? "—"} sub={`${ov?.total_expeditions ?? 0} total in program`} tone="cyan" icon={Compass} />
        <KpiCard testId="kpi-card-cargo" label="Cargo in transit" value={ov?.cargo_in_transit ?? "—"} sub="Vessels + air drops tracked" tone="indigo" icon={Anchor} />
        <KpiCard testId="kpi-card-personnel" label="Personnel deployed" value={ov?.personnel_deployed ?? "—"} sub="Field roster reporting" tone="emerald" icon={Users} />
        <KpiCard testId="kpi-card-stock" label="Stock alerts" value={ov?.critical_stock_items ?? "—"} sub="Below minimum threshold" tone="amber" icon={Warehouse} />
        <KpiCard testId="kpi-card-incidents" label="Open incidents" value={ov?.open_incidents ?? "—"} sub="Response teams engaged" tone="rose" icon={ShieldAlert} />
      </div>

      {/* Decision rail */}
      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_.8fr] gap-5">
        <section className="rounded-2xl border border-slate-800 bg-slate-950/70 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4"><div><div className="text-[10px] font-mono-tel uppercase tracking-widest text-sky-300">Command queue</div><h2 className="font-display text-xl font-bold text-slate-100 mt-1">Expeditions in the field</h2></div><Link to="/expeditions" className="text-xs text-sky-300 hover:text-sky-200">Manage missions <ArrowUpRight className="inline h-3.5 w-3.5" /></Link></div>
          <div className="p-4 space-y-3">{activeExp.length ? activeExp.slice(0, 4).map(e => <div key={e.id} className="group grid grid-cols-[auto_1fr_auto] gap-3 items-center rounded-xl border border-slate-800 bg-slate-900/40 p-3 hover:border-sky-400/35"><div className="h-10 w-10 rounded-xl border border-sky-400/25 bg-sky-400/[.08] grid place-items-center"><Compass className="h-4.5 w-4.5 text-sky-300" /></div><div className="min-w-0"><div className="flex items-center gap-2"><span className="font-mono-tel text-[10px] text-sky-300">{e.code}</span><span className="text-[10px] text-slate-500">{e.destination}</span></div><div className="font-semibold text-slate-100 truncate mt-1">{e.name}</div><div className="flex items-center gap-3 text-[10px] text-slate-500 mt-1"><span>Lead {e.lead}</span><span>{e.progress}% complete</span></div></div><div className="w-24 hidden sm:block"><div className="text-right font-mono-tel text-[10px] text-slate-500 mb-1">{e.risk_level} risk</div><Progress value={e.progress} className="h-1.5" /></div></div>) : <EmptyState icon={Compass} text="No active missions in the field." link="/expeditions" action="File an expedition" />}</div>
        </section>
        <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[.03] p-5"><div className="flex items-start justify-between"><div><div className="text-[10px] font-mono-tel uppercase tracking-widest text-emerald-300">Live signal rail</div><h2 className="font-display text-xl font-bold text-slate-100 mt-1">Theatre conditions</h2></div><Link to="/live" className="text-slate-500 hover:text-emerald-300"><ArrowUpRight className="h-4 w-4" /></Link></div><div className="grid grid-cols-2 gap-3 mt-5"><Signal label="Primary station" value={liveOps?.weather?.location_name || "Synchronizing"} icon={MapPin} /><Signal label="Temperature" value={weather ? `${weather.temperature_2m}°C` : "—"} icon={Thermometer} tone="cyan" /><Signal label="Wind load" value={weather ? `${weather.wind_speed_10m} km/h` : "—"} icon={Wind} tone="orange" /><Signal label="Open emergencies" value={liveOps?.emergencies?.open ?? openAlerts} icon={ShieldAlert} tone="rose" /></div><div className="mt-4 rounded-xl border border-emerald-400/15 bg-emerald-400/[.05] p-3 text-xs text-slate-300"><Activity className="inline h-3.5 w-3.5 text-emerald-300 mr-2" />All connected systems are reporting. Last refresh is live from the operations layer.</div></section>
      </div>

      {/* Station matrix */}
      <section><div className="flex items-end justify-between mb-3"><div><div className="text-[10px] font-mono-tel uppercase tracking-widest text-slate-500">Network matrix / 04 nodes</div><h2 className="font-display text-xl md:text-2xl font-bold text-slate-100 mt-1">Station health at a glance</h2></div><span className="text-[10px] font-mono-tel text-emerald-300">● LIVE TELEMETRY</span></div><div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">{STATIONS.map(s => <StationCard key={s.name} station={s} />)}</div></section>

      {/* Bottom: people, alerts, cargo */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <section className="rounded-2xl border border-indigo-500/20 bg-indigo-500/[.03] p-5"><div className="flex items-center justify-between"><div><div className="text-[10px] font-mono-tel uppercase tracking-widest text-indigo-300">Field roster</div><h2 className="font-display text-lg font-bold text-slate-100 mt-1">Personnel locations</h2></div><Link to="/personnel" className="text-xs text-indigo-300">Open roster →</Link></div><div className="mt-4 space-y-2">{livePeople.slice(0, 4).map(person => <div key={person.id} className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-2.5"><div className="h-8 w-8 rounded-full bg-indigo-400/10 border border-indigo-400/25 grid place-items-center"><Users className="h-3.5 w-3.5 text-indigo-300" /></div><div className="min-w-0 flex-1"><div className="text-xs font-semibold text-slate-200 truncate">{person.name}</div><div className="text-[10px] text-slate-500 truncate">{person.role || "Field employee"}</div></div><span className={`h-2 w-2 rounded-full ${person.latitude != null ? "bg-emerald-300" : "bg-amber-300"}`} /></div>)}{!livePeople.length && <div className="text-xs text-slate-500 py-5 text-center">No employee location records available.</div>}</div></section>
        <section className="rounded-2xl border border-rose-500/20 bg-rose-500/[.025] p-5"><div className="flex items-center justify-between"><div><div className="text-[10px] font-mono-tel uppercase tracking-widest text-rose-300">Response monitor</div><h2 className="font-display text-lg font-bold text-slate-100 mt-1">Incident pulse</h2></div><Link to="/emergency" className="text-xs text-rose-300">Emergency center →</Link></div><div className="mt-4 space-y-3">{incidents.slice(0, 4).map(i => <div key={i.id} className="border-l-2 pl-3" style={{ borderColor: i.severity === "critical" ? "#f43f5e" : i.severity === "high" ? "#fb923c" : "#34d399" }}><div className="font-mono-tel text-[10px] uppercase tracking-widest text-slate-500">{i.incident_code} · {i.severity}</div><div className="text-xs text-slate-200 mt-1 line-clamp-2">{i.description}</div><div className="text-[10px] text-slate-500 mt-1">{i.location} · {i.status}</div></div>)}{!incidents.length && <EmptyState icon={ShieldAlert} text="All theatres clear." link="/emergency" action="Open response center" />}</div></section>
        <section className="rounded-2xl border border-sky-500/20 bg-sky-500/[.025] p-5"><div className="flex items-center justify-between"><div><div className="text-[10px] font-mono-tel uppercase tracking-widest text-sky-300">Logistics stream</div><h2 className="font-display text-lg font-bold text-slate-100 mt-1">Cargo moving now</h2></div><Link to="/cargo" className="text-xs text-sky-300">All manifests →</Link></div><div className="mt-4 space-y-3">{cargo.slice(0, 3).map(c => <div key={c.id} className="rounded-lg border border-slate-800 bg-slate-950/45 p-3"><div className="flex items-center justify-between"><span className="font-mono-tel text-[10px] text-sky-300">{c.manifest_id}</span><span className="text-[10px] text-slate-500">{c.status}</span></div><div className="text-xs font-semibold text-slate-200 mt-1 truncate">{c.contents}</div><div className="flex items-center gap-2 mt-2 text-[10px] text-slate-500"><Package className="h-3 w-3 text-sky-300" />{c.origin} <span>→</span> {c.destination}</div></div>)}{!cargo.length && <div className="text-xs text-slate-500 py-5 text-center">No cargo manifests in the stream.</div>}</div></section>
      </div>
    </div>
  );
}

function SpotMetric({ label, value, tone }) { return <div className="rounded-lg border border-white/10 bg-white/[.04] p-3"><div className="text-[9px] font-mono-tel uppercase tracking-widest text-slate-500">{label}</div><div className={`font-mono-tel text-sm font-bold mt-1 ${tone === "orange" ? "text-orange-300" : tone === "emerald" ? "text-emerald-300" : "text-slate-100"}`}>{value}</div></div>; }
function Signal({ label, value, icon: Icon, tone = "emerald" }) { const colors = { emerald: "text-emerald-300", cyan: "text-sky-300", orange: "text-orange-300", rose: "text-rose-300" }; return <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-3"><div className="flex items-center justify-between"><span className="text-[9px] font-mono-tel uppercase tracking-widest text-slate-500">{label}</span><Icon className={`h-3.5 w-3.5 ${colors[tone]}`} /></div><div className="text-sm font-semibold text-slate-200 mt-2 truncate">{value}</div></div>; }
function StationCard({ station }) { const alert = station.status === "alert"; return <div className={`rounded-xl border p-4 hover-lift ${alert ? "border-rose-500/30 bg-rose-500/[.035]" : "border-slate-800 bg-slate-950/60"}`}><div className="flex items-start justify-between"><div><div className="font-mono-tel text-[10px] tracking-widest text-sky-300">{station.short}</div><div className="font-semibold text-slate-100 mt-1">{station.name}</div></div><span className={`h-2.5 w-2.5 rounded-full mt-1 ${alert ? "bg-rose-300 shadow-[0_0_12px_#fb7185]" : "bg-emerald-300 shadow-[0_0_10px_#6ee7b7]"}`} /></div><div className="font-mono-tel text-[10px] text-slate-500 mt-3"><MapPin className="inline h-3 w-3 mr-1" />{station.lat} · {station.lon}</div><div className="grid grid-cols-2 gap-3 mt-4"><div><div className="text-[9px] uppercase tracking-widest text-slate-500"><Thermometer className="inline h-3 w-3 mr-1" />Temp</div><div className="text-lg font-mono-tel font-bold text-sky-300 mt-1">{station.temp}°</div></div><div><div className="text-[9px] uppercase tracking-widest text-slate-500"><Wind className="inline h-3 w-3 mr-1" />Wind</div><div className={`text-lg font-mono-tel font-bold mt-1 ${alert ? "text-orange-300" : "text-slate-100"}`}>{station.wind} km/h</div></div></div><div className={`mt-3 text-[10px] font-mono-tel uppercase tracking-widest ${alert ? "text-rose-300" : "text-emerald-300"}`}>{alert ? "Weather watch" : "Systems nominal"}</div></div>; }
function EmptyState({ icon: Icon, text, link, action }) { return <div className="rounded-xl border border-dashed border-slate-800 p-5 text-center"><Icon className="h-5 w-5 mx-auto text-slate-600" /><div className="text-xs text-slate-500 mt-2">{text}</div><Link to={link} className="inline-block text-[10px] text-sky-300 mt-2">{action} →</Link></div>; }
