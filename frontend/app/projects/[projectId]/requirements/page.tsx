"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, Filter, History, Pencil, Plus, RotateCcw, Search, Trash2, Unlink } from "lucide-react";
import { useRequirements, useTraceability, useWrite } from "../../../../lib/query/useArtifacts";
import { linkCounts } from "../../../../lib/query/links";
import { timeAgo, fmtDate } from "../../../../lib/utils/time";
import { Button } from "../../../../components/ui/button";
import { StatusBadge, Badge } from "../../../../components/ui/badge";
import { DataTable, Pagination } from "../../../../components/ui/data";
import { LoadingState, ErrorState, EmptyState } from "../../../../components/ui/feedback";
import { Drawer, Dialog } from "../../../../components/ui/overlay";
import { ArtifactLink } from "../../../../components/ui/activity";
import { api } from "../../../../lib/api/client";
import { traceArtifact, clarify as clarifyIdea } from "../../../../lib/api/endpoints";
import { useToast } from "../../../../components/ui/toast";

/** Requirements workspace (§17): table + search/filter + detail drawer, cache-backed. */
export default function Requirements() {
  const { projectId: pid } = useParams() as { projectId: string };
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const qc = useQueryClient();
  const reqsQ = useRequirements(pid);
  const traceQ = useTraceability(pid);
  const write = useWrite(pid, ["requirements", "traceability", "activity", "runs"]);
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState("");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sel, setSel] = useState<any>(null);
  const [selLinks, setSelLinks] = useState<any[]>([]);
  const [editingSel, setEditingSel] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editPriority, setEditPriority] = useState("medium");
  const [editAc, setEditAc] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<"details" | "history">("details");
  const [versions, setVersions] = useState<any[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const [quickAddPriority, setQuickAddPriority] = useState("medium");
  const [quickAddType, setQuickAddType] = useState("functional");
  const [quickAddBusy, setQuickAddBusy] = useState(false);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [batchDeleteBusy, setBatchDeleteBusy] = useState(false);

  const startEdit = (r: any) => {
    setEditTitle(r.title || "");
    setEditDesc(r.description || "");
    setEditPriority(r.priority || "medium");
    setEditAc(r.acceptance_criteria || "");
    setEditingSel(true);
  };

  const saveEdit = () => {
    if (!sel || !editTitle.trim()) return;
    write.mutate({
      path: `/requirements/${sel.id}`,
      init: {
        method: "PUT",
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDesc.trim(),
          priority: editPriority,
          acceptance_criteria: editAc.trim(),
          expected_version: sel.version,
        }),
      },
    }, {
      onSuccess: () => {
        setEditingSel(false);
        setSel((prev: any) => ({
          ...prev,
          title: editTitle.trim(),
          description: editDesc.trim(),
          priority: editPriority,
          acceptance_criteria: editAc.trim(),
          version: (prev.version || 1) + 1,
        }));
      },
    });
  };

  const deleteReq = () => {
    if (!sel) return;
    write.mutate({
      path: `/requirements/${sel.id}`,
      init: { method: "DELETE" },
    }, {
      onSuccess: () => {
        setDeleteConfirmOpen(false);
        setSel(null);
      },
    });
  };

  const reqs = reqsQ.data || [];
  const links = traceQ.data?.links || [];
  const counts = useMemo(() => linkCounts(links), [links]);
  const approved = reqs.filter((r) => r.status === "approved").length;
  const filtered = reqs.filter((r) =>
    (statusFilter === "all" || r.status === statusFilter) &&
    (r.code + r.title).toLowerCase().includes(q.toLowerCase()));

  const [page, setPage] = useState(1);
  const pageSize = 25;
  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  // Reset page when filter changes
  useEffect(() => {
    setPage(1);
  }, [q, statusFilter]);

  // Bulk approve: checkbox column + bar. Approvals go through the mutation
  // cache one row at a time (no bulk endpoint) with per-run pending state.
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const toggleCheck = (id: string, on: boolean) => {
    setChecked((prev) => { const next = new Set(prev); if (on) next.add(id); else next.delete(id); return next; });
  };
  const toggleAll = (on: boolean) => {
    setChecked(on ? new Set(filtered.filter((r) => r.status !== "approved").map((r) => r.id)) : new Set());
  };
  const approveSelected = async () => {
    const targets = filtered.filter((r) => checked.has(r.id) && r.status !== "approved");
    if (targets.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    try {
      for (const r of targets) {
        await write.mutateAsync({ path: `/requirements/${r.id}/approve`, init: { method: "POST" } });
      }
      setChecked(new Set());
      if (reqs.length > 0 && approved + targets.length >= reqs.length) {
        runPipeline();
      }
    } finally {
      setBulkBusy(false);
    }
  };
  // Auto-pipeline: when the last approval lands, build everything server-side
  // (PRD → stories → architecture → data → APIs → security → tasks → tests)
  // and land on the finished blueprint instead of stranding the user.
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState("");
  const runPipeline = async () => {
    if (building) return;
    setBuilding(true);
    setBuildError("");
    try {
      await api(`/projects/${pid}/pipeline/run`, { method: "POST" });
      // The inbox cached every artifact before this run; drop that cache so the
      // blueprint page opens on the new artifacts instead of the old empty ones.
      await qc.invalidateQueries({ queryKey: ["p", pid] });
      router.push(`/projects/${pid}/blueprint`);
    } catch (e) {
      setBuildError(e instanceof Error ? e.message : "Pipeline failed.");
      setBuilding(false);
    }
  };
  const maybeAdvance = (newlyApproved: number) => {
    if (reqs.length > 0 && approved + newlyApproved >= reqs.length) {
      runPipeline();
    }
  };
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [ownOpen, setOwnOpen] = useState(false);
  const [ownTitle, setOwnTitle] = useState("");
  const [ownDesc, setOwnDesc] = useState("");
  const [ownPriority, setOwnPriority] = useState("medium");
  const addOwn = () => {
    if (!ownTitle.trim()) return;
    write.mutate(
      { path: `/projects/${pid}/requirements`,
        init: { method: "POST", body: JSON.stringify({ title: ownTitle.trim(), description: ownDesc.trim(), priority: ownPriority }) } },
      { onSuccess: () => { setOwnOpen(false); setOwnTitle(""); setOwnDesc(""); setOwnPriority("medium"); } });
  };
  const doGenerate = (replace: boolean) => {
    setConfirmRegen(false);
    write.mutate({
      path: `/projects/${pid}/requirements/generate`,
      init: { method: "POST", body: JSON.stringify({ answers, replace }) },
    }, { onSuccess: () => setChecked(new Set()) });
  };
  const checkable = filtered.filter((r) => r.status !== "approved");
  const allChecked = checkable.length > 0 && checkable.every((r) => checked.has(r.id));

  const [clarifying, setClarifying] = useState(false);
  const [clarifyError, setClarifyError] = useState("");
  const clarify = async () => {
    setClarifying(true);
    setClarifyError("");
    try {
      setQuestions((await clarifyIdea(pid)).questions || []);
    } catch (e) {
      setClarifyError(e instanceof Error ? e.message : "Could not load clarification questions.");
    } finally {
      setClarifying(false);
    }
  };
  const open = async (r: any) => {
    setSel(r);
    try { setSelLinks((await traceArtifact(pid, r.code)).forward || []); }
    catch { setSelLinks([]); }
  };

  // Refresh the open drawer's trace only when the selection (or its version)
  // changes — never on every requirements refetch.
  const selId = sel?.id;
  const selVersion = sel?.version;
  useEffect(() => {
    if (sel) {
      open(sel);
      loadVersions(sel.code);
    }
  }, [selId, selVersion]);

  // Deep-link from URL query parameter ?sel=REQ-xxx
  const selParam = searchParams.get("sel");
  useEffect(() => {
    if (selParam && reqs.length > 0) {
      const match = reqs.find((r: any) => r.code === selParam);
      if (match && (!sel || sel.code !== match.code)) {
        open(match);
      }
    }
  }, [selParam, reqs]);

  const loadVersions = async (code: string) => {
    setLoadingVersions(true);
    try {
      const allVers = await api<any[]>(`/projects/${pid}/versions?artifact_type=requirement`);
      const filteredVers = allVers.filter((v: any) => v.artifact_code === code);
      setVersions(filteredVers);
    } catch {
      setVersions([]);
    } finally {
      setLoadingVersions(false);
    }
  };

  const rollback = async (vid: string) => {
    setRollingBackId(vid);
    try {
      await api(`/projects/${pid}/versions/${vid}/rollback`, { method: "POST" });
      toast.success("Rolled back requirement to selected version!");
      await qc.invalidateQueries({ queryKey: ["p", pid] });
      setSel(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rollback failed");
    } finally {
      setRollingBackId(null);
    }
  };

  const inlineQuickAdd = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!quickAddTitle.trim() || quickAddBusy) return;
    setQuickAddBusy(true);
    try {
      await api(`/projects/${pid}/requirements`, {
        method: "POST",
        body: {
          title: quickAddTitle.trim(),
          priority: quickAddPriority,
          type: quickAddType,
          description: "",
          acceptance_criteria: "",
        },
      });
      setQuickAddTitle("");
      await qc.invalidateQueries({ queryKey: ["p", pid, "requirements"] });
      toast.success("Requirement added!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add requirement");
    } finally {
      setQuickAddBusy(false);
    }
  };

  const batchDeleteSelected = async () => {
    if (checked.size === 0 || batchDeleteBusy) return;
    setBatchDeleteBusy(true);
    try {
      for (const id of Array.from(checked)) {
        await write.mutateAsync({ path: `/requirements/${id}`, init: { method: "DELETE" } });
      }
      setChecked(new Set());
      setBatchDeleteOpen(false);
      toast.success("Selected requirements deleted");
    } catch (e) {
      toast.error("Failed to delete some requirements");
    } finally {
      setBatchDeleteBusy(false);
    }
  };

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
          <div className="relative">
            <label htmlFor="req-search" className="sr-only">Search requirements by ID or title</label>
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <input id="req-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ID or title…"
              className="w-56 rounded-full border border-border bg-surface py-2 pl-9 pr-3 text-[13px] placeholder:text-muted focus:border-accent focus:outline-none" />
          </div>
          <label className="flex items-center gap-1.5 text-[12.5px] text-secondary">
            <Filter size={13} aria-hidden />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status"
              className="rounded-full border border-border bg-surface px-2.5 py-2 text-[12.5px]">
              <option value="all">All</option><option value="approved">Approved</option><option value="draft">Draft</option>
            </select>
          </label>
          <Button variant="ghost" onClick={clarify} loading={clarifying}>Clarify</Button>
          <Button variant="ghost" onClick={() => setOwnOpen(true)}>Add your own</Button>
          <Button loading={write.isPending} onClick={() => (reqs.length > 0 ? setConfirmRegen(true) : doGenerate(false))}>
            <Plus size={14} />Generate
          </Button>
        </div>
      </div>

      {reqs.length > 0 && approved < reqs.length && approved > 0 && !building && (
        <div className="mb-3.5 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-3.5">
          <p className="min-w-0 flex-1 text-[13.5px]"><b>{approved} of {reqs.length} approved.</b> <span className="text-secondary">You can build from the approved ones now — or approve the rest first.</span></p>
          <Button onClick={runPipeline}>Build from {approved} approved<ArrowRight size={14} /></Button>
        </div>
      )}
      {reqs.length > 0 && approved === reqs.length && !building && (
        <div className="mb-3.5 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-3.5">
          <p className="min-w-0 flex-1 text-[13.5px]"><b>All {reqs.length} requirements approved.</b> <span className="text-secondary">Build the full blueprint — PRD, stories, architecture, data, APIs, security, tasks, tests.</span></p>
          <Button onClick={runPipeline}>Build my blueprint<ArrowRight size={14} /></Button>
        </div>
      )}
      {building && (
        <div className="mb-3.5 rounded-2xl border border-border bg-surface p-5" role="status" aria-live="polite">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-[3px] border-border border-t-accent" aria-hidden />
            <p className="text-[14px] font-semibold">Building your blueprint…</p>
          </div>
          <p className="mt-1 text-[13px] text-secondary">Generating PRD → stories → architecture → data model → APIs → security → tasks → tests. This takes a few seconds.</p>
        </div>
      )}
      {buildError && <div className="mb-3"><ErrorState message={buildError} onRetry={runPipeline} /></div>}
      {write.isError && <div className="mb-3"><ErrorState message={(write.error as Error)?.message} /></div>}
      {clarifyError && <div className="mb-3"><ErrorState message={clarifyError} /></div>}
      {questions.length > 0 && (
        <div className="mb-3.5 rounded-2xl border border-border bg-surface p-4">
          <b className="text-[14px]">Tell us what you want — in your own words</b>
          <p className="mt-0.5 text-[12.5px] text-secondary">Write plainly, like explaining to a friend. The generator reads this and shapes the requirements around it.</p>
          <ul className="mt-1.5 list-disc pl-5 text-[13px] text-secondary">{questions.map((x) => <li key={x}>{x}</li>)}</ul>
          <label className="mt-2 block text-[13px]">Your wishes
            <textarea rows={2} value={answers} onChange={(e) => setAnswers(e.target.value)}
              placeholder="Example: I want customers to book tables online and get an SMS reminder an hour before…"
              className="mt-1 w-full rounded-xl border border-border bg-canvas p-2.5 placeholder:text-muted focus:border-accent focus:outline-none" />
          </label>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState title={reqs.length === 0 ? "No requirements yet" : "No matches"}
          hint={reqs.length === 0 ? "Start by clarifying your product idea." : "Adjust the search or filter."}
          action={reqs.length === 0 ? <Button onClick={() => write.mutate({ path: `/projects/${pid}/requirements/generate`, init: { method: "POST", body: JSON.stringify({ answers: "" }) } })}>Generate requirements</Button> : undefined} />
      ) : (
        <>
        {checked.size > 0 && (
          <div className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-2.5 shadow-2xl backdrop-blur-md" role="status">
            <span className="text-[13px] font-semibold text-primary">{checked.size} selected</span>
            <Button size="sm" loading={bulkBusy} onClick={approveSelected}>
              <Check size={14} />Approve selected
            </Button>
            <Button size="sm" variant="danger" onClick={() => setBatchDeleteOpen(true)}>
              <Trash2 size={14} />Delete selected
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setChecked(new Set())}>Clear</Button>
          </div>
        )}
        <DataTable label="Requirements" head={<><th className="w-10"><input type="checkbox" checked={allChecked} onChange={(e) => toggleAll(e.target.checked)} aria-label="Select all approvable requirements" className="h-5 w-5 accent-primary" /></th><th>ID</th><th>Title</th><th>Priority</th><th>Status</th><th>Coverage</th><th>Links</th><th>Updated</th><th><span className="sr-only">Approve</span></th></>}>
          {paginated.map((r) => (
            <tr key={r.id} onClick={() => open(r)} className="cursor-pointer" tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(r); } }}
              aria-label={`Open ${r.code}`}>
              <td onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" checked={checked.has(r.id)} onChange={(e) => toggleCheck(r.id, e.target.checked)}
                  onKeyDown={(e) => e.stopPropagation()} aria-label={`Select ${r.code}`} className="h-5 w-5 accent-primary" />
              </td>
              <td className="font-mono text-[12.5px] text-secondary">{r.code}</td>
              <td className="max-w-[320px] truncate font-medium text-primary" title={r.title}>{r.title}</td>
              <td className="text-secondary">{r.priority}</td>
              <td><StatusBadge value={r.status} /></td>
              <td>{counts[r.code] ? (
                <span className="text-[12.5px] text-muted">covered</span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-danger/50 px-2 py-0.5 text-[11.5px] font-medium text-danger">
                  <Unlink size={11} aria-hidden />orphan
                </span>
              )}</td>
              <td><button onClick={(e) => { e.stopPropagation(); open(r); }}
                className="rounded-md px-1.5 py-1 font-mono text-[12.5px] text-secondary transition-colors hover:bg-elevated hover:text-primary" aria-label={`${counts[r.code] || 0} links for ${r.code}`}>
                {counts[r.code] || 0}
              </button></td>
              <td className="text-[12.5px] text-secondary">{timeAgo(r.updated_at)}</td>
              <td onClick={(e) => e.stopPropagation()}>
                {r.status !== "approved" && (
                  <button
                    onClick={() => write.mutate(
                      { path: `/requirements/${r.id}/approve`, init: { method: "POST" } },
                      { onSuccess: () => maybeAdvance(1) })}
                    disabled={write.isPending || bulkBusy}
                    className="rounded-lg border border-border px-2.5 py-1 text-[12px] font-semibold text-accent hover:border-accent disabled:opacity-50">
                    Approve
                  </button>
                )}
              </td>
            </tr>
          ))}
        </DataTable>
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          onPageChange={setPage}
          totalItems={filtered.length}
          pageSize={pageSize}
        />

        {/* Inline Quick-Add Row */}
        <form onSubmit={inlineQuickAdd} className="mt-3.5 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-2.5 shadow-xs">
          <input
            value={quickAddTitle}
            onChange={(e) => setQuickAddTitle(e.target.value)}
            placeholder="+ Add a requirement inline (e.g. Export reports as CSV) — press Enter to save"
            className="min-w-[280px] flex-1 rounded-lg border border-border bg-canvas px-3 py-1.5 text-[13px] outline-none placeholder:text-muted focus:border-primary"
          />
          <select
            value={quickAddPriority}
            onChange={(e) => setQuickAddPriority(e.target.value)}
            aria-label="Priority"
            className="rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-[12.5px] text-secondary outline-none"
          >
            <option value="low">Low Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="high">High Priority</option>
            <option value="critical">Critical Priority</option>
          </select>
          <select
            value={quickAddType}
            onChange={(e) => setQuickAddType(e.target.value)}
            aria-label="Type"
            className="rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-[12.5px] text-secondary outline-none"
          >
            <option value="functional">Functional</option>
            <option value="non-functional">Non-functional</option>
            <option value="security">Security</option>
          </select>
          <Button type="submit" size="sm" loading={quickAddBusy} disabled={!quickAddTitle.trim()}>
            <Plus size={14} />Add
          </Button>
        </form>
        </>
      )}

      <Drawer open={!!sel} onClose={() => { setSel(null); setEditingSel(false); setDrawerTab("details"); }} label={`Requirement ${sel?.code}`} title={<span className="font-mono">{sel?.code}</span>}>
        {sel && (
          <div>
            <div className="mb-4 flex gap-1 rounded-xl border border-border bg-subtle p-1" role="tablist">
              <button
                role="tab"
                aria-selected={drawerTab === "details"}
                onClick={() => setDrawerTab("details")}
                className={`flex-1 rounded-lg py-1.5 text-[12.5px] font-medium transition-colors ${
                  drawerTab === "details" ? "bg-surface font-semibold text-primary shadow-xs" : "text-secondary hover:text-primary"
                }`}
              >
                Details
              </button>
              <button
                role="tab"
                aria-selected={drawerTab === "history"}
                onClick={() => { setDrawerTab("history"); loadVersions(sel.code); }}
                className={`flex-1 rounded-lg py-1.5 text-[12.5px] font-medium transition-colors ${
                  drawerTab === "history" ? "bg-surface font-semibold text-primary shadow-xs" : "text-secondary hover:text-primary"
                }`}
              >
                Version History {versions.length > 0 && `(${versions.length})`}
              </button>
            </div>

            {drawerTab === "history" ? (
              <div className="space-y-3">
                {loadingVersions ? (
                  <LoadingState stage="Loading version history" />
                ) : versions.length === 0 ? (
                  <div className="rounded-xl border border-border bg-subtle p-4 text-center text-[13px] text-secondary">
                    No previous revisions recorded. Current is version <b>v{sel.version}</b>.
                  </div>
                ) : (
                  versions.map((v: any) => {
                    const isCurrent = v.version === sel.version;
                    const vTitle = v.content?.title || "";
                    const vAc = v.content?.acceptance_criteria || "";
                    const vDesc = v.content?.description || "";
                    return (
                      <div key={v.id} className="rounded-xl border border-border bg-surface p-3.5 text-[13px] space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-primary">v{v.version} {isCurrent && <span className="text-[11px] font-normal text-muted">(current)</span>}</span>
                          <span className="text-[11.5px] text-muted">{v.created_at ? fmtDate(v.created_at) : "Previous"}</span>
                        </div>
                        {vTitle && vTitle !== sel.title && (
                          <div className="text-[12.5px]">
                            <span className="text-muted block text-[11px] uppercase font-semibold">Title Difference:</span>
                            <span className="line-through text-danger mr-2">{vTitle}</span>
                            <span className="text-success">{sel.title}</span>
                          </div>
                        )}
                        {vDesc && vDesc !== sel.description && (
                          <div className="text-[12.5px]">
                            <span className="text-muted block text-[11px] uppercase font-semibold">Description Difference:</span>
                            <p className="rounded bg-canvas p-1.5 text-[12px]">{vDesc}</p>
                          </div>
                        )}
                        {vAc && vAc !== sel.acceptance_criteria && (
                          <div className="text-[12.5px]">
                            <span className="text-muted block text-[11px] uppercase font-semibold">Acceptance Criteria:</span>
                            <p className="rounded bg-canvas p-1.5 text-[12px]">{vAc}</p>
                          </div>
                        )}
                        {!isCurrent && (
                          <Button
                            size="sm"
                            variant="subtle"
                            loading={rollingBackId === v.id}
                            onClick={() => rollback(v.id)}
                          >
                            <RotateCcw size={13} />Rollback to v{v.version}
                          </Button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            ) : editingSel ? (
              <div className="grid gap-3 text-[13.5px]">
                <label className="block text-[13px] font-medium text-secondary">
                  Title
                  <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                    className="mt-1 h-10 w-full rounded-md border border-border bg-canvas px-3 text-[13.5px] focus:border-primary focus:outline-none" />
                </label>
                <label className="block text-[13px] font-medium text-secondary">
                  Priority
                  <select value={editPriority} onChange={(e) => setEditPriority(e.target.value)}
                    className="mt-1 h-10 w-full rounded-md border border-border bg-canvas px-3 text-[13px] focus:border-primary focus:outline-none">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </label>
                <label className="block text-[13px] font-medium text-secondary">
                  Description
                  <textarea rows={3} value={editDesc} onChange={(e) => setEditDesc(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-canvas p-2.5 text-[13px] focus:border-primary focus:outline-none" />
                </label>
                <label className="block text-[13px] font-medium text-secondary">
                  Acceptance criteria
                  <textarea rows={3} value={editAc} onChange={(e) => setEditAc(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-canvas p-2.5 text-[13px] focus:border-primary focus:outline-none" />
                </label>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" loading={write.isPending} onClick={saveEdit}>Save changes</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingSel(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="grid gap-3 text-[13.5px]">
                <p className="text-[15px] font-semibold">{sel.title}</p>
                <p className="flex gap-2"><StatusBadge value={sel.status} /><Badge value={sel.priority} tone="neutral" /><span className="text-secondary">v{sel.version}</span></p>
                {sel.description && <p className="text-secondary">{sel.description}</p>}
                {sel.acceptance_criteria && (
                  <div>
                    <b className="text-[12px] uppercase tracking-wide text-secondary">Acceptance criteria</b>
                    <p className="mt-1 rounded-xl border border-border bg-canvas p-2.5 text-[13px]">{sel.acceptance_criteria}</p>
                  </div>
                )}
                <div>
                  <b className="text-[12px] uppercase tracking-wide text-secondary">Traceability</b>
                  {selLinks.length === 0
                    ? <p className="mt-1 text-secondary">Orphaned — no downstream links yet.</p>
                    : <ul className="mt-1 grid gap-1.5">{selLinks.map((l: any, i: number) => (
                      <li key={i} className="font-mono text-[12.5px]">{l.from} → {l.to} <span className="text-secondary">({l.rel})</span></li>
                    ))}</ul>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {sel.status !== "approved" && (
                    <Button size="sm" loading={write.isPending} onClick={() => write.mutate(
                      { path: `/requirements/${sel.id}/approve`, init: { method: "POST" } },
                      { onSuccess: () => { setSel(null); maybeAdvance(1); } })}>Approve</Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => startEdit(sel)}>
                    <Pencil size={13} />Edit
                  </Button>
                  <Link href={`/projects/${pid}/impact`} prefetch
                    className="inline-flex items-center rounded-lg border border-border px-2.5 py-1.5 text-[12.5px] font-medium text-secondary hover:border-accent hover:text-primary">
                    View impact
                  </Link>
                  <button type="button" aria-label={`Delete ${sel.code}`}
                    onClick={() => setDeleteConfirmOpen(true)}
                    className="ml-auto rounded-lg p-1.5 text-muted transition-colors hover:bg-elevated hover:text-danger"
                    title="Delete requirement">
                    <Trash2 size={15} />
                  </button>
                </div>
                <p className="text-[12px] text-secondary">Linked artifacts: {selLinks.map((l: any, i: number) => <span key={i} className="mr-1"><ArtifactLink code={l.to} /></span>)}</p>
              </div>
            )}
          </div>
        )}
      </Drawer>
      <Dialog open={batchDeleteOpen} onClose={() => setBatchDeleteOpen(false)} title={`Delete ${checked.size} requirements?`}>
        <p className="text-[13.5px] text-secondary">
          Are you sure you want to delete these <b>{checked.size}</b> selected requirements? This will also remove any downstream traceability links touching them.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setBatchDeleteOpen(false)}>Cancel</Button>
          <Button variant="danger" loading={batchDeleteBusy} onClick={batchDeleteSelected}>Delete selected</Button>
        </div>
      </Dialog>
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)} title={`Delete ${sel?.code}?`}>
        <p className="text-[13.5px] text-secondary">
          Are you sure you want to delete <b>{sel?.code} — {sel?.title}</b>? This will also remove any downstream traceability links touching this requirement.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
          <Button variant="danger" loading={write.isPending} onClick={deleteReq}>Delete requirement</Button>
        </div>
      </Dialog>
      {write.isPending && <div className="mt-3"><LoadingState stage="Working — cache refreshes automatically" /></div>}
      <Dialog open={confirmRegen} onClose={() => setConfirmRegen(false)} title="Replace requirements?">
        <p className="text-[13.5px] text-secondary">
          This deletes the existing {reqs.length} requirement{reqs.length === 1 ? "" : "s"} (and their trace links)
          and generates a fresh set. Approvals on the old set are lost.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmRegen(false)}>Cancel</Button>
          <Button loading={write.isPending} onClick={() => doGenerate(true)}>Replace & generate</Button>
        </div>
      </Dialog>
      <Dialog open={ownOpen} onClose={() => setOwnOpen(false)} title="Add your own requirement">
        <p className="text-[13px] text-secondary">Write it the way you'd say it — plain words are perfect.</p>
        <label className="mt-3 block text-[13px]">What do you want?
          <input value={ownTitle} onChange={(e) => setOwnTitle(e.target.value)}
            placeholder="Example: customers get an SMS reminder an hour before"
            className="mt-1 w-full rounded-xl border border-border bg-canvas px-3 py-2 text-[13px] placeholder:text-muted focus:border-accent focus:outline-none" />
        </label>
        <label className="mt-2 block text-[13px]">Extra detail (optional)
          <textarea rows={2} value={ownDesc} onChange={(e) => setOwnDesc(e.target.value)}
            placeholder="Anything that clarifies what 'done' looks like…"
            className="mt-1 w-full rounded-xl border border-border bg-canvas p-2.5 text-[13px] placeholder:text-muted focus:border-accent focus:outline-none" />
        </label>
        <label className="mt-2 block text-[13px]">Priority
          <select value={ownPriority} onChange={(e) => setOwnPriority(e.target.value)}
            className="mt-1 rounded-xl border border-border bg-canvas px-3 py-2 text-[13px] focus:border-accent focus:outline-none">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOwnOpen(false)}>Cancel</Button>
          <Button loading={write.isPending} disabled={!ownTitle.trim()} onClick={addOwn}>Add requirement</Button>
        </div>
      </Dialog>
    </div>
  );
}
