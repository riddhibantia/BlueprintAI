"use client";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import {
  useRequirements, usePrd, useStories, useArchitecture, useDatabase, useApis,
  useSecurity, useTasks, useTests, useTraceability, useIssues, useRuns, useWrite,
} from "../../../../lib/query/useArtifacts";
import { computeLifecycle, continueRoute, stageUpdated, Bundle } from "../../../../lib/query/lifecycle";
import { timeAgo } from "../../../../lib/utils/time";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { StatusBadge, Badge } from "../../../../components/ui/badge";
import { LoadingState, ErrorState } from "../../../../components/ui/feedback";

/** Blueprint pipeline (§16): contextual Generate / Review / Approve / Validate per stage. */
export default function Blueprint() {
  const { projectId: pid } = useParams() as { projectId: string };
  const router = useRouter();
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
  const [busyLabel, setBusyLabel] = useState<string | null>(null);

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
  // One primary button per page: the next actionable stage's generate action.
  // Locked (not started / blocked) stages render neutral — red is for failures.
  const nextKey = stages.find((s) => s.route === continueRoute(stages))?.key;

  const post = (path: string, go: string, label: string) => {
    setBusyLabel(label);
    write.mutate(
      { path, init: { method: "POST", body: "{}" } },
      { onSuccess: () => router.push(`/projects/${pid}/${go}`), onSettled: () => setBusyLabel(null) });
  };

  const runNav = (go: string) => () => router.push(`/projects/${pid}/${go}`);

  // Design stages through the mutation cache (invalidation included) — never raw
  // fetches plus a full reload, which would wipe the query cache mid-pipeline.
  const genAllDesign = async () => {
    setBusyLabel("Generate all");
    try {
      for (const path of [`/projects/${pid}/architecture/generate`, `/projects/${pid}/database/generate`,
                           `/projects/${pid}/apis/generate`, `/projects/${pid}/security/analyze`]) {
        await write.mutateAsync({ path, init: { method: "POST", body: "{}" } });
      }
      router.push(`/projects/${pid}/architecture`);
    } finally {
      setBusyLabel(null);
    }
  };
  const actions: Record<string, { label: string; run: () => void; primary?: boolean }[]> = {
    DISCOVER: [
      { label: "Clarify idea", run: runNav("requirements") },
      { label: "Generate requirements", primary: true, run: () => post(`/projects/${pid}/requirements/generate`, "requirements", "Generate requirements") },
      { label: "Review requirements", run: runNav("requirements") },
    ],
    DEFINE: [
      { label: "Generate PRD", primary: true, run: () => post(`/projects/${pid}/prd/generate`, "prd", "Generate PRD") },
      { label: "Generate stories", run: () => post(`/projects/${pid}/stories/generate`, "stories", "Generate stories") },
      { label: "Review PRD", run: runNav("prd") },
    ],
    DESIGN: [
      { label: "Generate all", primary: true, run: genAllDesign },
      { label: "Review architecture", run: runNav("architecture") },
    ],
    BUILD: [
      { label: "Generate tasks", primary: true, run: () => post(`/projects/${pid}/tasks/generate`, "tasks", "Generate tasks") },
      { label: "Review tasks", run: runNav("tasks") },
    ],
    VERIFY: [
      { label: "Generate tests", primary: true, run: () => post(`/projects/${pid}/tests/generate`, "tests", "Generate tests") },
      { label: "Validate consistency", run: () => post(`/projects/${pid}/consistency/check`, "consistency", "Validate consistency") },
      { label: "Analyze impact", run: runNav("impact") },
    ],
  };

  return (
    <div>
      <h1 className="text-[24px] font-bold tracking-tight">Blueprint Pipeline</h1>
      <p className="mb-5 text-[13.5px] text-secondary">Idea → requirements → artifacts → relationships → validation → impact → approval.</p>
      {write.isError && <div className="mb-3"><ErrorState message={(write.error as Error)?.message} /></div>}
      <div className="grid gap-2">
        {stages.map((s, i) => {
          const locked = s.state === "Blocked" || s.state === "Not Started";
          return (
          <div key={s.key} id={`stage-${s.key}`} className="scroll-mt-20">
            <Card>
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-[12px] text-muted">{String(i + 1).padStart(2, "0")}</span>
                <b className="text-[15px]">{s.label}</b>
                {locked ? (
                  <span title={s.detail}><Badge value="Locked" tone="neutral" /></span>
                ) : (
                  <StatusBadge value={s.state} />
                )}
                <span className="text-[12.5px] text-secondary">{s.detail}</span>
                {(() => { const u = stageUpdated(runs, s.key); return u ? <span className="text-[11.5px] text-muted">ran {timeAgo(u)}</span> : null; })()}
                <span className="ml-auto flex flex-wrap gap-1.5">
                  {(actions[s.key] || []).map((a) => {
                    const busy = busyLabel === a.label;
                    const isNext = a.primary && s.key === nextKey;
                    return (
                      <Button key={a.label} variant={isNext ? "primary" : "ghost"} size="sm"
                        title={locked && !isNext ? s.detail : undefined}
                        loading={busy} disabled={busyLabel !== null} onClick={a.run}>
                        {busy ? "Working…" : a.label}
                      </Button>
                    );
                  })}
                </span>
              </div>
            </Card>
          </div>
          );
        })}
      </div>
    </div>
  );
}
