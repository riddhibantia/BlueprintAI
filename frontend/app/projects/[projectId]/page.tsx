"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { useShell } from "../../../components/shell/context";
import { useIssues, useTraceability, useWrite } from "../../../lib/query/useArtifacts";
import { computeLifecycle, continueRoute } from "../../../lib/query/lifecycle";
import { useRequirements, usePrd, useStories, useArchitecture, useDatabase, useApis, useSecurity, useTasks, useTests } from "../../../lib/query/useArtifacts";
import { timeAgo, fmtDate } from "../../../lib/utils/time";
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { LoadingState, ErrorState, EmptyState, Progress } from "../../../components/ui/feedback";
import { ActivityItem, ArtifactLink } from "../../../components/ui/activity";
import { cn } from "../../../lib/utils/cn";

const STAGE_DOT: Record<string, string> = {
  Complete: "bg-success", "In Progress": "bg-warning", "Needs Review": "bg-warning",
  Blocked: "bg-border-strong", "Not Started": "bg-border-strong",
};

/** Inbox home (§V3): health strip + triage queue + activity. Real values only. */
export default function InboxHome() {
  const router = useRouter();
  const { pid, project, activity } = useShell();
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
  const decide = useWrite(pid, ["issues"]);

  const loading = [reqsQ, prdQ, storiesQ, archQ, dbQ, apisQ, secQ, tasksQ, testsQ, traceQ, issuesQ].some((q) => q.isLoading);
  const err = [reqsQ, prdQ, storiesQ, archQ, dbQ, apisQ, secQ, tasksQ, testsQ, traceQ, issuesQ].find((q) => q.isError);

  if (err) return <ErrorState message={(err.error as Error)?.message || "Failed to load workspace"} />;
  if (loading || !project) return <LoadingState stage="Loading inbox" />;

  const reqs = reqsQ.data || [];
  const bundle = {
    reqs, prd: prdQ.data, stories: storiesQ.data || [], arch: archQ.data, db: dbQ.data,
    apis: apisQ.data || [], security: secQ.data || [], tasks: tasksQ.data || [], tests: testsQ.data || [],
    coverage: traceQ.data?.coverage, openIssues: (issuesQ.data || []).filter((i: any) => i.status === "open").length,
    links: traceQ.data?.links || [],
  };
  const stages = computeLifecycle(bundle);
  const open = (issuesQ.data || []).filter((i: any) => i.status === "open");
  const orphans: string[] = bundle.coverage?.orphans || [];
  const triageCount = open.length + orphans.length;
  const next = stages.find((s) => s.route === continueRoute(stages)) || stages[0];
  const nextIdx = Math.max(0, stages.indexOf(next));

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-[26px] font-semibold">{project.name}</h1>
        {project.description && <p className="mt-1 max-w-[72ch] text-[13.5px] text-secondary">{project.description}</p>}
        <p className="mt-1 font-mono text-[12px] text-muted">Created {fmtDate(project.created_at)} · Updated {timeAgo(activity[0]?.at || project.updated_at)}</p>
      </div>

      <Card className="mb-3.5">
        <ol className="flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="Pipeline progress">
          {stages.map((s) => (
            <li key={s.key}>
              <Link href={`/projects/${pid}/${s.route}`} prefetch className="flex items-center gap-1.5 hover:underline">
                <span className={cn("h-2 w-2 rounded-full", STAGE_DOT[s.state])} aria-hidden />
                <span className="text-[13px] font-medium">{s.label}</span>
              </Link>
            </li>
          ))}
        </ol>
        <p className="mt-2 font-mono text-[11px] text-muted" aria-hidden>
          <span className="mr-3"><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-success" />done</span>
          <span className="mr-3"><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-warning" />needs you</span>
          <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-border-strong" />locked</span>
        </p>
        <div className="mt-3 border-t border-border pt-3">
          <Progress pct={bundle.coverage?.coverage_pct || 0} label="Traceability coverage" />
        </div>
      </Card>

      <Card className="mb-3.5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">Next step · {nextIdx + 1} of {stages.length}</p>
            <p className="mt-0.5 text-[14.5px] font-semibold">{next.label} — {next.detail}</p>
          </div>
          <Button onClick={() => router.push(`/projects/${pid}/${continueRoute(stages)}`)}>
            Continue<ArrowRight size={14} />
          </Button>
        </div>
      </Card>

      <div className="grid gap-3.5 lg:grid-cols-2">
        <Card className="min-w-0">
          <h3 className="mb-2 text-[15px] font-semibold">Needs attention ({triageCount})</h3>
          {triageCount === 0 ? (
            <EmptyState title="All clear" hint="No open issues and no orphaned requirements." />
          ) : (
            <div className="grid gap-1.5">
              {open.slice(0, 3).map((i: any) => (
                <div key={i.id} className="rounded-lg border border-border px-3 py-2">
                  <p className="truncate text-[13px]" title={i.description}>{i.description}</p>
                  <div className="mt-1.5 flex gap-1">
                    {(["accepted", "rejected", "resolved"] as const).map((s) => (
                      <button key={s} disabled={decide.isPending}
                        onClick={() => decide.mutate({ path: `/projects/${pid}/consistency/issues/${i.id}`, init: { method: "PATCH", body: JSON.stringify({ status: s }) } })}
                        className="rounded-md border border-border px-2 py-1 text-[12px] font-medium capitalize text-secondary hover:text-primary disabled:opacity-50">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {orphans.slice(0, 2).map((o) => (
                <div key={o} className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2">
                  <ArtifactLink code={o} href={`/projects/${pid}/requirements`} />
                  <span className="text-[12.5px] text-secondary">has no downstream links</span>
                  <Link href={`/projects/${pid}/traceability`} prefetch className="ml-auto text-[12.5px] font-semibold text-accent hover:underline">Link →</Link>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="min-w-0">
          <h3 className="mb-2 text-[15px] font-semibold">Recent Activity</h3>
          {activity.length === 0
            ? <EmptyState title="No activity yet" hint="Generate your first requirements to start the trail." />
            : activity.slice(0, 5).map((e, i) => (
              <ActivityItem key={i} icon={<span className="text-[12px] text-accent">●</span>}
                title={e.label} context={e.detail} time={timeAgo(e.at)} />
            ))}
        </Card>
      </div>
    </div>
  );
}
