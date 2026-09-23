"use client";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  useRequirements, usePrd, useStories, useArchitecture, useDatabase, useApis,
  useSecurity, useTasks, useTests, useTraceability, useIssues, useRuns, useWrite,
} from "../../../../lib/query/useArtifacts";
import { genArchitecture, genDatabase, genApis, analyzeSecurity } from "../../../../lib/api/endpoints";
import { computeLifecycle, stageUpdated, Bundle } from "../../../../lib/query/lifecycle";
import { timeAgo } from "../../../../lib/utils/time";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { StatusBadge } from "../../../../components/ui/badge";
import { LoadingState, ErrorState } from "../../../../components/ui/feedback";

/** Blueprint pipeline (§16): contextual Generate / Review / Approve / Validate per stage. */
export default function Blueprint() {
  const { projectId: pid } = useParams() as { projectId: string };
  const reqsQ = useRequirements(pid);
  const prdQ = usePrd(pid);
  const storiesQ = useStories(pid);
  const archQ = useArchitecture(pid);
  const dbQ = useDatabase(pid);
  const apisQ = useApis(pid);
  const secQ = useSecurity(pid);
  const tasksQ = useTasks(pid);
  const testsQ = useTests(pid);
  const traceQ = useTraceability(pid);
  const issuesQ = useIssues(pid);
  const runsQ = useRuns(pid);
  const write = useWrite(pid, ["project", "requirements", "prd", "stories", "architecture", "database", "apis", "security", "tasks", "tests", "traceability", "issues", "activity", "runs"]);
  const [designing, setDesigning] = useState(false);

  const queries = [reqsQ, prdQ, storiesQ, archQ, dbQ, apisQ, secQ, tasksQ, testsQ, traceQ, issuesQ, runsQ];
  const loading = queries.some((q) => q.isLoading);
  const failed = queries.find((q) => q.isError);

  if (loading) return <LoadingState stage="Loading blueprint pipeline" />;
  if (failed) return <ErrorState message={(failed.error as Error)?.message} />;

  const b: Bundle = {
    reqs: reqsQ.data || [], prd: prdQ.data, stories: storiesQ.data || [], arch: archQ.data, db: dbQ.data,
    apis: apisQ.data || [], security: secQ.data || [], tasks: tasksQ.data || [], tests: testsQ.data || [],
    coverage: traceQ.data?.coverage, openIssues: (issuesQ.data || []).filter((i: any) => i.status === "open").length,
    links: traceQ.data?.links || [],
  };
  const stages = computeLifecycle(b);
  const runs = runsQ.data || [];

  const post = (path: string, go: string) => write.mutate(
    { path, init: { method: "POST", body: "{}" } },
    { onSuccess: () => (window.location.href = `/projects/${pid}/${go}`) });

  const genAllDesign = async () => {
    setDesigning(true);
    try {
      await genArchitecture(pid);
      await genDatabase(pid);
      await genApis(pid);
      await analyzeSecurity(pid);
      window.location.href = `/projects/${pid}/architecture`;
    } finally {
      setDesigning(false);
    }
  };
  const actions: Record<string, { label: string; run: () => void; primary?: boolean }[]> = {
    DISCOVER: [
      { label: "Clarify idea", run: () => (window.location.href = `/projects/${pid}/requirements`) },
      { label: "Generate requirements", primary: true, run: () => post(`/projects/${pid}/requirements/generate`, "requirements") },
      { label: "Review requirements", run: () => (window.location.href = `/projects/${pid}/requirements`) },
    ],
    DEFINE: [
      { label: "Generate PRD", primary: true, run: () => post(`/projects/${pid}/prd/generate`, "prd") },
      { label: "Generate stories", run: () => post(`/projects/${pid}/stories/generate`, "stories") },
      { label: "Review PRD", run: () => (window.location.href = `/projects/${pid}/prd`) },
    ],
    DESIGN: [
      { label: "Generate all", primary: true, run: genAllDesign },
      { label: "Review architecture", run: () => (window.location.href = `/projects/${pid}/architecture`) },
    ],
    BUILD: [
      { label: "Generate tasks", primary: true, run: () => post(`/projects/${pid}/tasks/generate`, "tasks") },
      { label: "Review tasks", run: () => (window.location.href = `/projects/${pid}/tasks`) },
    ],
    VERIFY: [
      { label: "Generate tests", primary: true, run: () => post(`/projects/${pid}/tests/generate`, "tests") },
      { label: "Validate consistency", run: () => post(`/projects/${pid}/consistency/check`, "consistency") },
      { label: "Analyze impact", run: () => (window.location.href = `/projects/${pid}/impact`) },
    ],
  };

  return (
    <div>
      <h1 className="text-[24px] font-bold tracking-tight">Blueprint Pipeline</h1>
      <p className="mb-5 text-[13.5px] text-secondary">Idea → requirements → artifacts → relationships → validation → impact → approval.</p>
      {write.isError && <div className="mb-3"><ErrorState message={(write.error as Error)?.message} /></div>}
      <div className="grid gap-2">
        {stages.map((s, i) => (
          <div key={s.key} id={`stage-${s.key}`} className="scroll-mt-20">
            <Card>
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-[12px] text-muted">{String(i + 1).padStart(2, "0")}</span>
                <b className="text-[15px]">{s.label}</b>
                <StatusBadge value={s.state} />
                <span className="text-[12.5px] text-secondary">{s.detail}</span>
                {(() => { const u = stageUpdated(runs, s.key); return u ? <span className="text-[11.5px] text-muted">ran {timeAgo(u)}</span> : null; })()}
                <span className="ml-auto flex flex-wrap gap-1.5">
                  {(actions[s.key] || []).map((a) => (
                    <Button key={a.label} variant={a.primary ? "primary" : "ghost"} size="sm" disabled={write.isPending || designing} onClick={a.run}>
                      {write.isPending || designing ? "Working…" : a.label}
                    </Button>
                  ))}
                </span>
              </div>
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}
