"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "../../../../lib/api/client";
import {
  clarify, genRequirements, genPrd, genStories, genArchitecture, genDatabase,
  genApis, analyzeSecurity, genTasks, genTests, checkConsistency,
} from "../../../../lib/api/endpoints";
import { computeLifecycle, stageUpdated, Bundle } from "../../../../lib/query/lifecycle";
import { timeAgo } from "../../../../lib/utils/time";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { StatusBadge } from "../../../../components/ui/badge";
import { LoadingState, ErrorState } from "../../../../components/ui/feedback";

/** Blueprint pipeline (§16): contextual Generate / Review / Approve / Validate per stage. */
export default function Blueprint() {
  const { projectId: pid } = useParams() as { projectId: string };
  const [b, setB] = useState<Bundle | null>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");

  const load = async () => {
    try {
      const [reqs, prd, stories, arch, db, apis, security, tasks, tests, trace, iss, runList] = await Promise.all([
        api(`/projects/${pid}/requirements`), api(`/projects/${pid}/prd`), api(`/projects/${pid}/stories`),
        api(`/projects/${pid}/architecture`), api(`/projects/${pid}/database`), api(`/projects/${pid}/apis`),
        api(`/projects/${pid}/security`), api(`/projects/${pid}/tasks`), api(`/projects/${pid}/tests`),
        api(`/projects/${pid}/traceability`), api(`/projects/${pid}/consistency/issues`), api(`/projects/${pid}/runs`),
      ]);
      setB({ reqs, prd, stories, arch, db, apis, security, tasks, tests, coverage: trace.coverage, openIssues: iss.filter((i: any) => i.status === "open").length, links: trace.links });
      setRuns(runList);
    } catch (e: any) { setErr(e.message); }
  };
  useEffect(() => { load(); }, []);

  const act = async (key: string, fn: () => Promise<any>, go: string) => {
    setBusy(key); setErr("");
    try { await fn(); window.location.href = `/projects/${pid}/${go}`; }
    catch (e: any) { setErr(e.message); }
    setBusy("");
  };
  const genAllDesign = () =>
    act("design", async () => { await genArchitecture(pid); await genDatabase(pid); await genApis(pid); await analyzeSecurity(pid); }, "architecture");

  if (err && !b) return <ErrorState message={err} onRetry={load} />;
  if (!b) return <LoadingState stage="Loading blueprint pipeline" />;

  const stages = computeLifecycle(b);
  const actions: Record<string, { label: string; run: () => void }[]> = {
    DISCOVER: [
      { label: "Clarify idea", run: () => act("clarify", () => clarify(pid), "requirements") },
      { label: "Generate requirements", run: () => act("reqs", () => genRequirements(pid), "requirements") },
      { label: "Review requirements", run: () => (window.location.href = `/projects/${pid}/requirements`) },
    ],
    DEFINE: [
      { label: "Generate PRD", run: () => act("prd", () => genPrd(pid), "prd") },
      { label: "Generate stories", run: () => act("stories", () => genStories(pid), "stories") },
      { label: "Review PRD", run: () => (window.location.href = `/projects/${pid}/prd`) },
    ],
    DESIGN: [
      { label: "Generate all", run: genAllDesign },
      { label: "Review architecture", run: () => (window.location.href = `/projects/${pid}/architecture`) },
    ],
    BUILD: [
      { label: "Generate tasks", run: () => act("tasks", () => genTasks(pid), "tasks") },
      { label: "Review tasks", run: () => (window.location.href = `/projects/${pid}/tasks`) },
    ],
    VERIFY: [
      { label: "Generate tests", run: () => act("tests", () => genTests(pid), "tests") },
      { label: "Validate consistency", run: () => act("verify", () => checkConsistency(pid), "consistency") },
      { label: "Analyze impact", run: () => (window.location.href = `/projects/${pid}/traceability`) },
    ],
  };

  return (
    <div>
      <h1 className="text-[24px] font-bold tracking-tight">Blueprint Pipeline</h1>
      <p className="mb-5 text-[13.5px] text-secondary">Idea → requirements → artifacts → relationships → validation → impact → approval.</p>
      {err && <div className="mb-3"><ErrorState message={err} /></div>}
      <div className="grid gap-2">
        {stages.map((s, i) => (
          <Card key={s.key}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-[12px] text-muted">{String(i + 1).padStart(2, "0")}</span>
              <b className="text-[15px]">{s.label}</b>
              <StatusBadge value={s.state} />
              <span className="text-[12.5px] text-secondary">{s.detail}</span>
              {(() => { const u = stageUpdated(runs, s.key); return u ? <span className="text-[11.5px] text-muted">ran {timeAgo(u)}</span> : null; })()}
              <span className="ml-auto flex flex-wrap gap-1.5">
                {(actions[s.key] || []).map((a) => (
                  <Button key={a.label} variant="ghost" size="sm" disabled={!!busy} onClick={a.run}>
                    {busy ? "Working…" : a.label}
                  </Button>
                ))}
              </span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
