"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Send, Activity as ActivityIcon } from "lucide-react";
import MatrixOrb from "../ui/matrix-orb";
import { useShell } from "../shell/context";
import { api } from "../../lib/api/client";
import { checkConsistency, listRuns } from "../../lib/api/endpoints";
import { timeAgo } from "../../lib/utils/time";
import { StatusBadge } from "../ui/badge";
import { Button } from "../ui/button";
import { ActivityItem } from "../ui/activity";

/** Blueprint Copilot (§30): contextual, mode-explicit, never a blank chatbot. */
export function CopilotPanel() {
  const { pid, project, selection } = useShell();
  const path = usePathname() || "";
  const [tab, setTab] = useState<"ask" | "activity">("ask");
  const [mode, setMode] = useState<any>(null);
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<any>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!pid) return;
    api(`/projects/${pid}/copilot/mode`).then(setMode).catch(() => {});
    listRuns(pid).then(setRuns).catch(() => {});
  }, [pid]);

  const ask = async (question: string) => {
    if (!question.trim()) return;
    setBusy(true); setErr(""); setAnswer(null);
    try {
      setAnswer(await api(`/projects/${pid}/copilot/ask`, {
        method: "POST",
        body: JSON.stringify({ question, page: path.split("/").pop() || "", selection: selection || "" }),
      }));
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };

  const page = path.split("/").pop() || "overview";
  const quick: [string, () => void][] = [
    ["Find requirement gaps", () => ask("Which requirements are orphaned and what should link them?")],
    ["Explain this view", () => ask(`Explain the current ${page} state${selection ? ` and artifact ${selection}` : ""}.`)],
    ["Check consistency", async () => { setBusy(true); try { await checkConsistency(pid); await ask("What changed after the latest consistency check?"); } catch (e: any) { setErr(e.message); } setBusy(false); }],
  ];

  return (
    <div>
      <h4 className="flex items-center gap-2 text-[13.5px] font-semibold">
        <MatrixOrb state={busy ? "thinking" : "idle"} size={26} color="#5eead4" labels={{ idle: "Idle", thinking: "Working…" }} aria-label={busy ? "Copilot working" : "Copilot idle"} />
        Blueprint Copilot
      </h4>
      <p className="mt-1">
        {mode ? <StatusBadge value={mode.mode === "ai" ? "AI Copilot" : "Rule-based Copilot"} /> : <span className="text-secondary">Detecting mode…</span>}
      </p>
      <div className="mt-2 rounded-xl border border-border bg-canvas p-2.5 text-[12px]">
        <p className="font-semibold text-primary">Context</p>
        <p className="truncate">{project?.name || "…"}</p>
        <p className="text-secondary">{page}{selection ? ` · ${selection}` : ""}</p>
      </div>

      <div className="mt-2.5 flex gap-1 border-b border-border" role="tablist" aria-label="Copilot tabs">
        {(["ask", "activity"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`px-2.5 py-1.5 text-[12.5px] font-medium capitalize ${tab === t ? "border-b-2 border-accent text-primary" : "text-secondary"}`}>
            {t === "ask" ? "Ask" : "Activity"}
          </button>
        ))}
      </div>

      {tab === "ask" ? (
        <div className="mt-2.5">
          <p className="mb-1.5 text-[11.5px] font-bold uppercase tracking-wide text-muted">Suggested actions</p>
          {quick.map(([label, run]) => (
            <button key={label} onClick={run} disabled={busy}
              className="mb-1.5 block w-full rounded-xl border border-border bg-canvas px-2.5 py-2 text-left text-[12.5px] hover:border-accent disabled:opacity-50">
              + {label}
            </button>
          ))}
          <div className="mt-2 flex gap-1.5">
            <input value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask(q)}
              placeholder="Ask about this blueprint…" aria-label="Ask Copilot"
              className="min-w-0 flex-1 rounded-xl border border-border bg-canvas px-2.5 py-2 text-[12.5px]" />
            <Button size="sm" loading={busy} onClick={() => ask(q)} aria-label="Send question"><Send size={13} /></Button>
          </div>
          {err && <p className="mt-2 text-[12.5px] text-danger">{err}</p>}
          {answer && (
            <div className="mt-2.5 rounded-xl border border-border bg-canvas p-2.5">
              <p className="mb-1"><StatusBadge value={answer.mode === "ai" ? "AI Copilot" : "Rule-based Copilot"} /></p>
              <p className="whitespace-pre-line text-[12.5px] leading-relaxed">{answer.answer}</p>
              {(answer.evidence || []).length > 0 && (
                <><p className="mb-1 mt-2 text-[11.5px] font-bold uppercase tracking-wide text-muted">Evidence</p>
                {answer.evidence.map((h: any, i: number) => (
                  <p key={i} className="mb-1 border-t border-border pt-1 font-mono text-[11.5px] text-secondary">
                    {h.source} · {h.section} · {h.score}<br />{h.content?.slice(0, 160)}…
                  </p>
                ))}</>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-2">
          <p className="mb-1 flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wide text-muted">
            <ActivityIcon size={12} />Agent activity (safe operational states)
          </p>
          {runs.length === 0 && <p className="text-[12.5px] text-secondary">No agent runs yet.</p>}
          {runs.slice(0, 12).map((r, i) => (
            <ActivityItem key={i} icon={<span className="text-[11px] text-accent">●</span>}
              title={`${r.agent} agent`} context={r.output} time={`${timeAgo(r.at)} · ${r.latency_ms}ms`} />
          ))}
        </div>
      )}
    </div>
  );
}
