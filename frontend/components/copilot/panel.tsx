"use client";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Bot, Send, Sparkles, Activity as ActivityIcon, Copy, Check, Columns2, Maximize2, X } from "lucide-react";
import { useShell } from "../shell/context";
import { api, API } from "../../lib/api/client";
import { checkConsistency, listRuns } from "../../lib/api/endpoints";
import { useRequirements, useTraceability } from "../../lib/query/useArtifacts";
import { timeAgo } from "../../lib/utils/time";
import { StatusBadge } from "../ui/badge";
import { Button } from "../ui/button";
import { ActivityItem } from "../ui/activity";
import { CitedText } from "../ui/slash";
import { useToast } from "../ui/toast";
import type { CopilotMode, CopilotAnswer, AgentRun } from "../../lib/api/types";
import { copyText } from "../../lib/clipboard";

/** Blueprint Copilot (§30): contextual, mode-explicit, page-aware prompts, copyable responses, dock/drawer support. */
export function CopilotPanel({ onClose, hideHeader = false }: { onClose?: () => void; hideHeader?: boolean }) {
  const { pid, project, selection, copilotMode, setCopilotMode } = useShell();
  const path = usePathname() || "";
  const toast = useToast();
  const [tab, setTab] = useState<"ask" | "activity">("ask");
  const [mode, setMode] = useState<CopilotMode | null>(null);
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<CopilotAnswer | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copiedAnswer, setCopiedAnswer] = useState(false);

  const reqsQ = useRequirements(pid);
  const traceQ = useTraceability(pid);
  const fingerprint = `${reqsQ.data?.length || 0}:${(reqsQ.data || []).filter((r: any) => r.status === "approved").length}:${traceQ.data?.links?.length || 0}`;
  const [answeredAt, setAnsweredAt] = useState<string | null>(null);
  const stale = answeredAt !== null && answeredAt !== fingerprint;

  useEffect(() => {
    if (!pid) return;
    api(`/projects/${pid}/copilot/mode`).then(setMode).catch(() => {});
    listRuns(pid).then(setRuns).catch(() => {});
  }, [pid]);

  const rawPage = path.split("/").pop() || "";
  const page = rawPage === pid ? "overview" : rawPage || "overview";

  const ask = async (question: string) => {
    if (!question.trim()) return;
    setCurrentQuestion(question);
    setBusy(true); setErr(""); setAnswer(null);
    try {
      const res = await fetch(`${API}/projects/${pid}/copilot/ask/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ question, page, selection: selection || "" }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      if (!reader) throw new Error("No response body");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "meta") {
                setAnswer({
                  answer: "",
                  evidence: data.evidence || [],
                  mode: data.mode || "ai",
                });
              } else if (data.type === "token") {
                const tokenText = data.text !== undefined ? data.text : (data.token ?? "");
                accumulated += tokenText;
                setAnswer((prev) => ({
                  answer: accumulated,
                  evidence: prev?.evidence || [],
                  mode: prev?.mode || "ai",
                }));
              } else if (data.type === "done") {
                setAnswer((prev) => ({
                  answer: accumulated,
                  evidence: data.evidence || prev?.evidence || [],
                  mode: data.mode || prev?.mode || "ai",
                }));
                setAnsweredAt(fingerprint);
              } else if (data.type === "error") {
                setErr(data.error);
              }
            } catch (err) {
              // Ignore partial JSON parse errors
            }
          }
        }
      }
    } catch (e: any) {
      // Fallback to non-streaming endpoint
      try {
        const res = await fetch(`${API}/projects/${pid}/copilot/ask`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ question, page, selection: selection || "" }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setAnswer(data);
        setAnsweredAt(fingerprint);
      } catch (err: any) {
        setErr(err.message || e.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const copyAnswer = async () => {
    if (!answer?.answer) return;
    if (!(await copyText(answer.answer))) {
      toast.error("Couldn't copy — your browser blocked clipboard access.");
      return;
    }
    setCopiedAnswer(true);
    toast.success("Copied Copilot answer to clipboard!");
    setTimeout(() => setCopiedAnswer(false), 2000);
  };

  const quickPrompts: [string, string][] = useMemo(() => {
    if (page === "apis") {
      return [
        ["Check auth rules", "Which API endpoints are missing authentication or rate limiting?"],
        ["Suggest missing endpoints", "What standard REST CRUD endpoints are missing from this specification?"],
        ["Explain API schemas", "Summarize the key request and response models across all endpoints."],
      ];
    }
    if (page === "database") {
      return [
        ["Check foreign keys", "Are there any database entities with missing foreign key references?"],
        ["Suggest indexes", "Which columns in these tables should have unique constraints or foreign key indexes?"],
        ["Explain data model", "Explain the core domain entities and their cardinalities."],
      ];
    }
    if (page === "requirements") {
      return [
        ["Find requirement gaps", "Which requirements are orphaned or lack downstream implementation artifacts?"],
        ["Check acceptance criteria", "Are any requirements missing measurable acceptance criteria?"],
        ["Suggest security controls", "What security or privacy requirements should be added to this project?"],
      ];
    }
    if (page === "traceability") {
      return [
        ["Find orphan artifacts", "List any requirements or code elements with no downstream links."],
        ["Explain broken links", "How can I auto-heal broken links in this project?"],
      ];
    }
    return [
      ["What should I do next?", "What is the next highest priority step in this project lifecycle?"],
      ["Summarize project scope", "Provide an executive summary of this project and its key artifacts."],
      ["Check consistency", "What changed after the latest consistency check and are there conflicts?"],
    ];
  }, [page, selection]);

  return (
    <div className="flex flex-col h-full">
      {/* Top action toolbar for docking and mode switching */}
      {!hideHeader && (
        <div className="flex items-center justify-between gap-2 border-b border-border/70 pb-2.5 mb-2">
          <div className="flex items-center gap-2">
            {busy ? (
              <ActivityIcon size={15} className="text-accent animate-pulse" aria-hidden />
            ) : mode?.mode === "ai" ? (
              <Sparkles size={15} className="text-accent" aria-hidden />
            ) : (
              <Bot size={15} className="text-secondary" aria-hidden />
            )}
            <span className="text-[13.5px] font-semibold text-primary">Blueprint Copilot</span>
            {mode && (
              <span className="rounded bg-elevated px-1.5 py-0.5 text-[10.5px] font-medium text-secondary">
                {mode.mode === "ai" ? "AI Mode" : "Rule Mode"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCopilotMode(copilotMode === "dock" ? "drawer" : "dock")}
              className="rounded-lg p-1 text-muted hover:bg-elevated hover:text-primary transition-colors"
              title={copilotMode === "dock" ? "Switch to Modal Overlay" : "Dock to Right Sidebar"}
              aria-label={copilotMode === "dock" ? "Switch to Modal Overlay" : "Dock to Right Sidebar"}
            >
              {copilotMode === "dock" ? <Maximize2 size={13} /> : <Columns2 size={13} />}
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1 text-muted hover:bg-elevated hover:text-primary transition-colors"
                title="Close Copilot"
                aria-label="Close Copilot"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Context pill */}
      <div className="mt-1 rounded-xl border border-border bg-canvas p-2.5 text-[12px]">
        <p className="font-semibold text-primary">Context</p>
        <p className="truncate font-medium text-secondary">{project?.name || "…"}</p>
        <p className="font-mono text-[11px] text-muted">{page}{selection ? ` · ${selection}` : ""}</p>
      </div>

      <div className="mt-2.5 flex gap-1 border-b border-border" role="tablist" aria-label="Copilot tabs">
        {(["ask", "activity"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`px-2.5 py-1.5 text-[12.5px] font-medium capitalize transition-colors ${tab === t ? "border-b-2 border-accent font-semibold text-primary" : "text-secondary hover:text-primary"}`}>
            {t === "ask" ? "Ask" : "Activity"}
          </button>
        ))}
      </div>

      {tab === "ask" ? (
        <div className="mt-2.5 flex-1 flex flex-col min-h-0">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">
            Suggested for {page}
          </p>
          <div className="space-y-1.5">
            {quickPrompts.map(([label, prompt]) => (
              <button
                key={label}
                onClick={() => ask(prompt)}
                disabled={busy}
                className="block w-full rounded-xl border border-border bg-canvas px-2.5 py-2 text-left text-[12px] text-secondary transition-all hover:border-accent hover:text-primary disabled:opacity-50"
              >
                + {label}
              </button>
            ))}
          </div>

          <div className="mt-2.5 flex gap-1.5">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  ask(q);
                  setQ("");
                }
              }}
              placeholder={`Ask Copilot about ${page}…`}
              className="flex-1 rounded-xl border border-border bg-canvas px-3 py-1.5 text-[12.5px] placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <Button size="sm" onClick={() => { ask(q); setQ(""); }} disabled={busy}>
              <Send size={13} />
            </Button>
          </div>

          {err && <p className="mt-2 text-[12.5px] text-danger" role="alert">{err}</p>}

          {answer && (
            <div className="mt-3 flex-1 overflow-y-auto rounded-xl border border-border bg-canvas p-3">
              <div className="mb-2 flex items-center justify-between border-b border-border/80 pb-1.5">
                <span className="font-semibold text-[12px] text-secondary truncate max-w-[240px]">Q: {currentQuestion}</span>
                <button
                  onClick={copyAnswer}
                  className="flex items-center gap-1 rounded bg-elevated px-1.5 py-0.5 text-[11px] font-medium text-secondary hover:text-primary"
                  title="Copy answer"
                >
                  {copiedAnswer ? <Check size={11} className="text-success" /> : <Copy size={11} />}
                  {copiedAnswer ? "Copied" : "Copy"}
                </button>
              </div>

              {stale && (
                <p className="mb-2 rounded bg-warning/10 p-1.5 text-[11px] text-warning" role="status">
                  Artifacts changed since this answer — regenerate if needed.
                </p>
              )}

              <div className="whitespace-pre-line text-[12.5px] leading-relaxed text-primary">
                <CitedText text={answer.answer} base={`/projects/${pid}`} />
              </div>

              {(answer.evidence || []).length > 0 && (
                <div className="mt-3 border-t border-border/80 pt-2">
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted">Evidence Cited</p>
                  <div className="space-y-1.5">
                    {(answer.evidence || []).map((h, i: number) => (
                      <div key={i} className="rounded-lg border border-border/60 bg-surface/50 p-2 font-mono text-[11px] text-secondary">
                        <div className="flex items-center justify-between text-muted">
                          <span>{h.source}</span>
                          {h.score !== undefined && <span className="text-accent">{Math.round(h.score * 100)}% relevance</span>}
                        </div>
                        <p className="mt-1 line-clamp-2 text-primary">{h.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-2.5 flex-1 overflow-y-auto">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">
            <ActivityIcon size={12} />Agent Activity Log
          </p>
          {runs.length === 0 && <p className="text-[12px] text-secondary">No agent runs recorded yet.</p>}
          <div className="space-y-1">
            {runs.slice(0, 12).map((r, i) => (
              <ActivityItem
                key={i}
                icon={<span className="text-[10px] text-accent">●</span>}
                title={`${r.agent} agent`}
                context={r.output_summary}
                time={r.at ? `${timeAgo(r.at)}${r.latency_ms ? ` · ${r.latency_ms}ms` : ""}` : undefined}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
