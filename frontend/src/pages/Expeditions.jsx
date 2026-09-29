import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Plus, Compass, Play, CheckCircle2, Trash2 } from "lucide-react";

const RISKS = ["low", "moderate", "high", "critical"];
const STATIONS = ["Maitri", "Bharati", "Himadri", "Arctic-1"];

export default function Expeditions() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: "", name: "", lead: "", destination: STATIONS[0], origin: "Cape Town Base",
    start_date: "", end_date: "", crew_count: 10, risk_level: "moderate", notes: "",
  });

  const load = async () => setItems((await api.get("/expeditions")).data);
  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!form.code || !form.name || !form.lead || !form.start_date || !form.end_date) {
      toast.error("Please fill code, name, lead, and both dates.");
      return;
    }
    await api.post("/expeditions", { ...form, crew_count: Number(form.crew_count) });
    toast.success(`Expedition ${form.code} filed with mission control`);
    setOpen(false);
    setForm({ code: "", name: "", lead: "", destination: STATIONS[0], origin: "Cape Town Base",
      start_date: "", end_date: "", crew_count: 10, risk_level: "moderate", notes: "" });
    load();
  };

  const changeStatus = async (e, status) => {
    await api.patch(`/expeditions/${e.id}`, { status, progress: status === "completed" ? 100 : e.progress });
    toast.success(`${e.code} → ${status}`);
    load();
  };

  const del = async (e) => {
    await api.delete(`/expeditions/${e.id}`);
    toast.success(`${e.code} removed`);
    load();
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-mono-tel uppercase tracking-widest text-slate-500">Module · 01</div>
          <h1 className="font-display text-2xl md:text-3xl font-bold">Expedition Planning</h1>
          <p className="text-sm text-slate-400 mt-1">Build, brief, and dispatch polar missions with risk-graded readiness.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="btn-create-expedition" className="bg-sky-500 hover:bg-sky-400 text-slate-950">
              <Plus className="h-4 w-4 mr-1.5" /> New Expedition
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-slate-950 border-slate-800 max-w-lg">
            <DialogHeader><DialogTitle className="font-display">File New Expedition</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Mission Code</Label>
                <Input data-testid="input-exp-code" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="EXP-24E" /></div>
              <div><Label className="text-xs">Mission Lead</Label>
                <Input value={form.lead} onChange={e => setForm({ ...form, lead: e.target.value })} placeholder="Cdr. Name" /></div>
              <div className="col-span-2"><Label className="text-xs">Mission Name</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Bharati Winter Traverse" /></div>
              <div><Label className="text-xs">Destination</Label>
                <Select value={form.destination} onValueChange={v => setForm({ ...form, destination: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select></div>
              <div><Label className="text-xs">Risk Level</Label>
                <Select value={form.risk_level} onValueChange={v => setForm({ ...form, risk_level: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{RISKS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select></div>
              <div><Label className="text-xs">Start Date</Label>
                <Input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} /></div>
              <div><Label className="text-xs">End Date</Label>
                <Input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} /></div>
              <div><Label className="text-xs">Crew Count</Label>
                <Input type="number" value={form.crew_count} onChange={e => setForm({ ...form, crew_count: e.target.value })} /></div>
              <div className="col-span-2"><Label className="text-xs">Briefing Notes</Label>
                <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} /></div>
            </div>
            <DialogFooter>
              <Button data-testid="btn-submit-expedition" onClick={submit} className="bg-sky-500 hover:bg-sky-400 text-slate-950">File Mission</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {items.map(e => (
          <div key={e.id} data-testid={`exp-card-${e.code}`} className="rounded-xl border border-slate-800 bg-slate-950/70 p-5 hover-lift">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-sky-500/10 border border-sky-500/30 grid place-items-center">
                  <Compass className="h-5 w-5 text-sky-300" />
                </div>
                <div>
                  <div className="font-mono-tel text-[10px] text-sky-300 uppercase tracking-widest">{e.code}</div>
                  <div className="font-semibold text-slate-100">{e.name}</div>
                </div>
              </div>
              <Badge variant="outline" className={`font-mono-tel text-[10px] uppercase ${
                e.status === "active" ? "border-emerald-500/40 text-emerald-300" :
                e.status === "planned" ? "border-sky-500/40 text-sky-300" :
                e.status === "completed" ? "border-slate-500/40 text-slate-400" :
                "border-rose-500/40 text-rose-300"}`}>{e.status}</Badge>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400 font-mono-tel">
              <div>LEAD · <span className="text-slate-200">{e.lead}</span></div>
              <div>CREW · <span className="text-slate-200">{e.crew_count}</span></div>
              <div>ORIGIN · <span className="text-slate-200">{e.origin}</span></div>
              <div>DEST · <span className="text-slate-200">{e.destination}</span></div>
              <div>WINDOW · <span className="text-slate-200">{e.start_date} → {e.end_date}</span></div>
              <div>RISK · <span className={`uppercase ${e.risk_level === "high" ? "text-orange-300" : e.risk_level === "critical" ? "text-rose-300" : "text-emerald-300"}`}>{e.risk_level}</span></div>
            </div>
            {e.notes && <div className="mt-3 text-sm text-slate-300 border-l-2 border-slate-800 pl-3">{e.notes}</div>}
            <div className="mt-4">
              <div className="flex justify-between font-mono-tel text-[10px] text-slate-500 mb-1">
                <span>MISSION PROGRESS</span><span>{e.progress}%</span>
              </div>
              <Progress value={e.progress} className="h-1.5" />
            </div>
            <div className="mt-4 flex gap-2">
              {e.status === "planned" && (
                <Button size="sm" variant="outline" className="border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
                  onClick={() => changeStatus(e, "active")}>
                  <Play className="h-3.5 w-3.5 mr-1" /> Launch
                </Button>
              )}
              {e.status === "active" && (
                <Button size="sm" variant="outline" className="border-slate-700 text-slate-300"
                  onClick={() => changeStatus(e, "completed")}>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Mark Complete
                </Button>
              )}
              <Button size="sm" variant="ghost" className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                onClick={() => del(e)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
