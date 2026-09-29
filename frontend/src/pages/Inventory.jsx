import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Warehouse, PackagePlus, PackageMinus, AlertTriangle, Plus, Download, RefreshCw, BarChart3, ClipboardList, ShieldCheck, TrendingDown, Clock3, Route, Sparkles } from "lucide-react";

const STATIONS = ["All", "MAITRI Research Station", "BHARATI Research Station", "HIMADRI Research Station", "Field Camp Alpha"];
const FORM_STATIONS = STATIONS.slice(1);
const DEFAULT_CATEGORIES = ["FUEL", "RATIONS", "MEDICAL", "SCIENTIFIC", "SURVIVAL", "SPARE PARTS", "COMMUNICATIONS", "GENERAL"];
const EMPTY_FORM = { station: FORM_STATIONS[0], category: DEFAULT_CATEGORIES[0], item_name: "", quantity: 0, unit: "", threshold: 0 };

const number = (value) => Number(value || 0);
const coverage = (item) => item.threshold > 0 ? Math.min(100, Math.round((number(item.quantity) / (number(item.threshold) * 2)) * 100)) : 100;
const isLow = (item) => number(item.quantity) <= number(item.threshold);
const isCritical = (item) => number(item.threshold) > 0 && number(item.quantity) <= number(item.threshold) * 0.5;

export default function Inventory() {
  const [items, setItems] = useState([]);
  const [station, setStation] = useState("All");
  const [category, setCategory] = useState("All");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [newCategory, setNewCategory] = useState({ name: "", description: "" });
  const [customCategory, setCustomCategory] = useState("");
  const [requests, setRequests] = useState([]);
  const [stationSummary, setStationSummary] = useState([]);
  const [expeditionDays, setExpeditionDays] = useState(14);

  const loadCategories = async () => {
    try { const res = await api.get("/inventory/categories"); const names = (res.data?.categories || []).map(x => x.category).filter(Boolean); if (names.length) setCategories(names); }
    catch (error) { toast.error(error.message || "Unable to load inventory categories."); }
  };

  const loadRequests = async () => { try { setRequests((await api.get("/inventory/requests")).data?.data || []); } catch (error) { toast.error(error.message || "Unable to load inventory requests."); } };
  const loadStationSummary = async () => { try { setStationSummary((await api.get("/inventory/station-summary")).data?.data || []); } catch (error) { toast.error(error.message || "Unable to load station summary."); } };

  const createCategory = async () => {
    if (!newCategory.name.trim()) return toast.error("Category name is required.");
    try { await api.post("/inventory/categories", newCategory); toast.success(`${newCategory.name} category created`); setNewCategory({ name: "", description: "" }); setCategoryOpen(false); await loadCategories(); }
    catch (error) { toast.error(error.message || "Unable to create category."); }
  };

  const updateRequest = async (request, status) => {
    try { await api.patch(`/inventory/requests/${request.id}`, { status }); toast.success(`${request.item_name} request marked ${status.toLowerCase()}`); loadRequests(); }
    catch (error) { toast.error(error.message || "Unable to update request."); }
  };

  const load = async () => {
    setLoading(true);
    try { setItems((await api.get("/inventory")).data); }
    catch (error) { toast.error(error.message || "Unable to load inventory."); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); loadCategories(); loadRequests(); loadStationSummary(); }, []);

  const categoryFilters = ["All", ...categories];

  const filtered = useMemo(() => items
    .filter(i => station === "All" || String(i.station || "").toLowerCase() === station.toLowerCase())
    .filter(i => category === "All" || String(i.category || "").toLowerCase() === category.toLowerCase()), [items, station, category]);
  const grouped = useMemo(() => filtered.reduce((groups, item) => { const key = item.station || "Unassigned depot"; groups[key] = groups[key] || []; groups[key].push(item); return groups; }, {}), [filtered]);

  const analytics = useMemo(() => {
    const totalUnits = items.reduce((sum, item) => sum + number(item.quantity), 0);
    const totalMin = items.reduce((sum, item) => sum + number(item.threshold), 0);
    const low = items.filter(isLow);
    const critical = items.filter(isCritical);
    const healthy = items.filter(item => !isLow(item));
    const byCategory = items.reduce((groups, item) => {
      const key = item.category || "Other";
      const group = groups[key] || { name: key, skus: 0, units: 0, low: 0, min: 0 };
      group.skus += 1; group.units += number(item.quantity); group.min += number(item.threshold); if (isLow(item)) group.low += 1; groups[key] = group; return groups;
    }, {});
    const byStation = items.reduce((groups, item) => {
      const key = item.station || "Unassigned depot";
      const group = groups[key] || { name: key, skus: 0, units: 0, low: 0, critical: 0, min: 0 };
      group.skus += 1; group.units += number(item.quantity); group.min += number(item.threshold); if (isLow(item)) group.low += 1; if (isCritical(item)) group.critical += 1; groups[key] = group; return groups;
    }, {});
    const reorder = [...low].sort((a, b) => (number(b.threshold) - number(b.quantity)) - (number(a.threshold) - number(a.quantity))).map(item => ({ ...item, reorder: Math.max(0, number(item.threshold) * 2 - number(item.quantity)) }));
    return { totalUnits, totalMin, low, critical, healthy, byCategory: Object.values(byCategory), byStation: Object.values(byStation), reorder, health: items.length ? Math.round((healthy.length / items.length) * 100) : 0 };
  }, [items]);

  const prediction = useMemo(() => {
    const seed = [
      { category: "FOOD", item_name: "Polar ration packs", station: "BHARATI Research Station", quantity: 144, unit: "packs", dailyUse: 8, threshold: 30 },
      { category: "MEDICAL", item_name: "Medical supplies", station: "BHARATI Research Station", quantity: 72, unit: "units", dailyUse: 8, threshold: 30 },
      { category: "FUEL", item_name: "Generator fuel", station: "BHARATI Research Station", quantity: 21, unit: "drums", dailyUse: 7, threshold: 14 },
      { category: "BATTERY", item_name: "Battery reserve", station: "BHARATI Research Station", quantity: 98, unit: "cells", dailyUse: 7, threshold: 24 },
    ];
    const tracked = items.filter(item => number(item.quantity) > 0).slice(0, 12).map(item => ({ ...item, dailyUse: Math.max(1, Math.round(number(item.threshold) / 4)) }));
    const source = tracked.length ? tracked : seed;
    return source.map(item => ({ ...item, days: number(item.quantity) / Math.max(1, number(item.dailyUse)), resupplyBy: Math.max(0, Math.floor(number(item.quantity) / Math.max(1, number(item.dailyUse)) - 1)), recommended: Math.max(0, Math.ceil(number(item.dailyUse) * expeditionDays + number(item.threshold) - number(item.quantity))) })).sort((a, b) => a.days - b.days);
  }, [items, expeditionDays]);
  const stationPulse = [
    { name: "FOOD", days: 18, tone: "emerald", icon: "🟢" },
    { name: "MEDICAL", days: 7, tone: "amber", icon: "🟡" },
    { name: "FUEL", days: 3, tone: "rose", icon: "🔴" },
    { name: "BATTERY", days: 14, tone: "emerald", icon: "🟢" },
  ];

  const adjust = async (item, delta) => {
    try { const q = Math.max(0, number(item.quantity) + delta); await api.patch(`/inventory/${item.id}`, { quantity: q }); toast.success(`${item.item_name} @ ${item.station} → ${q} ${item.unit}`); load(); }
    catch (error) { toast.error(error.message || "Unable to update stock."); }
  };

  const submit = async () => {
    if (!form.item_name || !form.unit) return toast.error("Item name and unit are required.");
    try {
      await api.post("/inventory", { ...form, storage_location_name: form.station, quantity: Number(form.quantity), threshold: Number(form.threshold) });
      toast.success(`${form.item_name} added to ${form.station} inventory`); setOpen(false); setForm({ ...EMPTY_FORM, category: categories[0] || DEFAULT_CATEGORIES[0] }); setCustomCategory(""); load(); loadCategories();
    } catch (error) { toast.error(error.message || "Unable to create inventory item."); }
  };

  const exportReport = () => {
    const headers = ["Item code", "Item", "Category", "Station", "Quantity", "Unit", "Minimum stock", "Coverage %", "Status", "Suggested reorder"];
    const rows = items.map(item => [item.item_code, item.item_name, item.category, item.station, item.quantity, item.unit, item.threshold, coverage(item), isCritical(item) ? "Critical" : isLow(item) ? "Low" : "Healthy", Math.max(0, number(item.threshold) * 2 - number(item.quantity))]);
    const csv = [headers, ...rows].map(row => row.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "polaris-inventory-report.csv"; anchor.click(); URL.revokeObjectURL(url); toast.success("Inventory report downloaded.");
  };

  return (
    <div className="p-4 md:p-8 space-y-7">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div><div className="text-[10px] font-mono-tel uppercase tracking-widest text-slate-500">Module · 03 / Analytics</div><h1 className="font-display text-2xl md:text-3xl font-bold">Station Inventory</h1><p className="text-sm text-slate-400 mt-1">Live stock position, readiness analytics, and reorder reporting across the polar network.</p></div>
        <div className="flex items-center gap-2 flex-wrap"><Button onClick={load} variant="outline" className="border-slate-700 text-slate-300"><RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />Refresh</Button><Dialog open={categoryOpen} onOpenChange={setCategoryOpen}><DialogTrigger asChild><Button variant="outline" className="border-indigo-500/40 text-indigo-300"><Plus className="h-3.5 w-3.5 mr-1.5" /> Add category</Button></DialogTrigger><DialogContent className="bg-slate-950 border-slate-800 max-w-md"><DialogHeader><DialogTitle className="font-display">Create inventory category</DialogTitle></DialogHeader><div className="space-y-3"><div><Label className="text-xs">Category name</Label><Input data-testid="input-custom-category" value={newCategory.name} onChange={e => setNewCategory({ ...newCategory, name: e.target.value })} placeholder="e.g. Water Treatment" /></div><div><Label className="text-xs">Description</Label><Input value={newCategory.description} onChange={e => setNewCategory({ ...newCategory, description: e.target.value })} placeholder="What belongs in this category?" /></div></div><DialogFooter><Button onClick={createCategory} className="bg-indigo-500 hover:bg-indigo-400 text-white">Create category</Button></DialogFooter></DialogContent></Dialog><Button onClick={exportReport} variant="outline" className="border-sky-500/40 text-sky-300"><Download className="h-3.5 w-3.5 mr-1.5" />Export CSV</Button><Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button data-testid="btn-create-inventory" className="bg-sky-500 hover:bg-sky-400 text-slate-950"><Plus className="h-4 w-4 mr-1.5" /> New Item</Button></DialogTrigger><DialogContent className="bg-slate-950 border-slate-800 max-w-lg"><DialogHeader><DialogTitle className="font-display">Add Inventory Item</DialogTitle></DialogHeader><div className="grid grid-cols-2 gap-3"><div><Label className="text-xs">Station</Label><Select value={form.station} onValueChange={v => setForm({ ...form, station: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{FORM_STATIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div><div><Label className="text-xs">Category</Label><Select value={categories.includes(form.category) ? form.category : "__OTHER__"} onValueChange={v => { if (v === "__OTHER__") { setCustomCategory(customCategory || ""); setForm({ ...form, category: customCategory || "OTHER" }); } else { setCustomCategory(""); setForm({ ...form, category: v }); } }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}<SelectItem value="__OTHER__">Other…</SelectItem></SelectContent></Select>{(!categories.includes(form.category) || form.category === "OTHER") && <Input autoFocus value={customCategory || (form.category !== "OTHER" ? form.category : "")} onChange={e => { setCustomCategory(e.target.value.toUpperCase()); setForm({ ...form, category: e.target.value.toUpperCase() || "OTHER" }); }} placeholder="Type a custom category" className="mt-2" />}</div><div className="col-span-2"><Label className="text-xs">Item Name</Label><Input data-testid="input-inventory-name" value={form.item_name} onChange={e => setForm({ ...form, item_name: e.target.value })} placeholder="e.g. Diesel (Drums)" /></div><div><Label className="text-xs">Quantity</Label><Input type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} /></div><div><Label className="text-xs">Unit</Label><Input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="drums, packs, kits..." /></div><div><Label className="text-xs">Low-Stock Threshold</Label><Input type="number" value={form.threshold} onChange={e => setForm({ ...form, threshold: e.target.value })} /></div></div><DialogFooter><Button data-testid="btn-submit-inventory" onClick={submit} className="bg-sky-500 hover:bg-sky-400 text-slate-950">Add Item</Button></DialogFooter></DialogContent></Dialog></div>
      </div>

      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Metric label="Tracked SKUs" value={items.length} sub="Across all stations" icon={ClipboardList} tone="cyan" />
        <Metric label="Units on hand" value={formatNumber(analytics.totalUnits)} sub={`${formatNumber(analytics.totalMin)} min threshold`} icon={Warehouse} tone="indigo" />
        <Metric label="Network health" value={`${analytics.health}%`} sub={`${analytics.healthy.length} healthy SKUs`} icon={ShieldCheck} tone="emerald" />
        <Metric label="Low stock" value={analytics.low.length} sub="Needs replenishment" icon={AlertTriangle} tone="amber" />
        <Metric label="Critical" value={analytics.critical.length} sub="At or below 50% minimum" icon={BarChart3} tone="rose" />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <AnalyticsPanel title="Category coverage" subtitle="Current stock against twice the minimum target">
          <div className="space-y-4">{analytics.byCategory.map(group => { const pct = group.min ? Math.min(100, Math.round(group.units / (group.min * 2) * 100)) : 100; return <div key={group.name}><div className="flex justify-between items-center text-xs mb-1.5"><span className="font-semibold text-slate-200">{group.name}</span><span className="font-mono-tel text-slate-400">{formatNumber(group.units)} units · {group.skus} SKU</span></div><div className="h-2 rounded-full bg-slate-800 overflow-hidden"><div className={`h-full rounded-full ${group.low ? "bg-orange-400" : "bg-sky-400"}`} style={{ width: `${pct}%` }} /></div><div className="flex justify-between mt-1 text-[10px] text-slate-500"><span>{pct}% coverage</span><span>{group.low ? `${group.low} below minimum` : "Within target"}</span></div></div>})}</div>
        </AnalyticsPanel>
        <AnalyticsPanel title="Station readiness" subtitle="Stock health by storage location">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{analytics.byStation.map(group => { const pct = group.min ? Math.min(100, Math.round(group.units / (group.min * 2) * 100)) : 100; return <div key={group.name} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3"><div className="flex items-start justify-between gap-2"><div className="text-xs font-semibold text-slate-200 leading-tight">{group.name}</div><Badge variant="outline" className={group.critical ? "border-rose-500/50 text-rose-300" : group.low ? "border-orange-500/50 text-orange-300" : "border-emerald-500/40 text-emerald-300"}>{group.critical ? "critical" : group.low ? "watch" : "ready"}</Badge></div><div className="mt-3 flex items-end justify-between"><span className="font-mono-tel text-xl text-sky-300">{pct}%</span><span className="text-[10px] text-slate-500">{group.skus} SKU · {formatNumber(group.units)} units</span></div><Progress value={pct} className="h-1 mt-2" /></div>})}</div>
        </AnalyticsPanel>
      </section>

      <section className="rounded-2xl border border-sky-500/20 bg-sky-500/[0.035] p-5"><div className="flex items-start justify-between gap-4 flex-wrap"><div><div className="text-[10px] font-mono-tel uppercase tracking-widest text-sky-300">Predictive resupply · Forecast window</div><h2 className="font-display text-xl font-bold mt-1 flex items-center gap-2"><TrendingDown className="h-5 w-5 text-sky-300" />Future inventory prediction</h2><p className="text-xs text-slate-400 mt-1">Burn-rate model converts current stock into shortage dates and an expedition-aware order quantity.</p></div><div className="flex items-center gap-2"><label className="text-[10px] uppercase tracking-widest text-slate-500">Expedition duration</label><div className="flex items-center gap-2"><input aria-label="Expedition duration" type="number" min="1" value={expeditionDays} onChange={e => setExpeditionDays(Number(e.target.value || 1))} className="w-20 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100" /><span className="text-xs text-slate-500">days</span></div></div></div><div className="grid grid-cols-1 xl:grid-cols-[1.15fr_.85fr] gap-5 mt-5"><div className="grid grid-cols-1 md:grid-cols-2 gap-3">{prediction.slice(0, 4).map(item => { const critical = item.days <= 3; const watch = item.days <= 7; return <div key={`${item.station}-${item.item_name}`} className="rounded-xl border border-slate-800 bg-slate-950/65 p-4"><div className="flex justify-between gap-3"><div><div className="font-mono-tel text-[10px] uppercase tracking-widest text-slate-500">{item.category} · {item.station}</div><div className="font-semibold text-slate-100 mt-1">{item.item_name}</div></div><Badge variant="outline" className={critical ? "border-rose-500/50 text-rose-300" : watch ? "border-amber-500/50 text-amber-300" : "border-emerald-500/40 text-emerald-300"}>{critical ? "CRITICAL" : watch ? "WATCH" : "STABLE"}</Badge></div><div className="mt-4 flex items-end gap-2"><span className={`font-mono-tel text-3xl font-bold ${critical ? "text-rose-300" : watch ? "text-amber-300" : "text-emerald-300"}`}>{item.days.toFixed(1)}</span><span className="text-xs text-slate-500 mb-1">days remaining</span></div><div className="text-[10px] text-slate-500 mt-1">{item.quantity} {item.unit} on hand · {item.dailyUse} {item.unit}/day use</div><div className="mt-3 flex items-center gap-2 text-xs"><Clock3 className="h-3.5 w-3.5 text-sky-300" /><span className="text-slate-300">Resupply before Day {item.resupplyBy}</span></div></div>; })}</div><div className="rounded-xl border border-slate-800 bg-slate-950/65 p-4"><div className="flex items-center gap-2"><Route className="h-4 w-4 text-indigo-300" /><div><div className="font-semibold text-slate-100">Station A · resupply priority</div><div className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Automatic priority list</div></div></div><div className="mt-4 space-y-2">{stationPulse.map((item, index) => <div key={item.name} className="flex items-center gap-3 rounded-lg border border-slate-800/80 px-3 py-2"><span className="text-base">{item.icon}</span><span className="font-mono-tel text-xs text-slate-200 w-20">{item.name}</span><div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden"><div className={`h-full rounded-full ${item.tone === "rose" ? "bg-rose-400" : item.tone === "amber" ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${Math.min(100, item.days / 18 * 100)}%` }} /></div><span className={`font-mono-tel text-xs ${item.tone === "rose" ? "text-rose-300" : item.tone === "amber" ? "text-amber-300" : "text-emerald-300"}`}>{item.days}d</span><span className="text-[9px] font-mono-tel text-slate-600 w-6">P{index + 1}</span></div>)}</div><div className="mt-4 rounded-lg border border-sky-500/20 bg-sky-500/[0.05] p-3 text-xs text-slate-300 flex gap-2"><Sparkles className="h-4 w-4 text-sky-300 shrink-0" /><span>Recommendation: <strong className="text-sky-200">resupply fuel before Day 2</strong>, then medical before Day 6 to protect the {expeditionDays}-day mission envelope.</span></div></div></div></section>

      <section className="rounded-xl border border-indigo-500/20 bg-slate-950/70 overflow-hidden"><div className="p-5 flex items-center justify-between gap-3 flex-wrap border-b border-slate-800"><div><h2 className="font-display text-lg font-semibold">Employee inventory requests</h2><p className="text-xs text-slate-500 mt-1">Requests submitted from the Employee Portal appear here for command review.</p></div><Badge variant="outline" className="border-indigo-500/40 text-indigo-300">{requests.filter(r => r.status === "PENDING").length} pending</Badge></div>{requests.length ? <div className="divide-y divide-slate-800">{requests.slice(0, 12).map(r => <div key={r.id} className="p-4 flex flex-col lg:flex-row lg:items-center gap-3"><div className="flex-1"><div className="font-semibold text-slate-100">{r.item_name} <span className="text-xs font-normal text-slate-500">· {r.quantity} {r.unit}</span></div><div className="text-xs text-slate-400 mt-1">{r.personnel_code} — {r.personnel_name} · {r.category} · {r.destination}</div><div className="text-xs text-slate-500 mt-1">{r.reason || "No reason provided"}</div></div><Badge variant="outline" className={r.status === "APPROVED" ? "border-emerald-500/40 text-emerald-300" : r.status === "REJECTED" ? "border-rose-500/40 text-rose-300" : "border-amber-500/40 text-amber-300"}>{r.status}</Badge><div className="flex gap-2"><Button size="sm" variant="outline" className="border-emerald-500/40 text-emerald-300" onClick={() => updateRequest(r, "APPROVED")}>Approve</Button><Button size="sm" variant="outline" className="border-rose-500/40 text-rose-300" onClick={() => updateRequest(r, "REJECTED")}>Reject</Button></div></div>)}</div> : <div className="p-6 text-sm text-slate-500">No employee inventory requests yet.</div>}</section>

      <section className="rounded-xl border border-orange-500/20 bg-slate-950/70 overflow-hidden"><div className="p-5 flex items-center justify-between gap-3 flex-wrap border-b border-slate-800"><div><h2 className="font-display text-lg font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-orange-400" /> Reorder priority report</h2><p className="text-xs text-slate-500 mt-1">Suggested quantity restores each item to 2× its minimum stock threshold.</p></div><Badge variant="outline" className="border-orange-500/40 text-orange-300">{analytics.reorder.length} actions</Badge></div>{analytics.reorder.length ? <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-[10px] uppercase tracking-widest text-slate-500 bg-white/[0.02]"><tr><th className="px-5 py-3">Priority</th><th className="px-5 py-3">Item</th><th className="px-5 py-3">Station</th><th className="px-5 py-3">On hand</th><th className="px-5 py-3">Minimum</th><th className="px-5 py-3">Suggested order</th><th className="px-5 py-3">Action</th></tr></thead><tbody>{analytics.reorder.map((item, index) => <tr key={item.id} className="border-t border-slate-800/80"><td className="px-5 py-3"><Badge variant="outline" className={isCritical(item) ? "border-rose-500/50 text-rose-300" : "border-orange-500/50 text-orange-300"}>{isCritical(item) ? "P1" : "P2"}</Badge></td><td className="px-5 py-3"><div className="font-semibold text-slate-200">{item.item_name}</div><div className="text-[10px] text-slate-500">{item.category} · {item.item_code}</div></td><td className="px-5 py-3 text-slate-400">{item.station}</td><td className="px-5 py-3 font-mono-tel text-slate-200">{item.quantity} {item.unit}</td><td className="px-5 py-3 font-mono-tel text-slate-400">{item.threshold}</td><td className="px-5 py-3 font-mono-tel text-orange-300">+{item.reorder} {item.unit}</td><td className="px-5 py-3"><Button size="sm" variant="outline" className="border-slate-700 text-slate-200" onClick={() => adjust(item, item.reorder)}><PackagePlus className="h-3.5 w-3.5 mr-1" />Restock</Button></td></tr>)}</tbody></table></div> : <div className="p-6 text-sm text-emerald-300">All tracked items are above their minimum stock thresholds.</div>}</section>

      <div className="flex items-center justify-between flex-wrap gap-3"><div><div className="text-[10px] font-mono-tel uppercase tracking-widest text-slate-500">Operational stock ledger</div><h2 className="font-display text-xl font-bold mt-1">Inventory by station</h2></div><div className="flex gap-2"><div className="w-48"><Select value={category} onValueChange={setCategory}><SelectTrigger data-testid="category-selector-dropdown" className="bg-slate-950/70 border-slate-800"><SelectValue /></SelectTrigger><SelectContent>{categoryFilters.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div><div className="w-56"><Select value={station} onValueChange={setStation}><SelectTrigger data-testid="station-selector-dropdown" className="bg-slate-950/70 border-slate-800"><SelectValue /></SelectTrigger><SelectContent>{STATIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div></div></div>
      {Object.entries(grouped).map(([st, arr]) => <section key={st}><div className="flex items-center gap-2 mb-3"><Warehouse className="h-4 w-4 text-sky-400" /><h2 className="font-display text-lg font-semibold">{st}</h2><div className="font-mono-tel text-[10px] uppercase tracking-widest text-slate-500">· {arr.length} SKU</div></div><div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">{arr.map(item => <InventoryCard key={item.id} item={item} adjust={adjust} />)}</div></section>)}
      {Object.keys(grouped).length === 0 && <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-8 text-center text-slate-500">No inventory items for this station.</div>}
    </div>
  );
}

function InventoryCard({ item, adjust }) { const pct = coverage(item); return <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 hover-lift"><div className="flex items-start justify-between"><div><div className="font-mono-tel text-[10px] uppercase tracking-widest text-slate-500">{item.category}</div><div className="font-semibold text-slate-100 mt-0.5">{item.item_name}</div></div>{isLow(item) && <Badge variant="outline" className={isCritical(item) ? "border-rose-500/50 text-rose-300 font-mono-tel text-[10px] uppercase" : "border-orange-500/50 text-orange-300 font-mono-tel text-[10px] uppercase"}><AlertTriangle className="h-3 w-3 mr-1" />{isCritical(item) ? "Critical" : "Low"}</Badge>}</div><div className="mt-3 flex items-baseline gap-1 font-mono-tel"><span className="text-2xl font-bold text-sky-300">{item.quantity}</span><span className="text-xs text-slate-500 uppercase">{item.unit}</span><span className="ml-auto text-[10px] text-slate-500">min {item.threshold}</span></div><Progress value={pct} className="h-1.5 mt-2" /><div className="flex justify-between mt-1 text-[10px] text-slate-500"><span>{pct}% coverage</span><span>{item.item_code}</span></div><div className="mt-3 flex gap-2"><Button size="sm" variant="outline" className="border-slate-700 text-slate-200" onClick={() => adjust(item, 10)}><PackagePlus className="h-3.5 w-3.5 mr-1" />+10</Button><Button size="sm" variant="ghost" className="text-slate-400 hover:text-slate-200" onClick={() => adjust(item, -10)}><PackageMinus className="h-3.5 w-3.5 mr-1" />-10</Button></div></div>; }
function AnalyticsPanel({ title, subtitle, children }) { return <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-5"><div className="mb-4"><h2 className="font-display text-lg font-semibold">{title}</h2><p className="text-xs text-slate-500 mt-1">{subtitle}</p></div>{children}</section>; }
function Metric({ label, value, sub, icon: Icon, tone }) { const classes = { cyan: "border-sky-400/25", indigo: "border-indigo-400/25", emerald: "border-emerald-400/25", amber: "border-orange-400/25", rose: "border-rose-400/25" }; return <div className={`rounded-xl border ${classes[tone]} bg-slate-950/70 p-4`}><div className="flex items-center justify-between"><div className="text-[10px] font-mono-tel uppercase tracking-widest text-slate-500">{label}</div><Icon className="h-4 w-4 text-slate-500" /></div><div className="mt-3 font-mono-tel text-2xl font-bold text-slate-50">{value}</div><div className="mt-1 text-[10px] text-slate-500">{sub}</div></div>; }
function formatNumber(value) { return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value); }
