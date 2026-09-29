import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Snowflake, ArrowRight, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Auth({ mode = "login" }) {
  const isSignup = mode === "signup";
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "VIEWER" });
  const [busy, setBusy] = useState(false);

  const update = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  const submit = async (event) => {
    event.preventDefault();
    if (isSignup && !form.name.trim()) return toast.error("Please enter your name.");
    if (!form.email.trim() || !form.password) return toast.error("Email and password are required.");
    if (isSignup && form.password.length < 8) return toast.error("Password must be at least 8 characters.");
    setBusy(true);
    try {
      const response = await api.post(isSignup ? "/auth/register" : "/auth/login", {
        name: form.name.trim(), email: form.email.trim(), password: form.password, role: form.role,
      });
      if (response.data?.success === false) throw new Error(response.data.error || "Authentication failed.");
      toast.success(isSignup ? "Account created. Welcome to POLARIS." : "Welcome back to POLARIS.");
      navigate("/", { replace: true });
    } catch (error) {
      toast.error(error.message || "Unable to complete authentication.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050912] text-slate-100 grid-lines flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="brand-mark h-11 w-11 rounded-xl grid place-items-center shadow-lg shadow-sky-500/20"><Snowflake className="h-5 w-5 text-white" /></div>
          <div><div className="font-display font-extrabold text-xl tracking-[0.16em]">POLARIS</div><div className="text-[10px] text-slate-500 font-mono-tel uppercase tracking-[0.2em] mt-1">Ops Command / Secure Access</div></div>
        </div>
        <div className="rounded-2xl border border-sky-400/15 bg-[#070d18]/95 p-6 md:p-8 shadow-[0_20px_80px_rgba(14,165,233,.10)]">
          <div className="flex items-start gap-3 mb-6">
            <div className="rounded-lg bg-sky-400/10 p-2"><ShieldCheck className="h-5 w-5 text-sky-300" /></div>
            <div><h1 className="font-display text-2xl font-bold">{isSignup ? "Create command access" : "Sign in to command"}</h1><p className="text-sm text-slate-400 mt-1">{isSignup ? "Create an operator profile for the POLARIS console." : "Use your operator credentials to continue."}</p></div>
          </div>
          <form onSubmit={submit} className="space-y-4">
            {isSignup && <div><Label htmlFor="auth-name" className="text-xs text-slate-300">Full name</Label><Input id="auth-name" value={form.name} onChange={update("name")} placeholder="Alex Morgan" autoComplete="name" className="mt-1.5 bg-slate-950/70 border-slate-700" /></div>}
            <div><Label htmlFor="auth-email" className="text-xs text-slate-300">Email</Label><Input id="auth-email" type="email" value={form.email} onChange={update("email")} placeholder="operator@polaris.example" autoComplete="email" className="mt-1.5 bg-slate-950/70 border-slate-700" /></div>
            <div><Label htmlFor="auth-password" className="text-xs text-slate-300">Password</Label><Input id="auth-password" type="password" value={form.password} onChange={update("password")} placeholder="At least 8 characters" autoComplete={isSignup ? "new-password" : "current-password"} className="mt-1.5 bg-slate-950/70 border-slate-700" /></div>
            <Button type="submit" disabled={busy} className="w-full bg-sky-400 hover:bg-sky-300 text-slate-950 font-semibold">{busy ? "Connecting…" : isSignup ? "Create account" : "Sign in"}<ArrowRight className="h-4 w-4 ml-2" /></Button>
          </form>
          <div className="mt-6 pt-5 border-t border-white/[0.08] text-center text-sm text-slate-400">{isSignup ? "Already have an account?" : "Need an operator account?"} <Link className="text-sky-300 hover:text-sky-200 font-medium" to={isSignup ? "/login" : "/signup"}>{isSignup ? "Sign in" : "Create one"}</Link></div>
          <Link to="/" className="mt-4 flex items-center justify-center text-xs text-slate-500 hover:text-slate-300">Continue to public console</Link>
        </div>
      </div>
    </div>
  );
}
