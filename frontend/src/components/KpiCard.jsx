export default function KpiCard({ label, value, sub, tone = "cyan", icon: Icon, testId }) {
  const tones = {
    cyan: "text-sky-300 border-sky-400/25 bg-sky-400/[0.035]",
    amber: "text-orange-300 border-orange-400/25 bg-orange-400/[0.035]",
    emerald: "text-emerald-300 border-emerald-400/25 bg-emerald-400/[0.035]",
    rose: "text-rose-300 border-rose-400/25 bg-rose-400/[0.035]",
    indigo: "text-indigo-300 border-indigo-400/25 bg-indigo-400/[0.035]",
  };
  return (
    <div
      data-testid={testId}
      className={`relative overflow-hidden rounded-2xl border ${tones[tone]} p-5 hover-lift shadow-[0_12px_30px_rgba(0,0,0,.12)]`}
    >
      <div className="flex items-start justify-between">
        <div className="text-[10px] font-mono-tel uppercase tracking-[0.16em] text-slate-400">{label}</div>
        {Icon && <div className="rounded-lg border border-white/[0.08] bg-white/[0.04] p-2"><Icon className="h-4 w-4 text-slate-400" /></div>}
      </div>
      <div className="mt-4 font-mono-tel text-3xl lg:text-4xl font-extrabold text-slate-50 telemetry-glow tracking-[-0.06em]">{value}</div>
      {sub && <div className="mt-2 text-xs text-slate-400">{sub}</div>}
      <div className="mt-4 h-px w-full bg-gradient-to-r from-current/30 via-white/5 to-transparent" />
      <div className="pointer-events-none absolute -bottom-8 -right-8 h-24 w-24 rounded-full bg-gradient-to-br from-current/15 to-transparent blur-2xl" />
    </div>
  );
}
