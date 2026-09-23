"use client";
import { ArrowRight, Inbox as InboxIcon, Play } from "lucide-react";
import { useShell } from "../../../components/shell/context";
import { useIssues, useTraceability, useWrite } from "../../../lib/query/useArtifacts";
import { computeLifecycle, continueRoute } from "../../../lib/query/lifecycle";
import { useRequirements, usePrd, useStories, useArchitecture, useDatabase, useApis, useSecurity, useTasks, useTests } from "../../../lib/query/useArtifacts";
import { timeAgo, fmtDate } from "../../../lib/utils/time";
import { Card, Metric } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { StatusBadge } from "../../../components/ui/badge";
import { LoadingState, ErrorState, EmptyState, Progress } from "../../../components/ui/feedback";
import { ActivityItem, ArtifactLink } from "../../../components/ui/activity";

/** Inbox home (§V3): health strip + triage queue + activity. Real values only. */
export default function InboxHome() {
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
  const validate = useWrite(pid, ["issues", "runs"]);

  const loading = [reqsQ, prdQ, storiesQ, archQ, dbQ, apisQ, secQ, tasksQ, testsQ, traceQ, issuesQ].some((q) => q.isLoading);
  const err = [reqsQ, prdQ, storiesQ, archQ, dbQ, apisQ, secQ, tasksQ, testsQ, traceQ, issuesQ].find((q) => q.isError);

  if (err && loading) return <ErrorState message={(err.error as Error)?.message || "Failed to load workspace"} />;
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

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight">{project.name}</h1>
          <p className="mt-1 flex items-center gap-2 text-[12.5px] text-secondary">
            <StatusBadge value={project.metrics?.blueprint_status || "Draft"} />
            <span>Created {fmtDate(project.created_at)} · Updated {timeAgo(activity[0]?.at || project.updated_at)}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => (window.location.href = `/projects/${pid}/${continueRoute(stages)}`)}>
            Continue Blueprint<ArrowRight size={14} />
          </Button>
          <Button loading={validate.isPending} onClick={() => validate.mutate(
            { path: `/projects/${pid}/consistency/check`, init: { method: "POST" } },
            { onSuccess: () => (window.location.href = `/projects/${pid}/consistency`) })}>
            <Play size={13} />Run Validation
          </Button>
        </div>
      </div>

      <div className="mb-3.5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Metric label="Requirements" value={reqs.length} />
        <Metric label="Traceability" value={`${bundle.coverage?.coverage_pct || 0}%`} hint="DB-computed" />
        <Metric label="Open Issues" value={open.length} />
        <Metric label="Connected Artifacts" value={bundle.links.length} hint="stored relationships" />
      </div>

      <Card className="mb-3.5">
        <h3 className="mb-2 flex items-center gap-2 text-[15px] font-semibold">
          <InboxIcon size={15} />Needs triage ({triageCount})
        </h3>
        {triageCount === 0 ? (
          <EmptyState title="All clear" hint="No open issues and no orphaned requirements." />
        ) : (
          <div className="grid gap-1.5">
            {open.slice(0, 5).map((i: any) => (
              <div key={i.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-canvas px-3 py-2">
                <StatusBadge value={i.severity} />
                <span className="min-w-0 flex-1 truncate text-[13px]">{i.description}</span>
                <span className="flex gap-1">
                  {(["accepted", "rejected", "resolved"] as const).map((s) => (
                    <button key={s} disabled={decide.isPending}
                      onClick={() => decide.mutate({ path: `/projects/${pid}/consistency/issues/${i.id}`, init: { method: "PATCH", body: JSON.stringify({ status: s }) } })}
                      className="rounded-full border border-border px-2.5 py-1 text-[12px] font-medium capitalize text-secondary hover:border-accent hover:text-primary disabled:opacity-50">
                      {s}
                    </button>
                  ))}
                </span>
              </div>
            ))}
            {orphans.slice(0, 5).map((o) => (
              <div key={o} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-canvas px-3 py-2">
                <StatusBadge value="orphan" />
                <ArtifactLink code={o} href={`/projects/${pid}/requirements`} />
                <span className="text-[12.5px] text-secondary">has no downstream links</span>
                <a href={`/projects/${pid}/traceability`} className="ml-auto text-[12.5px] font-semibold text-accent hover:underline">Link →</a>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-3.5 lg:grid-cols-2">
        <Card>
          <h3 className="mb-2 text-[15px] font-semibold">Lifecycle</h3>
          {stages.map((s) => (
            <a key={s.key} href={`/projects/${pid}/${s.route}`}
              className="flex items-center gap-2.5 border-b border-border py-2 last:border-b-0">
              <span className="w-20 flex-none text-[11px] font-bold uppercase tracking-[0.07em] text-muted">{s.label}</span>
              <StatusBadge value={s.state} />
              <span className="truncate text-[12.5px] text-secondary">{s.detail}</span>
            </a>
          ))}
          <div className="mt-2">
            <Progress pct={bundle.coverage?.coverage_pct || 0} label="Traceability coverage" />
          </div>
        </Card>
        <Card>
          <h3 className="mb-2 text-[15px] font-semibold">Recent Activity</h3>
          {activity.length === 0
            ? <EmptyState title="No activity yet" hint="Generate your first requirements to start the trail." />
            : activity.slice(0, 8).map((e, i) => (
              <ActivityItem key={i} icon={<span className="text-[12px] text-accent">●</span>}
                title={e.label} context={e.detail} time={timeAgo(e.at)} />
            ))}
        </Card>
      </div>
    </div>
  );
}
