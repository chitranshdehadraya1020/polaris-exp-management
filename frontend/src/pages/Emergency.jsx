import { useEffect, useMemo, useState } from "react";
import { api, messages as messagesApi } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, Siren, CheckCheck, Radio, Ambulance, Clock3, MapPin, Users, Send, RefreshCw, MessageSquare, ChevronDown, Zap, GitBranch, Play, CircleAlert } from "lucide-react";

const SEVERITY = ["low", "medium", "high", "critical"];
const TYPES = ["Medical emergency", "Blizzard / extreme weather", "Vehicle incident", "Missing personnel", "Fire / hazardous material", "Communications failure", "Other operational incident"];
const INITIAL = { incident_code: "", emergency_type: "Medical emergency", severity: "high", location: "", description: "", reported_by: "", response_team: "SAR Alpha" };

export default function Emergency() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(INITIAL);
  const [expandedId, setExpandedId] = useState(null);
  const [cascadeOpen, setCascadeOpen] = useState(false);
  const load = async () => { try { setItems((await api.get("/incidents")).data); } catch (e) { toast.error(`Unable to load incidents: ${e.message}`); } };
  useEffect(() => { load(); }, []);

  const counts = useMemo(() => ({ active: items.filter(i => !["resolved", "closed"].includes(i.status)).length, critical: items.filter(i => i.severity === "critical" && !["resolved", "closed"].includes(i.status)).length, responding: items.filter(i => i.status === "responding").length }), [items]);
  const update = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const submit = async () => {
    if (!form.incident_code || !form.location || !form.description) { toast.error("Incident code, location and description are required."); return; }
    setBusy(true);
    try { await api.post("/incidents", form); toast.error(`SOS ${form.incident_code} dispatched · ${form.severity.toUpperCase()}`); setOpen(false); setForm(INITIAL); await load(); } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  const dispatch = async (incident) => {
    try { await api.post(`/emergencies/${incident.id}/dispatch`, { message: `Response team ${incident.response_team || "SAR Alpha"} mobilized to ${incident.location}.` }); toast.success(`${incident.incident_code} assigned to response team`); await load(); } catch (e) { toast.error(e.message); }
  };
  const resolve = async (incident) => {
    try { await api.patch(`/incidents/${incident.id}`, { status: "resolved" }); toast.success(`${incident.incident_code} resolved and logged`); await load(); } catch (e) { toast.error(e.message); }
  };
  const dispatchQuickSOS = async () => {
    const code = `INC-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${String(Date.now()).slice(-4)}`;
    setBusy(true);
    try { await api.post("/incidents", { incident_code: code, emergency_type: "Command-initiated SOS drill", severity: "critical", location: "Sector Alpha — Perimeter Beacon", description: "GLOBAL SOS TEST · Command-initiated drill from ops console. Verify radio, roster, and response routing.", reported_by: "OPS-CENTER", response_team: "SAR Alpha" }); toast.error(`Global SOS ${code} broadcast`); await load(); } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div><div className="text-[10px] font-mono-tel uppercase tracking-[0.2em] text-slate-500">Module · 05 / Response control</div><h1 className="font-display text-2xl md:text-3xl font-bold text-rose-200 mt-2">Emergency Response Center</h1><p className="text-sm text-slate-400 mt-1">Create, dispatch, track, and close operational incidents with an auditable response trail.</p></div>
        <div className="flex gap-2 flex-wrap"><Button data-testid="btn-trigger-sos" disabled={busy} onClick={dispatchQuickSOS} className="bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30"><Siren className="h-4 w-4 mr-1.5" /> Trigger Global SOS</Button><Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button variant="outline" className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10"><ShieldAlert className="h-4 w-4 mr-1.5" /> Log Incident</Button></DialogTrigger><DialogContent className="bg-slate-950 border-slate-800 max-w-xl"><DialogHeader><DialogTitle className="font-display text-rose-100">Dispatch Emergency Response</DialogTitle></DialogHeader><div className="grid grid-cols-2 gap-3"><div><Label className="text-xs">Incident Code</Label><Input data-testid="input-emergency-code" value={form.incident_code} onChange={e => update("incident_code", e.target.value)} placeholder="INC-2026-015" /></div><div><Label className="text-xs">Severity</Label><Select value={form.severity} onValueChange={v => update("severity", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SEVERITY.map(s => <SelectItem key={s} value={s}>{s.toUpperCase()}</SelectItem>)}</SelectContent></Select></div><div className="col-span-2"><Label className="text-xs">Incident Type</Label><Select value={form.emergency_type} onValueChange={v => update("emergency_type", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div><div className="col-span-2"><Label className="text-xs">Location / Sector</Label><Input data-testid="input-emergency-location" value={form.location} onChange={e => update("location", e.target.value)} placeholder="Bharati Station · East access corridor" /></div><div className="col-span-2"><Label className="text-xs">Situation Report</Label><Textarea data-testid="input-emergency-description" rows={4} value={form.description} onChange={e => update("description", e.target.value)} placeholder="What happened, current risk, personnel affected, and immediate needs..." /></div><div><Label className="text-xs">Reported By</Label><Input value={form.reported_by} onChange={e => update("reported_by", e.target.value)} placeholder="ICE-07 / OPS-CENTER" /></div><div><Label className="text-xs">Response Team</Label><Input value={form.response_team} onChange={e => update("response_team", e.target.value)} placeholder="SAR Alpha" /></div></div><DialogFooter><Button disabled={busy} onClick={submit} className="bg-rose-600 hover:bg-rose-500 text-white"><Send className="h-4 w-4 mr-1.5" /> Dispatch Alert</Button></DialogFooter></DialogContent></Dialog></div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4"><Stat icon={ShieldAlert} label="Active incidents" value={counts.active} tone="rose" /><Stat icon={Radio} label="Response in progress" value={counts.responding} tone="sky" /><Stat icon={Ambulance} label="Critical priority" value={counts.critical} tone="orange" /></div>
      <div className="rounded-2xl border border-rose-500/15 bg-rose-500/[0.035] p-4 flex gap-3 items-start"><div className="rounded-lg bg-rose-500/15 p-2"><Siren className="h-4 w-4 text-rose-300" /></div><div className="text-xs text-slate-300"><strong className="text-rose-200">Emergency protocol:</strong> Triggering an SOS creates a database record and alert, then routes the incident to this queue. Dispatch moves it to <span className="font-mono-tel text-sky-300">RESPONDING</span>; resolve only after the field team confirms the situation is closed.<div className="text-slate-500 mt-1">Use the Global SOS button for a clearly labeled drill, not a real-life distress signal.</div></div></div>

      <div className="flex items-center justify-between"><h2 className="font-display text-xl font-bold">Incident queue</h2><Button variant="ghost" size="sm" onClick={load} className="text-slate-400 hover:text-sky-300"><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh</Button></div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{items.map(i => <div key={i.id} className={`rounded-2xl border p-5 hover-lift bg-slate-950/70 ${i.status === "resolved" ? "border-slate-800" : i.severity === "critical" ? "border-rose-500/40 shadow-[0_10px_40px_rgba(244,63,94,.08)]" : i.severity === "high" ? "border-orange-500/40" : "border-slate-800"}`}><div className="flex items-start justify-between gap-3"><div><div className="font-mono-tel text-[10px] uppercase tracking-widest text-slate-500">{i.incident_code} · {i.emergency_type}</div><div className="font-semibold text-slate-100 mt-1 flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-slate-500" />{i.location}</div></div><div className="flex gap-2"><Badge variant="outline" className={severityClass(i.severity)}>{i.severity}</Badge><Badge variant="outline" className={statusClass(i.status)}>{i.status}</Badge></div></div><div className="mt-4 text-sm text-slate-300 whitespace-pre-line">{i.description}</div><div className="mt-4 grid grid-cols-2 gap-3 text-xs font-mono-tel text-slate-500"><div className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{i.reported_by || "Control room"}</div><div className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />{i.response_team || "SAR Alpha"}</div></div>{i.status !== "resolved" && <div className="mt-4 flex gap-2">{i.status !== "responding" && <Button size="sm" variant="outline" className="border-sky-500/40 text-sky-300 hover:bg-sky-500/10" onClick={() => dispatch(i)}><Radio className="h-3.5 w-3.5 mr-1" /> Dispatch team</Button>}<Button size="sm" variant="outline" className="border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10" onClick={() => resolve(i)}><CheckCheck className="h-3.5 w-3.5 mr-1" /> Mark resolved</Button></div>}<button onClick={() => setExpandedId(expandedId === i.id ? null : i.id)} className="mt-3 flex items-center gap-1.5 text-[11px] font-mono-tel uppercase tracking-widest text-slate-500 hover:text-sky-300"><MessageSquare className="h-3.5 w-3.5" /> Two-way SOS thread <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expandedId === i.id ? "rotate-180" : ""}`} /></button>{expandedId === i.id && <SosThread emergencyId={i.id} />}</div>)}{items.length === 0 && <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-950/70 p-10 text-center text-slate-500">All theatres clear. No incidents logged.</div>}</div>
    </div>
  );
}

function SosThread({ emergencyId }) {
  const [thread, setThread] = useState([]);
  const [sender, setSender] = useState("");
  const [direction, setDirection] = useState("FIELD_TO_COMMAND");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try { const res = await messagesApi.list({ emergency_id: emergencyId }); setThread(Array.isArray(res.data) ? res.data : []); }
    catch (e) { toast.error(`Unable to load SOS thread: ${e.message}`); }
  };
  useEffect(() => { load(); const id = setInterval(load, 6000); return () => clearInterval(id); }, [emergencyId]);

  const send = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await messagesApi.send({ channel: "EMERGENCY", direction, sender_name: sender || (direction === "FIELD_TO_COMMAND" ? "Field unit" : "OPS-CENTER"), recipient: direction === "FIELD_TO_COMMAND" ? "OPS-CENTER" : "Field unit", related_emergency_id: emergencyId, priority: "URGENT", body });
      setBody(""); await load();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
        {thread.map(m => (
          <div key={m.id} className={`rounded-lg px-2.5 py-2 text-xs ${m.direction === "FIELD_TO_COMMAND" ? "bg-slate-950 border border-slate-800" : "bg-sky-500/10 border border-sky-500/25 ml-6"}`}>
            <div className="flex items-center gap-2 text-[9px] font-mono-tel uppercase tracking-widest text-slate-500 mb-0.5"><span>{m.sender_name}</span><span className="ml-auto">{m.sent_at ? new Date(m.sent_at).toLocaleTimeString() : ""}</span></div>
            <div className="text-slate-200 whitespace-pre-line">{m.body}</div>
          </div>
        ))}
        {!thread.length && <div className="text-xs text-slate-500 py-3 text-center">No messages yet on this incident. Field and command can both reply here.</div>}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Input value={sender} onChange={e => setSender(e.target.value)} placeholder="Your call-sign" className="text-xs col-span-1" />
        <Select value={direction} onValueChange={setDirection}><SelectTrigger className="text-xs col-span-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="FIELD_TO_COMMAND">Field → Command</SelectItem><SelectItem value="COMMAND_TO_FIELD">Command → Field</SelectItem></SelectContent></Select>
        <div className="col-span-1" />
      </div>
      <div className="mt-2 flex gap-2">
        <Textarea value={body} onChange={e => setBody(e.target.value)} rows={2} placeholder="Reply on this incident…" className="text-xs" />
        <Button size="sm" disabled={busy} onClick={send} className="bg-rose-600 hover:bg-rose-500"><Send className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );
}
function Stat({ icon: Icon, label, value, tone }) { const colors = { rose: "text-rose-300 border-rose-500/25", sky: "text-sky-300 border-sky-500/25", orange: "text-orange-300 border-orange-500/25" }; return <div className={`rounded-2xl border bg-slate-950/60 p-4 ${colors[tone]}`}><div className="flex justify-between"><span className="text-[10px] uppercase tracking-widest text-slate-500 font-mono-tel">{label}</span><Icon className="h-4 w-4" /></div><div className="mt-3 text-3xl font-mono-tel font-bold text-slate-100">{value}</div></div>; }
function severityClass(s) { return s === "critical" ? "border-rose-500/50 text-rose-300 font-mono-tel text-[10px] uppercase" : s === "high" ? "border-orange-500/50 text-orange-300 font-mono-tel text-[10px] uppercase" : s === "medium" ? "border-amber-500/50 text-amber-300 font-mono-tel text-[10px] uppercase" : "border-emerald-500/40 text-emerald-300 font-mono-tel text-[10px] uppercase"; }
function statusClass(s) { return s === "resolved" ? "border-slate-600 text-slate-400 font-mono-tel text-[10px] uppercase" : s === "responding" ? "border-sky-500/40 text-sky-300 font-mono-tel text-[10px] uppercase" : "border-rose-500/40 text-rose-300 font-mono-tel text-[10px] uppercase"; }
