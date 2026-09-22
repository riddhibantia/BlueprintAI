"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { checkConsistency, listIssues } from "../../../../lib/api/endpoints";
import { api } from "../../../../lib/api/client";
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
  const [issues, setIssues] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = () => listIssues(pid).then((r) => { setIssues(r); setLoaded(true); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [pid]);

  const check = async () => {
    setBusy(true);
    try { await checkConsistency(pid); await load(); }
    catch (e: any) { setErr(e.message); }
    setBusy(false);
  };
  const decide = async (id: string, status: string) => {
    await api(`/projects/${pid}/consistency/issues/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    await load();
  };

  if (err && !loaded) return <ErrorState message={err} onRetry={load} />;
  if (!loaded) return <LoadingState stage="Loading consistency issues" />;

  const open = issues.filter((i) => i.status === "open");
  const warns = open.filter((i) => i.severity === "warning").length;
  const errors = open.filter((i) => ["conflict", "high"].includes((i.severity || "").toLowerCase())).length;
  const withIssues = new Set(open.map((i) => i.check));
  const passed = CHECKS.filter((c) => !withIssues.has(c)).length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight">Consistency</h1>
          <p className="text-[13px] text-secondary">Deterministic cross-artifact checks — AI explains, you decide</p>
        </div>
        <Button loading={busy} onClick={check}>Run consistency check</Button>
      </div>
      {err && <div className="mb-3"><ErrorState message={err} /></div>}

      <div className="mb-3.5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Metric label="Checks run" value={CHECKS.length} hint="req-api · req-test · sec-api · api-db · prd-db · req-arch" />
        <Metric label="Passed" value={passed} />
        <Metric label="Warnings" value={warns} />
        <Metric label="Errors" value={errors} />
      </div>

      {issues.length === 0 ? (
        <EmptyState title="No issues recorded" hint="Run a consistency check after generating the blueprint." action={<Button onClick={check}>Run check</Button>} />
      ) : (
        <div className="grid gap-2.5">
          {issues.map((i) => (
            <IssueCard key={i.id} issue={i}>
              <p className="mt-1 text-[11.5px] text-muted">Found {timeAgo(i.created_at)}{i.updated_at && i.updated_at !== i.created_at ? ` · decided ${timeAgo(i.updated_at)}` : ""}</p>
              {i.status === "open" && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => decide(i.id, "accepted")}>Accept</Button>
                  <Button variant="ghost" size="sm" onClick={() => decide(i.id, "rejected")}>Reject</Button>
                  <Button variant="ghost" size="sm" onClick={() => decide(i.id, "resolved")}>Resolve</Button>
                </div>
              )}
            </IssueCard>
          ))}
        </div>
      )}
      {busy && <div className="mt-3"><LoadingState stage="Comparing architecture, APIs, database and tests" /></div>}
    </div>
  );
}
