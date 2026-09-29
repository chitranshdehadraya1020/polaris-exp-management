import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Activity, Check, CloudOff, Compass, Database, Gauge, MapPin, MessageSquare, PackageCheck, Radio, RefreshCw, ShieldCheck, Sparkles, Wifi, WifiOff } from "lucide-react";

const READY_CHECKS = [
  { label: "Personnel assigned", value: true, detail: "12 / 12 crew confirmed", icon: ShieldCheck },
  { label: "Critical cargo delivered", value: true, detail: "Manifest POL-26-041 complete", icon: PackageCheck },
  { label: "Food sufficient", value: true, detail: "18 days of coverage", icon: Check },
  { label: "Medical supplies sufficient", value: true, detail: "7 days · watch threshold", icon: ShieldCheck },
  { label: "Fuel sufficient", value: false, detail: "3 days · resupply required", icon: Gauge },
  { label: "Weather acceptable", value: false, detail: "Blizzard window in 36 hours", icon: Compass },
  { label: "Emergency resources available", value: true, detail: "SAR Alpha + backup generator", icon: ShieldCheck },
  { label: "Tasks completed", value: true, detail: "27 / 31 field tasks closed", icon: Check },
  { label: "Communication available", value: true, detail: "Last uplink 00:02:14 ago", icon: Radio },
];

const QUEUED = [
  { label: "Task completion", icon: Check, count: 4 },
  { label: "Inventory usage", icon: PackageCheck, count: 1 },
  { label: "GPS position", icon: MapPin, count: 2 },
  { label: "Emergency report", icon: ShieldCheck, count: 0 },
  { label: "Field message", icon: MessageSquare, count: 3 },
];

export default function FieldIntelligence() {
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState({ records: 17, messages: 3, gps: 2, inventory: 1 });
  const [lastSync, setLastSync] = useState("12:34:18 UTC");
  const [queued, setQueued] = useState(QUEUED);
  const readiness = useMemo(() => Math.round((READY_CHECKS.filter(check => check.value).length / READY_CHECKS.length) * 100), []);
  const pending = queued.reduce((sum, item) => sum + item.count, 0);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, []);

  const toggleDemo = () => {
    setOnline(current => !current);
    toast.info(online ? "POLAR offline mode activated" : "Connection restored — ready to sync");
  };
  const sync = () => {
    if (!online || !pending) return;
    setSyncing(true);
    window.setTimeout(() => {
      setSynced(current => ({ records: current.records + pending, messages: current.messages + queued.find(item => item.label === "Field message").count, gps: current.gps + queued.find(item => item.label === "GPS position").count, inventory: current.inventory + queued.find(item => item.label === "Inventory usage").count }));
      setQueued(items => items.map(item => ({ ...item, count: 0 })));
      setLastSync(new Date().toISOString().slice(11, 19) + " UTC");
      setSyncing(false);
      toast.success(`${pending} offline records synchronized`);
    }, 900);
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div><div className="text-[10px] font-mono-tel uppercase tracking-[0.2em] text-slate-500">Module · 08 / Resilience</div><h1 className="font-display text-2xl md:text-3xl font-bold text-sky-100 mt-2">Field Intelligence</h1><p className="text-sm text-slate-400 mt-1">Offline-first operations and a pre-departure mission readiness gate.</p></div>
        <Button onClick={toggleDemo} variant="outline" className={online ? "border-rose-500/40 text-rose-300" : "border-emerald-500/40 text-emerald-300"}>{online ? <WifiOff className="h-4 w-4 mr-2" /> : <Wifi className="h-4 w-4 mr-2" />}{online ? "Simulate connection loss" : "Restore connection"}</Button>
      </div>

      <section className={`rounded-2xl border p-5 ${online ? "border-emerald-500/20 bg-emerald-500/[0.035]" : "border-rose-500/40 bg-rose-500/[0.06] shadow-[0_16px_50px_rgba(244,63,94,.08)]"}`}>
        <div className="flex items-start justify-between gap-4 flex-wrap"><div className="flex items-start gap-3"><div className={`rounded-xl p-3 ${online ? "bg-emerald-500/15" : "bg-rose-500/15"}`}>{online ? <Wifi className="h-5 w-5 text-emerald-300" /> : <CloudOff className="h-5 w-5 text-rose-300" />}</div><div><div className={`font-mono-tel text-[10px] uppercase tracking-[0.22em] ${online ? "text-emerald-300" : "text-rose-300"}`}>{online ? "Connection restored" : "Connection lost"}</div><h2 className="font-display text-xl font-bold mt-1">{online ? "POLAR network online" : "POLAR Offline Mode active"}</h2><p className="text-xs text-slate-400 mt-1">{online ? `Last sync ${lastSync} · local store is healthy` : "The field store is accepting operations without satellite connectivity."}</p></div></div><Badge variant="outline" className={online ? "border-emerald-500/40 text-emerald-300" : "border-rose-500/50 text-rose-300"}>{online ? "UPLINK AVAILABLE" : "STORE-AND-SYNC"}</Badge></div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-5">{[ ["View assigned tasks", Check], ["Record task completion", Check], ["Record inventory usage", PackageCheck], ["Record GPS position", MapPin], ["Create emergency report", ShieldCheck] ].map(([label, Icon]) => <div key={label} className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2.5 text-[11px] text-slate-300 flex items-center gap-2"><Icon className="h-3.5 w-3.5 text-sky-300" />{label}</div>)}</div>
        <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/55 p-4"><div className="flex items-center justify-between gap-3"><div><div className="text-xs font-semibold text-slate-200">Local event queue</div><div className="text-[11px] text-slate-500 mt-1">{pending ? `${pending} records waiting for uplink` : "Queue clear — all records synchronized"}</div></div><Button size="sm" disabled={!online || !pending || syncing} onClick={sync} className="bg-sky-500 hover:bg-sky-400 text-slate-950"><RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncing ? "animate-spin" : ""}`} />{syncing ? "Syncing…" : "Sync now"}</Button></div><div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-4">{queued.map(item => <div key={item.label} className="text-center rounded-lg border border-slate-800 p-2"><item.icon className="h-3.5 w-3.5 mx-auto text-slate-500" /><div className="font-mono-tel text-lg text-slate-100 mt-1">{item.count}</div><div className="text-[9px] text-slate-500 uppercase tracking-wide">{item.label}</div></div>)}</div></div>
        <div className="mt-4 flex flex-wrap gap-4 text-[10px] font-mono-tel text-slate-500"><span><Database className="inline h-3 w-3 mr-1 text-sky-400" />{synced.records} records synchronized</span><span><MessageSquare className="inline h-3 w-3 mr-1 text-indigo-400" />{synced.messages} messages sent</span><span><MapPin className="inline h-3 w-3 mr-1 text-emerald-400" />{synced.gps} GPS records uploaded</span><span><PackageCheck className="inline h-3 w-3 mr-1 text-amber-400" />{synced.inventory} inventory updates</span></div>
      </section>

      <section className="rounded-2xl border border-indigo-500/20 bg-slate-950/70 p-5"><div className="flex items-start justify-between gap-4 flex-wrap"><div><div className="text-[10px] font-mono-tel uppercase tracking-widest text-indigo-300">Pre-departure gate · Expedition POL-26-041</div><h2 className="font-display text-xl font-bold mt-1">Mission readiness</h2><p className="text-xs text-slate-500 mt-1">A single operational score that joins logistics, personnel, weather, and communications.</p></div><div className="text-right"><div className="font-mono-tel text-4xl font-bold text-sky-300 telemetry-glow">{readiness}%</div><div className="text-[10px] uppercase tracking-widest text-amber-300 mt-1">Conditional go</div></div></div><div className="mt-5"><Progress value={readiness} className="h-2" /><div className="flex justify-between mt-2 text-[10px] font-mono-tel text-slate-500"><span>0 · NO-GO</span><span>Target ≥ 90%</span><span>100 · GO</span></div></div><div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 mt-5">{READY_CHECKS.map(check => { const Icon = check.icon; return <div key={check.label} className={`rounded-xl border p-3 ${check.value ? "border-emerald-500/20 bg-emerald-500/[0.035]" : "border-amber-500/30 bg-amber-500/[0.045]"}`}><div className="flex items-center gap-2"><span className={`grid place-items-center h-6 w-6 rounded-full ${check.value ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>{check.value ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}</span><span className="text-xs font-semibold text-slate-200">{check.label}</span><span className={`ml-auto font-mono-tel text-[10px] ${check.value ? "text-emerald-300" : "text-amber-300"}`}>{check.value ? "PASS" : "WATCH"}</span></div><div className="text-[10px] text-slate-500 mt-2 pl-8">{check.detail}</div></div>; })}</div><div className="mt-5 rounded-xl border border-amber-500/25 bg-amber-500/[0.05] p-4 flex gap-3"><Sparkles className="h-4 w-4 text-amber-300 shrink-0 mt-0.5" /><div><div className="text-xs font-semibold text-amber-200">Command recommendation</div><div className="text-xs text-slate-300 mt-1">Hold departure until fuel coverage is restored and the 36-hour weather window is reviewed by the expedition lead.</div></div></div></section>
    </div>
  );
}
