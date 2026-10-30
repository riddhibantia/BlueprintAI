"use client";
import { useParams } from "next/navigation";
import { useIssues, useRuns, useWrite } from "../../../../lib/query/useArtifacts";
import { timeAgo } from "../../../../lib/utils/time";
import { Card, Metric } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { LoadingState, ErrorState, EmptyState } from "../../../../components/ui/feedback";
import { IssueCard } from "../../../../components/ui/activity";

/** Deterministic check categories the backend actually runs (§27: no fabricated checks). */
const CHECKS = ["req-api", "req-test", "sec-api", "api-db", "prd-db", "req-arch"];

/** Consistency workspace (§27): evidence first — severity, artifacts, evidence, status, timestamps. */
export default function Consistency() {
  const { projectId: pid } = useParams() as { projectId: string };
  const issuesQ = useIssues(pid);
  const runsQ = useRuns(pid);
  const write = useWrite(pid, ["issues", "activity", "runs"]);

  if (issuesQ.isLoading) return <LoadingState stage="Loading consistency issues" />;
  if (issuesQ.isError) return <ErrorState message={(issuesQ.error as Error)?.message} onRetry={() => issuesQ.refetch()} />;
  const issues = issuesQ.data || [];
  const open = issues.filter((i: any) => i.status === "open");
  const warns = open.filter((i: any) => i.severity === "warning").length;
  const errors = open.filter((i: any) => ["conflict", "high"].includes((i.severity || "").toLowerCase())).length;
  // Metrics are only meaningful after a check has run; before that the page
  // shows "—" instead of claiming six passing checks that never executed.
  const hasRun = (runsQ.data || []).some((r: any) => r.agent === "consistency");
  const decide = (id: string, status: string) => write.mutate({
    path: `/projects/${pid}/consistency/issues/${id}`, init: { method: "PATCH", body: JSON.stringify({ status }) },
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight">Consistency</h1>
          <p className="text-[13px] text-secondary">Deterministic cross-artifact checks — AI explains, you decide</p>
        </div>
        <Button loading={write.isPending} onClick={() => write.mutate({ path: `/projects/${pid}/consistency/check`, init: { method: "POST" } })}>
          Run consistency check
        </Button>
      </div>
      {write.isError && <div className="mb-3"><ErrorState message={(write.error as Error)?.message} /></div>}

      <div className="mb-3.5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Metric label="Check categories" value={CHECKS.length} hint="req-api · req-test · sec-api · api-db · prd-db · req-arch" />
        <Metric label="Open issues" value={hasRun ? open.length : "—"} />
        <Metric label="Warnings" value={hasRun ? warns : "—"} />
        <Metric label="Errors" value={hasRun ? errors : "—"} />
      </div>

      {issues.length === 0 ? (
        <EmptyState title={hasRun ? "No open issues" : "No issues recorded"}
          hint={hasRun ? "The last check found nothing to flag. Re-run after the next change."
            : "Run a consistency check after generating the blueprint."}
          action={<Button onClick={() => write.mutate({ path: `/projects/${pid}/consistency/check`, init: { method: "POST" } })}>Run check</Button>} />
      ) : (
        <div className="grid gap-2.5">
          {issues.map((i: any) => (
            <IssueCard key={i.id} issue={i}>
              <p className="mt-1 text-[11.5px] text-muted">Found {timeAgo(i.created_at)}{i.updated_at && i.updated_at !== i.created_at ? ` · decided ${timeAgo(i.updated_at)}` : ""}</p>
              {i.status === "open" && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(["accepted", "rejected", "resolved"] as const).map((s) => (
                    <Button key={s} variant="ghost" size="sm" disabled={write.isPending} onClick={() => decide(i.id, s)}>
                      {s[0].toUpperCase() + s.slice(1)}
                    </Button>
                  ))}
                </div>
              )}
            </IssueCard>
          ))}
        </div>
      )}
      {write.isPending && <div className="mt-3"><LoadingState stage="Comparing architecture, APIs, database and tests" /></div>}
    </div>
  );
}
