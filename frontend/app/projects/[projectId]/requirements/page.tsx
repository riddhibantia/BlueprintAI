"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Filter, Plus, Search } from "lucide-react";
import { useRequirements, useTraceability, useWrite } from "../../../../lib/query/useArtifacts";
import { linkCounts } from "../../../../lib/query/links";
import { timeAgo } from "../../../../lib/utils/time";
import { Button } from "../../../../components/ui/button";
import { StatusBadge } from "../../../../components/ui/badge";
import { DataTable } from "../../../../components/ui/data";
import { LoadingState, ErrorState, EmptyState } from "../../../../components/ui/feedback";
import { Drawer } from "../../../../components/ui/overlay";
import { ArtifactLink } from "../../../../components/ui/activity";
import { traceArtifact, clarify as clarifyIdea } from "../../../../lib/api/endpoints";

/** Requirements workspace (§17): table + search/filter + detail drawer, cache-backed. */
export default function Requirements() {
  const { projectId: pid } = useParams() as { projectId: string };
  const reqsQ = useRequirements(pid);
  const traceQ = useTraceability(pid);
  const write = useWrite(pid, ["requirements", "traceability", "activity", "runs"]);
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState("");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sel, setSel] = useState<any>(null);
  const [selLinks, setSelLinks] = useState<any[]>([]);

  const reqs = reqsQ.data || [];
  const links = traceQ.data?.links || [];
  const counts = useMemo(() => linkCounts(links), [links]);
  const approved = reqs.filter((r) => r.status === "approved").length;
  const filtered = reqs.filter((r) =>
    (statusFilter === "all" || r.status === statusFilter) &&
    (r.code + r.title).toLowerCase().includes(q.toLowerCase()));

  const clarify = async () => {
    setQuestions((await clarifyIdea(pid)).questions || []);
  };
  const open = async (r: any) => {
    setSel(r);
    try { setSelLinks((await traceArtifact(pid, r.code)).forward || []); }
    catch { setSelLinks([]); }
  };

  useEffect(() => { if (sel) open(sel); }, [reqs]);

  if (reqsQ.isLoading) return <LoadingState stage="Loading requirements" />;
  if (reqsQ.isError) return <ErrorState message={(reqsQ.error as Error)?.message} onRetry={() => reqsQ.refetch()} />;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight">Requirements</h1>
          <p className="text-[13px] text-secondary">{reqs.length} total · {approved} approved · {reqs.length - approved} draft</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative" aria-label="Search requirements">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ID or title… — try /approve"
              className="w-56 rounded-full border border-border bg-surface py-2 pl-9 pr-3 text-[13px]" />
          </label>
          <label className="flex items-center gap-1.5 text-[12.5px] text-secondary">
            <Filter size={13} aria-hidden />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status"
              className="rounded-full border border-border bg-surface px-2.5 py-2 text-[12.5px]">
              <option value="all">All</option><option value="approved">Approved</option><option value="draft">Draft</option>
            </select>
          </label>
          <Button variant="ghost" onClick={clarify}>Clarify</Button>
          <Button loading={write.isPending} onClick={() => write.mutate({
            path: `/projects/${pid}/requirements/generate`,
            init: { method: "POST", body: JSON.stringify({ answers }) },
          })}><Plus size={14} />Generate</Button>
        </div>
      </div>

      {write.isError && <div className="mb-3"><ErrorState message={(write.error as Error)?.message} /></div>}
      {questions.length > 0 && (
        <div className="mb-3.5 rounded-2xl border border-border bg-surface p-4">
          <b className="text-[14px]">Clarification questions</b>
          <ul className="mt-1 list-disc pl-5 text-[13px] text-secondary">{questions.map((x) => <li key={x}>{x}</li>)}</ul>
          <label className="mt-2 block text-[13px]">Your answers
            <textarea rows={2} value={answers} onChange={(e) => setAnswers(e.target.value)}
              placeholder="Managers approve; email+password auth; receipts required… — type / for commands"
              className="mt-1 w-full rounded-xl border border-border bg-canvas p-2.5" />
          </label>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState title={reqs.length === 0 ? "No requirements yet" : "No matches"}
          hint={reqs.length === 0 ? "Start by clarifying your product idea." : "Adjust the search or filter."}
          action={reqs.length === 0 ? <Button onClick={() => write.mutate({ path: `/projects/${pid}/requirements/generate`, init: { method: "POST", body: JSON.stringify({ answers: "" }) } })}>Generate requirements</Button> : undefined} />
      ) : (
        <DataTable label="Requirements" head={<><th>ID</th><th>Title</th><th>Priority</th><th>Status</th><th>Coverage</th><th>Links</th><th>Updated</th></>}>
          {filtered.map((r) => (
            <tr key={r.id} onClick={() => open(r)} className="cursor-pointer" tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && open(r)} aria-label={`Open ${r.code}`}>
              <td className="font-mono text-[12.5px]">{r.code}</td>
              <td className="max-w-[320px]">{r.title}</td>
              <td className="text-secondary">{r.priority}</td>
              <td><StatusBadge value={r.status} /></td>
              <td>{counts[r.code] ? <StatusBadge value="linked" /> : <StatusBadge value="orphan" />}</td>
              <td className="font-mono text-[12.5px]">{counts[r.code] || 0}</td>
              <td className="text-[12.5px] text-secondary">{timeAgo(r.updated_at)}</td>
            </tr>
          ))}
        </DataTable>
      )}

      <Drawer open={!!sel} onClose={() => setSel(null)} label={`Requirement ${sel?.code}`} title={<span className="font-mono">{sel?.code}</span>}>
        {sel && (
          <div className="grid gap-3 text-[13.5px]">
            <p className="text-[15px] font-semibold">{sel.title}</p>
            <p className="flex gap-2"><StatusBadge value={sel.status} /><StatusBadge value={sel.priority} /><span className="text-secondary">v{sel.version}</span></p>
            {sel.description && <p className="text-secondary">{sel.description}</p>}
            <div>
              <b className="text-[12px] uppercase tracking-wide text-secondary">Traceability</b>
              {selLinks.length === 0
                ? <p className="mt-1 text-secondary">Orphaned — no downstream links yet.</p>
                : <ul className="mt-1 grid gap-1.5">{selLinks.map((l: any, i: number) => (
                  <li key={i} className="font-mono text-[12.5px]">{l.from} → {l.to} <span className="text-secondary">({l.rel})</span></li>
                ))}</ul>}
            </div>
            <div className="flex flex-wrap gap-2">
              {sel.status !== "approved" && (
                <Button size="sm" loading={write.isPending} onClick={() => write.mutate(
                  { path: `/requirements/${sel.id}/approve`, init: { method: "POST" } },
                  { onSuccess: () => setSel(null) })}>Approve</Button>
              )}
              <a href={`/projects/${pid}/impact`}><Button variant="ghost" size="sm">View impact</Button></a>
            </div>
            <p className="text-[12px] text-secondary">Linked artifacts: {selLinks.map((l: any, i: number) => <span key={i} className="mr-1"><ArtifactLink code={l.to} /></span>)}</p>
          </div>
        )}
      </Drawer>
      {write.isPending && <div className="mt-3"><LoadingState stage="Working — cache refreshes automatically" /></div>}
    </div>
  );
}
