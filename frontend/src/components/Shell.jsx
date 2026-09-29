import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Compass, Anchor, Warehouse, Users,
  ShieldAlert, Bot, Radio, Snowflake, BellRing, Database, ChevronRight,
  Satellite, Activity, Menu, CloudSnow, BrainCircuit, Gauge, Wrench, GitBranch, TrendingUp, Map, Wand2, Target, Scale, FlaskConical, BarChart3, MessageSquare
} from "lucide-react";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard, tid: "nav-overview-tab", group: "Command" },
  { to: "/live", label: "Live Data", icon: Activity, tid: "nav-live-tab", group: "Command" },
  { to: "/comms", label: "Communications", icon: Radio, tid: "nav-comms-tab", group: "Command" },
  { to: "/intelligence", label: "Expedition Intelligence", icon: BrainCircuit, tid: "nav-intelligence-tab", group: "Command" },
  { to: "/field-intelligence", label: "Readiness & Offline", icon: Gauge, tid: "nav-field-intelligence-tab", group: "Command" },
  { to: "/command-intelligence", label: "Command Intelligence Lab", icon: GitBranch, tid: "nav-command-intelligence-tab", group: "Command" },
  { to: "/predictive-operations", label: "Predictive Operations", icon: TrendingUp, tid: "nav-predictive-operations-tab", group: "Command" },
  { to: "/adaptive-mission", label: "Adaptive Mission View", icon: Map, tid: "nav-adaptive-mission-tab", group: "Command" },
  { to: "/mission-planner", label: "Autonomous Mission Planner", icon: Wand2, tid: "nav-mission-planner-tab", group: "Command" },
  { to: "/mission-success", label: "Mission Success Monitor", icon: Target, tid: "nav-mission-success-tab", group: "Command" },
  { to: "/mission-governance", label: "Mission Governance", icon: Scale, tid: "nav-mission-governance-tab", group: "Command" },
  { to: "/mission-analytics", label: "Mission Analytics", icon: BarChart3, tid: "nav-mission-analytics-tab", group: "Command" },
  { to: "/feedback", label: "Feedback Center", icon: MessageSquare, tid: "nav-feedback-tab", group: "Command" },
  { to: "/learning-loop", label: "Learning Loop", icon: BrainCircuit, tid: "nav-learning-loop-tab", group: "Command" },
  { to: "/expeditions", label: "Expeditions", icon: Compass, tid: "nav-expedition-tab", group: "Operations" },
  { to: "/cargo", label: "Cargo", icon: Anchor, tid: "nav-cargo-tab", group: "Operations" },
  { to: "/inventory", label: "Inventory", icon: Warehouse, tid: "nav-inventory-tab", group: "Operations" },
  { to: "/equipment-maintenance", label: "Equipment Maintenance", icon: Wrench, tid: "nav-equipment-maintenance-tab", group: "Operations" },
  { to: "/personnel", label: "Personnel", icon: Users, tid: "nav-personnel-tab", group: "Operations" },
  { to: "/weather", label: "Weather", icon: CloudSnow, tid: "nav-weather-tab", group: "Operations" },
  { to: "/alerts", label: "Alerts", icon: BellRing, tid: "nav-alerts-tab", group: "Response" },
  { to: "/emergency", label: "Emergency", icon: ShieldAlert, tid: "nav-emergency-tab", group: "Response" },
  { to: "/ai", label: "AI Assistant", icon: Bot, tid: "nav-ai-chat-tab", group: "Response" },
];

function UtcClock() {
  const [t, setT] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const utc = t.toISOString().replace("T", " ").slice(0, 19) + " UTC";
  return (
    <div className="hidden md:flex items-center gap-2 font-mono-tel text-[11px] text-slate-400 tracking-tight">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 pulse-dot shadow-[0_0_10px_rgba(52,211,153,.9)]" />
      <span data-testid="utc-clock">{utc}</span>
    </div>
  );
}

function NavItem({ item, mobile = false }) {
  const { to, label, icon: Icon, tid } = item;
  return (
    <NavLink
      to={to}
      end={to === "/"}
      data-testid={mobile ? `m-${tid}` : tid}
      className={({ isActive }) => `group relative flex items-center gap-3 ${mobile ? "flex-shrink-0 px-3 py-1.5 text-xs" : "px-3 py-2.5 text-sm"} rounded-xl transition-all duration-200 ${isActive ? "nav-active text-sky-200" : "text-slate-400 hover:text-slate-100 hover:bg-white/[0.04]"}`}
    >
      <Icon className={`${mobile ? "h-3.5 w-3.5" : "h-[17px] w-[17px]"} transition-transform group-hover:scale-110`} />
      <span className="font-medium tracking-[-0.01em]">{label}</span>
      {!mobile && <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-0 -translate-x-1 transition-all group-hover:opacity-50 group-hover:translate-x-0" />}
    </NavLink>
  );
}

function SosPopup() {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);
  const load = async () => {
    try { const result = await api.get("/alerts"); const rows = Array.isArray(result.data) ? result.data : []; setAlerts(rows.filter(row => !row.is_read && String(row.alert_type).toUpperCase() === "EMERGENCY" && String(row.severity).toUpperCase() === "CRITICAL")); }
    catch (error) { /* Keep the command shell usable if polling is temporarily unavailable. */ }
  };
  useEffect(() => { load(); const timer = setInterval(load, 3000); return () => clearInterval(timer); }, []);
  if (!alerts.length) return null;
  const current = alerts[0];
  const acknowledge = async () => { try { await api.put(`/alerts/${current.id}/read`); setAlerts(rows => rows.filter(row => row.id !== current.id)); } catch (error) {} };
  return <div className="fixed inset-0 z-[100] bg-slate-950/75 backdrop-blur-sm grid place-items-center p-4"><div role="alertdialog" aria-label="SOS emergency alert" className="w-full max-w-xl rounded-2xl border-2 border-rose-500/80 bg-[#130811] shadow-[0_0_80px_rgba(244,63,94,.35)] overflow-hidden"><div className="px-5 py-4 bg-rose-600/20 border-b border-rose-500/40 flex items-center gap-3"><div className="h-10 w-10 rounded-full bg-rose-600 grid place-items-center animate-pulse"><ShieldAlert className="h-5 w-5 text-white" /></div><div><div className="text-[11px] font-mono-tel uppercase tracking-[.25em] text-rose-300">CRITICAL · INCOMING SOS</div><div className="font-display text-xl font-bold text-white mt-1">Emergency assistance requested</div></div><div className="ml-auto h-3 w-3 rounded-full bg-rose-400 animate-ping" /></div><div className="p-5"><div className="text-sm leading-relaxed text-slate-200 whitespace-pre-line">{current.message}</div><div className="mt-5 flex flex-wrap gap-2"><button onClick={() => navigate("/emergency")} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500">Open Emergency Center</button><button onClick={acknowledge} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-white/10">Acknowledge alert</button></div>{alerts.length > 1 && <div className="mt-3 text-[11px] text-rose-300">{alerts.length - 1} additional SOS alert(s) waiting.</div>}</div></div></div>;
}

export default function Shell() {
  const groups = ["Command", "Operations", "Response"];
  return (
    <div className="min-h-screen flex bg-[#050912] text-slate-100 app-shell">
      <SosPopup />
      <aside className="hidden lg:flex w-[272px] flex-col border-r border-white/[0.07] bg-[#070d18]/90 backdrop-blur-2xl">
        <div className="px-5 pt-6 pb-5 border-b border-white/[0.07]">
          <div className="flex items-center gap-3">
            <div className="brand-mark h-10 w-10 rounded-xl grid place-items-center shadow-lg shadow-sky-500/20"><Snowflake className="h-5 w-5 text-white" /></div>
            <div><div className="font-display font-extrabold text-[19px] tracking-[0.16em] leading-none">POLARIS</div><div className="text-[9px] text-slate-500 font-mono-tel uppercase tracking-[0.22em] mt-2">Ops Command / 01</div></div>
          </div>
          <div className="mt-5 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.05] px-3 py-2.5 flex items-center gap-2.5">
            <Satellite className="h-4 w-4 text-emerald-300" /><div className="min-w-0"><div className="text-[10px] uppercase tracking-widest text-emerald-300 font-semibold">Uplink stable</div><div className="text-[10px] text-slate-500 mt-0.5">Polar network · 12 ms</div></div><span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_9px_rgba(110,231,183,.9)]" />
          </div>
        </div>
        <nav className="p-4 flex-1 overflow-y-auto">
          {groups.map(group => <div key={group} className="mb-6"><div className="px-3 mb-2 text-[9px] font-mono-tel uppercase tracking-[0.22em] text-slate-600">{group}</div><div className="space-y-1">{NAV.filter(item => item.group === group).map(item => <NavItem key={item.to} item={item} />)}</div></div>)}
          <a href="/database-manager" data-testid="nav-database-manager" className="group flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl text-slate-400 hover:text-slate-100 hover:bg-white/[0.04]"><Database className="h-[17px] w-[17px]" /><span className="font-medium">Database Manager</span><ChevronRight className="ml-auto h-3.5 w-3.5 opacity-0 -translate-x-1 transition-all group-hover:opacity-50 group-hover:translate-x-0" /></a>
        </nav>
        <div className="px-5 py-4 border-t border-white/[0.07]"><div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono-tel uppercase tracking-widest"><Activity className="h-3.5 w-3.5 text-sky-400" /> All systems nominal</div><div className="mt-2 text-[9px] text-slate-600 font-mono-tel uppercase tracking-widest">Bharati · Maitri · Himadri · Camp Alpha</div><NavLink to="/login" className="inline-block mt-3 text-[10px] text-sky-400 hover:text-sky-300 font-mono-tel uppercase tracking-widest">Operator sign in →</NavLink></div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-[#070d18]/80 backdrop-blur-2xl px-4 md:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0"><div className="lg:hidden brand-mark h-8 w-8 rounded-lg grid place-items-center"><Menu className="h-4 w-4 text-white" /></div><div className="min-w-0"><div className="text-[10px] font-mono-tel uppercase tracking-[0.2em] text-slate-500 truncate">Integrated Expedition & Asset Command</div><div className="font-display font-semibold text-slate-100 text-sm md:text-[15px] mt-1 truncate">Mission Control <span className="text-slate-600 mx-1">/</span> Southern & Arctic Theatres</div></div></div>
          <div className="flex items-center gap-3 md:gap-4 shrink-0"><div className="hidden xl:flex items-center gap-2 rounded-lg border border-violet-400/20 bg-violet-400/[.06] px-2.5 py-1.5 text-[10px] font-mono-tel tracking-widest text-violet-200"><span className="h-1.5 w-1.5 rounded-full bg-violet-300 pulse-dot" />JUDGE DEMO MODE</div><UtcClock /><div className="hidden sm:flex items-center gap-2 text-[10px] px-2.5 py-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-300 font-mono-tel tracking-widest"><Radio className="h-3 w-3" /><span>UPLINK ACTIVE</span></div></div>
        </header>
        <div className="lg:hidden border-b border-white/[0.07] bg-[#070d18]/75 px-2 py-2 flex overflow-x-auto gap-1 no-scrollbar">{NAV.map(item => <NavItem key={item.to} item={item} mobile />)}<a href="/database-manager" data-testid="m-nav-database-manager" className="flex-shrink-0 px-3 py-1.5 text-xs rounded-xl text-slate-400 hover:text-slate-100">Database Manager</a></div>
        <main className="flex-1 min-w-0"><Outlet /></main>
      </div>
    </div>
  );
}

export { NAV };
