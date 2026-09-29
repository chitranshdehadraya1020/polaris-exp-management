import { useEffect, useRef, useState } from "react";
import { streamChat, api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Bot, Send, Sparkles, User, Wind, Fuel, LifeBuoy, Route } from "lucide-react";

const QUICK = [
  { icon: Route, label: "Optimize Route", prompt: "Suggest the safest 5-day resupply route from Cape Town to Bharati Station given current sea-ice forecast. Include waypoints." },
  { icon: Fuel, label: "Fuel Burn", prompt: "Calculate approximate diesel consumption for an 18-person, 45-day deep-field traverse using 2 sledges and 1 skidoo." },
  { icon: Wind, label: "Weather Window", prompt: "How do I evaluate a safe weather window for a helicopter medevac from Maitri during katabatic wind season?" },
  { icon: LifeBuoy, label: "SOS Protocol", prompt: "Draft a step-by-step SOS response protocol for a crevasse-fall incident 40km from station." },
];

const SID_KEY = "polaris_ai_sid";
function getSid() {
  let s = localStorage.getItem(SID_KEY);
  if (!s) {
    s = "sess-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(SID_KEY, s);
  }
  return s;
}

export default function AIAssistant() {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);
  const sid = getSid();

  useEffect(() => {
    (async () => {
      const r = await api.get(`/ai/history/${sid}`);
      setMsgs(r.data.map(m => ({ role: m.role, text: m.text })));
    })();
  }, [sid]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const send = async (text) => {
    const q = (text ?? input).trim();
    if (!q || sending) return;
    setMsgs(m => [...m, { role: "user", text: q }, { role: "assistant", text: "" }]);
    setInput("");
    setSending(true);
    try {
      await streamChat(sid, q, (chunk) => {
        setMsgs(m => {
          const copy = m.slice();
          copy[copy.length - 1] = { role: "assistant", text: copy[copy.length - 1].text + chunk };
          return copy;
        });
      });
    } catch (e) {
      setMsgs(m => {
        const copy = m.slice();
        copy[copy.length - 1] = { role: "assistant", text: "⚠️ Uplink lost. Please retry." };
        return copy;
      });
    }
    setSending(false);
  };

  return (
    <div className="h-[calc(100vh-64px)] lg:h-screen flex flex-col">
      <div className="border-b border-slate-800/80 bg-slate-950/70 px-4 md:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 grid place-items-center shadow-lg shadow-sky-500/30">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="text-[10px] font-mono-tel uppercase tracking-widest text-slate-500">GPT-5 mini · Persistent chat</div>
            <div className="font-display text-lg font-semibold">POLARIS-AI Expedition Advisor</div>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-1.5 text-xs text-emerald-300 font-mono-tel">
          <Sparkles className="h-3.5 w-3.5" /> ONLINE
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-5">
        {msgs.length === 0 && (
          <div className="max-w-3xl mx-auto">
            <h2 className="font-display text-2xl font-bold text-slate-100">How can POLARIS-AI assist your mission?</h2>
            <p className="text-sm text-slate-400 mt-1">Ask about route planning, fuel budgeting, weather windows, cargo prioritization or SOS protocols.</p>
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
              {QUICK.map(q => (
                <button key={q.label} data-testid={`quick-${q.label.replace(/\s/g, "-").toLowerCase()}`}
                  onClick={() => send(q.prompt)}
                  className="text-left rounded-xl border border-slate-800 hover:border-sky-500/40 bg-slate-950/70 p-4 hover-lift">
                  <q.icon className="h-4 w-4 text-sky-400 mb-2" />
                  <div className="font-semibold text-sm text-slate-100">{q.label}</div>
                  <div className="text-xs text-slate-400 mt-1">{q.prompt}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {msgs.map((m, idx) => (
          <div key={idx} className={`max-w-3xl mx-auto flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
            {m.role === "assistant" && (
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 grid place-items-center flex-shrink-0">
                <Bot className="h-4 w-4 text-white" />
              </div>
            )}
            <div className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${
              m.role === "user"
                ? "bg-sky-500 text-slate-950 font-medium max-w-[75%]"
                : "border border-slate-800 bg-slate-950/70 text-slate-200 max-w-[80%] whitespace-pre-wrap"
            }`}>
              {m.text || <span className="text-slate-500">▍</span>}
            </div>
            {m.role === "user" && (
              <div className="h-8 w-8 rounded-lg bg-slate-800 grid place-items-center flex-shrink-0">
                <User className="h-4 w-4 text-slate-300" />
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="border-t border-slate-800/80 bg-slate-950/70 px-4 md:px-8 py-4">
        <div className="max-w-3xl mx-auto flex gap-2 items-end">
          <Textarea
            data-testid="input-ai-prompt"
            placeholder="Ask POLARIS-AI about routes, cargo, personnel, or emergency protocols..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            rows={1}
            className="resize-none bg-slate-950 border-slate-800 min-h-[44px] max-h-40"
          />
          <Button data-testid="btn-send-ai-message" onClick={() => send()}
            disabled={sending || !input.trim()}
            className="bg-sky-500 hover:bg-sky-400 text-slate-950 h-11">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

