"use client";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Search } from "lucide-react";
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "OPEN" | "DECIDED">("OPEN");

  // Hooks run before the loading guard — see note in stories/page.tsx.
  const issues = issuesQ.data || [];
  const filteredIssues = useMemo(() => {
    return issues.filter((i) => {
      const q = search.toLowerCase();
      const matchesSearch =
        (i.description || "").toLowerCase().includes(q) ||
        (i.check || "").toLowerCase().includes(q) ||
        (i.suggestion || "").toLowerCase().includes(q) ||
        (i.affected || []).some((a: string) => a.toLowerCase().includes(q));
      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "OPEN" ? i.status === "open" : i.status !== "open");
      return matchesSearch && matchesStatus;
    });
  }, [issues, search, statusFilter]);

  if (issuesQ.isLoading) return <LoadingState stage="Loading consistency issues" />;
  if (issuesQ.isError) return <ErrorState message={(issuesQ.error as Error)?.message} onRetry={() => issuesQ.refetch()} />;
  const open = issues.filter((i) => i.status === "open");
  const warns = open.filter((i) => i.severity === "warning").length;
  const errors = open.filter((i) => ["conflict", "high"].includes((i.severity || "").toLowerCase())).length;
  const withIssues = new Set(open.map((i) => i.check));
  const hasRun = (runsQ.data || []).some((r) => r.agent === "consistency");
  const passed = hasRun ? CHECKS.filter((c) => !withIssues.has(c)).length : "—";
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
        <div className="space-y-3.5">
          {/* Search & Status Filter Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-subtle p-2">
            <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5">
              <Search size={14} className="text-muted" aria-hidden />
              <label htmlFor="issue-search" className="sr-only">Search issues by description, check, or entity</label>
              <input
                id="issue-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search issues by description, check, or entity..."
                className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {(["OPEN", "ALL", "DECIDED"] as const).map((st) => {
                const count =
                  st === "ALL"
                    ? issues.length
                    : st === "OPEN"
                    ? open.length
                    : issues.length - open.length;
                const active = statusFilter === st;
                return (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors ${
                      active ? "bg-elevated font-semibold text-primary shadow-sm" : "text-secondary hover:text-primary"
                    }`}
                  >
                    {st === "OPEN" ? "Open Needs Triage" : st === "ALL" ? "All Issues" : "Resolved / Decided"}{" "}
                    <span className="font-mono text-[11px] text-muted">({count})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {filteredIssues.length === 0 ? (
            <EmptyState
              title="No matching issues"
              hint={`No consistency issues match "${search}" with filter ${statusFilter}.`}
            />
          ) : (
            <div className="grid gap-2.5">
              {filteredIssues.map((i) => (
                <IssueCard key={i.id} issue={i}>
                  <p className="mt-1 text-[11.5px] text-muted">
                    Found {timeAgo(i.created_at)}
                    {i.updated_at && i.updated_at !== i.created_at ? ` · decided ${timeAgo(i.updated_at)}` : ""}
                  </p>
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
        </div>
      )}
      {write.isPending && <div className="mt-3"><LoadingState stage="Comparing architecture, APIs, database and tests" /></div>}
    </div>
  );
}
