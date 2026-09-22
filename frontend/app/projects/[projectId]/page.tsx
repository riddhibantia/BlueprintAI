"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowRight, Play, History } from "lucide-react";
import { api } from "../../../lib/api/client";
import { checkConsistency } from "../../../lib/api/endpoints";
import { computeLifecycle, continueRoute, stageUpdated, Bundle } from "../../../lib/query/lifecycle";
import { timeAgo, fmtDate } from "../../../lib/utils/time";
import { useShell } from "../../../components/shell/context";
import { Card, Metric } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { StatusBadge } from "../../../components/ui/badge";
import { LoadingState, ErrorState, EmptyState, Progress } from "../../../components/ui/feedback";
import { ActivityItem, ArtifactLink } from "../../../components/ui/activity";

/** Project command center (§13): health, lifecycle, activity, attention — real values only. */
export default function Overview() {
  const { projectId: pid } = useParams() as { projectId: string };
  const { project, activity, reload } = useShell();
  const [b, setB] = useState<Bundle | null>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [issues, setIssues] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [reqs, prd, stories, arch, db, apis, security, tasks, tests, trace, iss, runList] = await Promise.all([
        api(`/projects/${pid}/requirements`), api(`/projects/${pid}/prd`), api(`/projects/${pid}/stories`),
        api(`/projects/${pid}/architecture`), api(`/projects/${pid}/database`), api(`/projects/${pid}/apis`),
        api(`/projects/${pid}/security`), api(`/projects/${pid}/tasks`), api(`/projects/${pid}/tests`),
        api(`/projects/${pid}/traceability`), api(`/projects/${pid}/consistency/issues`), api(`/projects/${pid}/runs`),
      ]);
      setB({ reqs, prd, stories, arch, db, apis, security, tasks, tests, coverage: trace.coverage, openIssues: iss.filter((i: any) => i.status === "open").length, links: trace.links });
      setIssues(iss);
      setRuns(runList);
    } catch (e: any) { setErr(e.message); }
  };

  useEffect(() => { load(); reload(); }, []);

  if (err && !b) return <ErrorState message={err} onRetry={load} />;
  if (!b || !project) return <LoadingState stage="Loading project command center" />;

  const stages = computeLifecycle(b);
  const open = issues.filter((i) => i.status === "open");
  const orphans: string[] = b.coverage?.orphans || [];

  const validate = async () => {
    setBusy(true);
    try { await checkConsistency(pid); await load(); await reload(); window.location.href = `/projects/${pid}/consistency`; }
    catch (e: any) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight">{project.name}</h1>
          <p className="text-[14px] text-secondary">Engineering blueprint</p>
          <p className="mt-1.5 flex items-center gap-2 text-[12.5px] text-secondary">
            <StatusBadge value={project.metrics?.blueprint_status || "Draft"} />
            <span>Created {fmtDate(project.created_at)} · Updated {timeAgo(activity[0]?.at || project.updated_at)}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => (window.location.href = `/projects/${pid}/${continueRoute(stages)}`)}>
            Continue Blueprint<ArrowRight size={14} />
          </Button>
          <Button loading={busy} onClick={validate}><Play size={13} />Run Validation</Button>
        </div>
      </div>

      {err && <div className="mb-3"><ErrorState message={err} /></div>}

      <div className="mb-3.5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Metric label="Requirements" value={b.reqs.length} />
        <Metric label="Traceability" value={`${b.coverage?.coverage_pct || 0}%`} hint="DB-computed" />
        <Metric label="Open Issues" value={open.length} />
        <Metric label="Connected Artifacts" value={b.links.length} hint="stored relationships" />
      </div>

      <Card className="mb-3.5">
        <h3 className="mb-3 text-[15px] font-semibold">Lifecycle</h3>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
          {stages.map((s) => (
            <a key={s.key} href={`/projects/${pid}/${s.route}`}
              className="rounded-xl border border-border bg-elevated p-3 transition-all duration-150 hover:-translate-y-0.5 hover:border-accent">
              <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">{s.label}</p>
              <p className="my-1.5"><StatusBadge value={s.state} /></p>
              <p className="text-[12px] text-secondary">{s.detail}</p>
              {(() => { const u = stageUpdated(runs, s.key); return u ? <p className="mt-1 text-[11px] text-muted">Ran {timeAgo(u)}</p> : null; })()}
            </a>
          ))}
        </div>
      </Card>

      <div className="grid gap-3.5 lg:grid-cols-2">
        <Card>
          <h3 className="mb-2 flex items-center gap-2 text-[15px] font-semibold"><History size={15} />Recent Activity</h3>
          {activity.length === 0
            ? <EmptyState title="No activity yet" hint="Generate your first requirements to start the trail." />
            : activity.slice(0, 8).map((e, i) => (
              <ActivityItem key={i} icon={<span className="text-[12px] text-accent">●</span>}
                title={e.label} context={e.detail} time={timeAgo(e.at)} />
            ))}
        </Card>
        <Card>
          <h3 className="mb-2 text-[15px] font-semibold">Needs Attention</h3>
          {open.length === 0 && orphans.length === 0
            ? <EmptyState title="All clear" hint="No open issues and no orphaned requirements." />
            : <>
              {open.slice(0, 3).map((i) => (
                <p key={i.id} className="border-b border-border py-2 text-[13px] last:border-b-0">
                  <StatusBadge value={i.severity} /> <span className="ml-1">{i.description.slice(0, 110)}</span><br />
                  <a href={`/projects/${pid}/consistency`} className="text-[12.5px] text-accent hover:underline">Inspect in Consistency →</a>
                </p>
              ))}
              {orphans.length > 0 && (
                <p className="py-2 text-[13px]">
                  <span className="mr-1">{orphans.slice(0, 5).map((o) => <ArtifactLink key={o} code={o} />)}</span>
                  <span className="text-secondary">orphaned — </span>
                  <a href={`/projects/${pid}/traceability`} className="text-[12.5px] text-accent hover:underline">link in Traceability →</a>
                </p>
              )}
            </>}
          <div className="mt-2">
            <p className="mb-1 text-[12px] text-secondary">Traceability coverage</p>
            <Progress pct={b.coverage?.coverage_pct || 0} label="Traceability coverage" />
          </div>
        </Card>
      </div>
    </div>
  );
}
