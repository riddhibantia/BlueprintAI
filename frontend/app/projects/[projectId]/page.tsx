"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  AlertCircle,
  Database,
  Globe,
  ListChecks,
  Network,
  ShieldCheck,
  GitBranch,
  Sparkles,
} from "lucide-react";
import { useShell } from "../../../components/shell/context";
import { useIssues, useTraceability, useWrite } from "../../../lib/query/useArtifacts";
import { computeLifecycle, continueRoute } from "../../../lib/query/lifecycle";
import { useRequirements, usePrd, useStories, useArchitecture, useDatabase, useApis, useSecurity, useTasks, useTests } from "../../../lib/query/useArtifacts";
import { timeAgo, fmtDate } from "../../../lib/utils/time";
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { LoadingState, ErrorState, EmptyState, Progress } from "../../../components/ui/feedback";
import { ActivityItem, ArtifactLink } from "../../../components/ui/activity";
import { StatusBadge } from "../../../components/ui/badge";
import { cn } from "../../../lib/utils/cn";

const STAGE_STATUS_STYLES: Record<string, { dot: string; text: string; bg: string }> = {
  Complete: { dot: "bg-success", text: "text-success", bg: "bg-success/10" },
  "In Progress": { dot: "bg-warning", text: "text-warning", bg: "bg-warning/10" },
  "Needs Review": { dot: "bg-warning", text: "text-warning", bg: "bg-warning/10" },
  Blocked: { dot: "bg-border-strong", text: "text-muted", bg: "bg-elevated" },
  "Not Started": { dot: "bg-border-strong", text: "text-muted", bg: "bg-elevated" },
};

/** Project command center (§V3): KPI metrics strip, interactive pipeline stepper, triage queue, activity stream. */
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
    reqs,
    prd: prdQ.data,
    stories: storiesQ.data || [],
    arch: archQ.data,
    db: dbQ.data,
    apis: apisQ.data || [],
    security: secQ.data || [],
    tasks: tasksQ.data || [],
    tests: testsQ.data || [],
    coverage: traceQ.data?.coverage,
    openIssues: (issuesQ.data || []).filter((i: any) => i.status === "open").length,
    links: traceQ.data?.links || [],
  };

  const stages = computeLifecycle(bundle);
  const completedStages = stages.filter((s) => s.state === "Complete").length;
  const progressPercent = Math.round((completedStages / Math.max(1, stages.length)) * 100);

  const open = (issuesQ.data || []).filter((i: any) => i.status === "open");
  const orphans: string[] = bundle.coverage?.orphans || [];
  const triageCount = open.length + orphans.length;
  const next = stages.find((s) => s.route === continueRoute(stages)) || stages[0];
  const nextIdx = Math.max(0, stages.indexOf(next));

  return (
    <div className="space-y-4">
      {/* Header section with project title & metadata */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-primary">{project.name}</h1>
          {project.description && (
            <p className="mt-1 max-w-[75ch] text-[13.5px] leading-relaxed text-secondary">{project.description}</p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-3 font-mono text-[11.5px] text-muted">
            <span>Created {fmtDate(project.created_at)}</span>
            <span>·</span>
            <span>Last activity {timeAgo(activity[0]?.at || project.updated_at)}</span>
            <span>·</span>
            <span className="font-semibold text-accent">{completedStages} of {stages.length} stages complete</span>
          </div>
        </div>
      </div>

      {/* KPI Metric Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Link
          href={`/projects/${pid}/requirements`}
          className="group rounded-2xl border border-border bg-surface p-3.5 transition-all duration-150 hover:border-border-strong hover:bg-elevated/40"
        >
          <div className="flex items-center justify-between text-muted">
            <span className="text-[12px] font-medium text-secondary group-hover:text-primary">Requirements</span>
            <ListChecks size={15} className="text-success" />
          </div>
          <p className="mt-2 text-[22px] font-bold tracking-tight text-primary">{reqs.length}</p>
          <p className="mt-0.5 text-[11px] text-muted">
            {reqs.filter((r) => r.status === "approved").length} approved
          </p>
        </Link>

        <Link
          href={`/projects/${pid}/apis`}
          className="group rounded-2xl border border-border bg-surface p-3.5 transition-all duration-150 hover:border-border-strong hover:bg-elevated/40"
        >
          <div className="flex items-center justify-between text-muted">
            <span className="text-[12px] font-medium text-secondary group-hover:text-primary">APIs & Endpoints</span>
            <Globe size={15} className="text-tone-blue" />
          </div>
          <p className="mt-2 text-[22px] font-bold tracking-tight text-primary">{bundle.apis.length}</p>
          <p className="mt-0.5 text-[11px] text-muted">REST & OpenAPI 3.0</p>
        </Link>

        <Link
          href={`/projects/${pid}/database`}
          className="group rounded-2xl border border-border bg-surface p-3.5 transition-all duration-150 hover:border-border-strong hover:bg-elevated/40"
        >
          <div className="flex items-center justify-between text-muted">
            <span className="text-[12px] font-medium text-secondary group-hover:text-primary">Data Models</span>
            <Database size={15} className="text-warning" />
          </div>
          <p className="mt-2 text-[22px] font-bold tracking-tight text-primary">{bundle.db?.entities?.length || 0}</p>
          <p className="mt-0.5 text-[11px] text-muted">Tables & relationships</p>
        </Link>

        <Link
          href={`/projects/${pid}/traceability`}
          className="group rounded-2xl border border-border bg-surface p-3.5 transition-all duration-150 hover:border-border-strong hover:bg-elevated/40"
        >
          <div className="flex items-center justify-between text-muted">
            <span className="text-[12px] font-medium text-secondary group-hover:text-primary">Traceability</span>
            <GitBranch size={15} className="text-purple-500" />
          </div>
          <p className="mt-2 text-[22px] font-bold tracking-tight text-primary">{bundle.coverage?.coverage_pct || 0}%</p>
          <p className="mt-0.5 text-[11px] text-muted">
            {orphans.length > 0 ? `${orphans.length} orphaned` : "100% full coverage"}
          </p>
        </Link>
      </div>

      {/* Primary Next Action Banner */}
      <Card className="border-accent/30 bg-gradient-to-r from-accent/5 via-surface to-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-accent/15 px-2 py-0.5 font-mono text-[10.5px] font-bold uppercase tracking-wider text-accent">
                Step {nextIdx + 1} of {stages.length}
              </span>
              <span className="font-mono text-[11.5px] text-muted">Recommended next step</span>
            </div>
            <p className="mt-1 text-[16px] font-semibold text-primary">
              {next.label} <span className="font-normal text-secondary">— {next.detail}</span>
            </p>
          </div>
          <Button onClick={() => router.push(`/projects/${pid}/${continueRoute(stages)}`)}>
            Continue to {next.label} <ArrowRight size={14} />
          </Button>
        </div>
      </Card>

      {/* Interactive Lifecycle Pipeline Stepper */}
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-bold text-primary">Blueprint Pipeline Progress</h3>
            <p className="text-[12px] text-secondary">Artifact lifecycle stages and current readiness</p>
          </div>
          <span className="font-mono text-[12px] font-bold text-accent">{progressPercent}% complete</span>
        </div>

        <div className="grid gap-2 sm:grid-cols-5">
          {stages.map((s, idx) => {
            const style = STAGE_STATUS_STYLES[s.state] || STAGE_STATUS_STYLES["Not Started"];
            const isCurrent = s.key === next.key;
            return (
              <Link
                key={s.key}
                href={`/projects/${pid}/${s.route}`}
                prefetch
                className={cn(
                  "relative flex flex-col justify-between rounded-xl border p-3 transition-all duration-150",
                  isCurrent
                    ? "border-accent bg-elevated/70 shadow-sm"
                    : "border-border bg-canvas hover:border-border-strong hover:bg-elevated/30"
                )}
              >
                <div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono text-[10px] font-bold uppercase text-muted">
                      0{idx + 1}
                    </span>
                    <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold", style.bg, style.text)}>
                      {s.state}
                    </span>
                  </div>
                  <p className="mt-2 text-[13.5px] font-bold text-primary">{s.label}</p>
                  <p className="mt-0.5 line-clamp-2 text-[11.5px] text-secondary">{s.detail}</p>
                </div>
              </Link>
            );
          })}
        </div>

        <div className="mt-3.5 border-t border-border pt-3">
          <Progress pct={bundle.coverage?.coverage_pct || 0} label="Overall Traceability Graph Coverage" />
        </div>
      </Card>

      {/* Two Column Grid: Needs Attention vs Recent Activity */}
      <div className="grid gap-3.5 lg:grid-cols-2">
        <Card className="min-w-0 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[14px] font-bold text-primary">
              Needs Attention <span className="font-mono font-normal text-muted">({triageCount})</span>
            </h3>
            {triageCount > 0 && (
              <span className="rounded-full bg-warning/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-warning">
                Action required
              </span>
            )}
          </div>

          {triageCount === 0 ? (
            <EmptyState title="All clear" hint="No open issues and no orphaned requirements." />
          ) : (
            <div className="space-y-2">
              {open.slice(0, 3).map((i: any) => (
                <div key={i.id} className="rounded-xl border border-border bg-canvas p-3">
                  <p className="text-[13px] font-medium text-primary" title={i.description}>
                    {i.description}
                  </p>
                  <div className="mt-2 flex items-center gap-1.5">
                    {(["accepted", "rejected", "resolved"] as const).map((s) => (
                      <button
                        key={s}
                        disabled={decide.isPending}
                        onClick={() =>
                          decide.mutate({
                            path: `/projects/${pid}/consistency/issues/${i.id}`,
                            init: { method: "PATCH", body: JSON.stringify({ status: s }) },
                          })
                        }
                        className="rounded-lg border border-border px-2.5 py-1 text-[11.5px] font-semibold capitalize text-secondary transition-colors hover:border-border-strong hover:bg-elevated hover:text-primary disabled:opacity-50"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {orphans.slice(0, 2).map((o) => (
                <div key={o} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-canvas p-3">
                  <ArtifactLink code={o} href={`/projects/${pid}/requirements`} />
                  <span className="text-[12.5px] text-secondary">has no downstream linked artifacts</span>
                  <Link
                    href={`/projects/${pid}/traceability`}
                    prefetch
                    className="ml-auto text-[12px] font-semibold text-accent hover:underline"
                  >
                    Link →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="min-w-0 p-4">
          <h3 className="mb-3 text-[14px] font-bold text-primary">Recent Project Activity</h3>
          {activity.length === 0 ? (
            <EmptyState title="No activity yet" hint="Generate your first requirements to start the trail." />
          ) : (
            <div className="space-y-1">
              {activity.slice(0, 5).map((e, i) => (
                <ActivityItem
                  key={i}
                  icon={<span className="text-[11px] text-accent">●</span>}
                  title={e.label}
                  context={e.detail}
                  time={timeAgo(e.at)}
                />
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
