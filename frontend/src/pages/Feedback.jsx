import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, ChevronRight, ClipboardCheck, MessageSquare, Plus, Send, Star } from "lucide-react";

const SEED = [
  { id: 1, title: "P-104 post-expedition review", source: "Mission Analytics", priority: "HIGH", status: "READY", detail: "Fuel usage and cargo delay exceeded forecast; route weather weighting should increase.", created: "Today · 11:20 UTC" },
  { id: 2, title: "Route B weather-delay signal", source: "Adaptive Mission View", priority: "MEDIUM", status: "IN REVIEW", detail: "Earlier warning and an 18-hour reserve recommendation proposed for future missions.", created: "Yesterday · 16:45 UTC" },
];

export default function Feedback() {
  const navigate = useNavigate();
  const [items, setItems] = useState(() => JSON.parse(localStorage.getItem("polaris-feedback") || "null") || SEED);
  const [notes, setNotes] = useState("");
  const [rating, setRating] = useState(4);
  useEffect(() => localStorage.setItem("polaris-feedback", JSON.stringify(items)), [items]);
  const submit = () => {
    if (!notes.trim()) return toast.error("Add an observation before submitting feedback.");
    const item = { id: Date.now(), title: "Commander observation", source: "Feedback Center", priority: "MEDIUM", status: "READY", detail: notes.trim(), created: "Just now · UTC" };
    setItems(current => [item, ...current]); setNotes(""); toast.success("Feedback captured for operational review");
  };
  const send = item => { setItems(current => current.map(row => row.id === item.id ? { ...row, status: "SENT TO LEARNING LOOP" } : row)); toast.success("Feedback sent to the learning loop"); navigate(`/learning-loop?feedback=${item.id}`); };
  return <div className="p-4 md:p-8 space-y-6">
    <div className="flex items-start justify-between gap-4 flex-wrap"><div><div className="text-[10px] font-mono-tel uppercase tracking-[.2em] text-slate-500">Module · Feedback center</div><h1 className="font-display text-2xl md:text-3xl font-bold text-cyan-100 mt-2">Feedback Center</h1><p className="text-sm text-slate-400 mt-1">Capture commander observations, review mission outcomes, and send validated signals into the learning loop.</p></div><Badge variant="outline" className="border-cyan-500/40 text-cyan-300"><ClipboardCheck className="h-3.5 w-3.5 mr-1.5" />Operational review active</Badge></div>
    <div className="grid grid-cols-1 xl:grid-cols-[.8fr_1.2fr] gap-5">
      <section className="rounded-2xl border border-cyan-500/25 bg-cyan-500/[.03] p-5"><div className="text-[10px] uppercase tracking-widest text-cyan-300">01 · New observation</div><h2 className="font-display text-xl font-bold text-white mt-1">Tell POLAR what happened</h2><p className="text-xs text-slate-500 mt-2">Your note becomes a reviewable learning signal. No model changes happen automatically.</p><div className="mt-5 flex items-center gap-2"><span className="text-xs text-slate-400">Confidence</span>{[1,2,3,4,5].map(value => <button key={value} aria-label={`${value} stars`} onClick={() => setRating(value)} className="p-1"><Star className={`h-4 w-4 ${value <= rating ? "fill-amber-300 text-amber-300" : "text-slate-700"}`} /></button>)}</div><textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Example: wind increased sooner than forecast and delayed the fuel transfer..." className="mt-4 min-h-32 w-full rounded-xl border border-slate-700 bg-slate-950/80 p-3 text-sm text-slate-100 outline-none focus:border-cyan-400" /><Button onClick={submit} className="mt-3 w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950"><Plus className="h-4 w-4 mr-2" />Add feedback</Button></section>
      <section className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5"><div className="flex items-center justify-between"><div><div className="text-[10px] uppercase tracking-widest text-slate-500">02 · Review queue</div><h2 className="font-display text-xl font-bold text-white mt-1">Feedback waiting for validation</h2></div><span className="font-mono-tel text-2xl text-cyan-300">{items.filter(i => i.status !== "SENT TO LEARNING LOOP").length}</span></div><div className="mt-4 space-y-3">{items.map(item => <div key={item.id} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4"><div className="flex items-start gap-3"><div className="h-8 w-8 rounded-lg bg-cyan-500/10 grid place-items-center shrink-0"><MessageSquare className="h-4 w-4 text-cyan-300" /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2 flex-wrap"><h3 className="text-sm font-semibold text-slate-100">{item.title}</h3><Badge variant="outline" className={item.priority === "HIGH" ? "border-rose-500/40 text-rose-300" : "border-amber-500/40 text-amber-300"}>{item.priority}</Badge></div><div className="text-[10px] uppercase tracking-widest text-slate-500 mt-1">{item.source} · {item.created}</div><p className="text-xs text-slate-400 mt-3 leading-relaxed">{item.detail}</p><div className="flex items-center gap-2 mt-3">{item.status === "SENT TO LEARNING LOOP" ? <span className="text-[10px] uppercase tracking-widest text-emerald-300"><Check className="inline h-3 w-3 mr-1" />Sent to learning loop</span> : <Button size="sm" onClick={() => send(item)} className="bg-violet-500 hover:bg-violet-400 text-white"><Send className="h-3.5 w-3.5 mr-1.5" />Send to learning loop</Button>}<button onClick={() => navigate("/learning-loop")} className="text-xs text-slate-500 hover:text-violet-300">View loop <ChevronRight className="inline h-3 w-3" /></button></div></div></div></div>)}</div></section>
    </div>
  </div>;
}
