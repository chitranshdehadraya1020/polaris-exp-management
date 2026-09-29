import { useEffect, useMemo, useRef, useState } from "react";
import { messages as messagesApi } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Radio, Send, RefreshCw, Siren, ArrowDownToLine, ArrowUpFromLine, Users } from "lucide-react";

const CHANNELS = [
  { id: "OPS", label: "Ops · General" },
  { id: "MEDICAL", label: "Medical" },
  { id: "LOGISTICS", label: "Logistics" },
  { id: "EMERGENCY", label: "Emergency / SOS" },
];
const DIRECTIONS = [
  { id: "FIELD_TO_COMMAND", label: "Field → Command" },
  { id: "COMMAND_TO_FIELD", label: "Command → Field" },
];

export default function Communications() {
  const [channel, setChannel] = useState("OPS");
  const [thread, setThread] = useState([]);
  const [loading, setLoading] = useState(false);
  const [senderName, setSenderName] = useState("OPS-CENTER");
  const [senderRole, setSenderRole] = useState("Command");
  const [direction, setDirection] = useState("COMMAND_TO_FIELD");
  const [recipient, setRecipient] = useState("ALL");
  const [recipientPersonnelId, setRecipientPersonnelId] = useState("");
  const [personnel, setPersonnel] = useState([]);
  const [priority, setPriority] = useState("NORMAL");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await messagesApi.list({ channel });
      setThread(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      toast.error(`Unable to load messages: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); loadPersonnel(); const id = setInterval(load, 6000); return () => clearInterval(id); }, [channel]);
  const loadPersonnel = async () => { try { const res = await messagesApi.list({}); /* keep comms API independent; personnel is fetched below */ const p = await fetch("/api/personnel").then(r => r.json()); setPersonnel(Array.isArray(p) ? p : []); } catch (e) {} };
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [thread]);

  const send = async () => {
    if (!body.trim()) { toast.error("Message body is required."); return; }
    setBusy(true);
    try {
      await messagesApi.send({ channel, direction, sender_name: senderName, sender_role: senderRole, recipient: recipientPersonnelId ? "EMPLOYEE" : recipient, recipient_personnel_id: recipientPersonnelId || null, priority, body });
      setBody("");
      await load();
      if (priority === "SOS") toast.error("SOS message sent — routed to Alerts and Emergency Response Center.");
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  const counts = useMemo(() => ({
    total: thread.length,
    fromField: thread.filter(m => m.direction === "FIELD_TO_COMMAND").length,
    fromCommand: thread.filter(m => m.direction === "COMMAND_TO_FIELD").length,
  }), [thread]);

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="text-[10px] font-mono-tel uppercase tracking-widest text-slate-500">Module · 06 / Comms</div>
          <h1 className="font-display text-2xl md:text-3xl font-bold">Two-Way Communications</h1>
          <p className="text-sm text-slate-400 mt-1">Live message channel between field personnel and Mission Control. Messages tagged SOS also raise a critical alert.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={load} className="text-slate-400 hover:text-sky-300"><RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat icon={Radio} label="Messages on channel" value={counts.total} tone="sky" />
        <Stat icon={ArrowUpFromLine} label="From field" value={counts.fromField} tone="emerald" />
        <Stat icon={ArrowDownToLine} label="From command" value={counts.fromCommand} tone="indigo" />
      </div>

      <div className="flex gap-2 flex-wrap">
        {CHANNELS.map(c => (
          <button key={c.id} onClick={() => setChannel(c.id)} className={`px-3 py-1.5 rounded-lg text-xs font-mono-tel uppercase tracking-widest border transition ${channel === c.id ? "border-sky-500/60 bg-sky-500/10 text-sky-300" : "border-slate-800 text-slate-400 hover:bg-white/5"}`}>{c.label}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <section className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-950/70 flex flex-col h-[520px]">
          <div className="p-4 border-b border-slate-800 flex items-center gap-2"><Radio className="h-4 w-4 text-sky-400" /><h2 className="font-display text-sm font-semibold">{CHANNELS.find(c => c.id === channel)?.label} thread</h2></div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {thread.map(m => (
              <div key={m.id} className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm ${m.direction === "FIELD_TO_COMMAND" ? "bg-slate-900 border border-slate-800" : "bg-sky-500/10 border border-sky-500/25 ml-auto"} ${m.priority === "SOS" ? "!border-rose-500/60 bg-rose-500/10" : ""}`}>
                <div className="flex items-center gap-2 text-[10px] font-mono-tel uppercase tracking-widest text-slate-500 mb-1">
                  <span className={m.priority === "SOS" ? "text-rose-300" : "text-slate-400"}>{m.sender_name}{m.sender_role ? ` · ${m.sender_role}` : ""}</span>
                  {m.priority === "SOS" && <Badge variant="outline" className="border-rose-500/50 text-rose-300"><Siren className="h-3 w-3 mr-1" />SOS</Badge>}
                  <span className="ml-auto">{m.sent_at ? new Date(m.sent_at).toLocaleTimeString() : ""}</span>
                </div>
                <div className="text-slate-200 whitespace-pre-line">{m.body}</div>
                <div className="text-[10px] text-slate-600 mt-1">To: {m.recipient || "ALL"}</div>
              </div>
            ))}
            {!thread.length && <div className="text-sm text-slate-500 text-center py-10">No messages on this channel yet. Send the first one below.</div>}
            <div ref={bottomRef} />
          </div>
          <div className="p-3 border-t border-slate-800 space-y-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Input value={senderName} onChange={e => setSenderName(e.target.value)} placeholder="Sender / call-sign" className="text-xs" />
              <Select value={recipientPersonnelId || "ALL"} onValueChange={v => { setRecipientPersonnelId(v === "ALL" ? "" : v); setRecipient(v === "ALL" ? "ALL" : "EMPLOYEE"); }}><SelectTrigger className="text-xs"><SelectValue placeholder="Recipient" /></SelectTrigger><SelectContent><SelectItem value="ALL">ALL FIELD PERSONNEL</SelectItem>{personnel.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.personnel_code} — {p.name}</SelectItem>)}</SelectContent></Select>
              <Select value={direction} onValueChange={setDirection}><SelectTrigger className="text-xs"><SelectValue /></SelectTrigger><SelectContent>{DIRECTIONS.map(d => <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>)}</SelectContent></Select>
              <Select value={priority} onValueChange={setPriority}><SelectTrigger className="text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="NORMAL">Normal</SelectItem><SelectItem value="URGENT">Urgent</SelectItem><SelectItem value="SOS">SOS</SelectItem></SelectContent></Select>
            </div>
            <div className="flex gap-2">
              <Textarea value={body} onChange={e => setBody(e.target.value)} rows={2} placeholder="Type a message to the field or command…" className="text-sm" />
              <Button disabled={busy} onClick={send} className={priority === "SOS" ? "bg-rose-600 hover:bg-rose-500" : "bg-sky-500 hover:bg-sky-400 text-slate-950"}><Send className="h-4 w-4" /></Button>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 h-fit">
          <div className="flex items-center gap-2 mb-3"><Users className="h-4 w-4 text-indigo-400" /><h2 className="font-display text-sm font-semibold">How two-way comms works</h2></div>
          <ul className="text-xs text-slate-400 space-y-2 list-disc pl-4">
            <li>Any device — a field tablet or the command console — posts to the same channel and reads the same thread.</li>
            <li>Set direction to <span className="text-slate-200">Field → Command</span> when reporting from the field, or <span className="text-slate-200">Command → Field</span> when replying.</li>
            <li>Marking a message priority <span className="text-rose-300">SOS</span> also creates a critical alert and links it to the Emergency Response Center.</li>
            <li>The thread refreshes automatically every 6 seconds.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone }) {
  const colors = { sky: "text-sky-300 border-sky-500/25", emerald: "text-emerald-300 border-emerald-500/25", indigo: "text-indigo-300 border-indigo-500/25" };
  return <div className={`rounded-2xl border bg-slate-950/60 p-4 ${colors[tone]}`}><div className="flex justify-between"><span className="text-[10px] uppercase tracking-widest text-slate-500 font-mono-tel">{label}</span><Icon className="h-4 w-4" /></div><div className="mt-3 text-3xl font-mono-tel font-bold text-slate-100">{value}</div></div>;
}
