"use client";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Check, CheckCircle2, Copy, Search, CheckSquare } from "lucide-react";
import { useStories, usePrd, useTraceability, useWrite } from "../../../../lib/query/useArtifacts";
import { siblings } from "../../../../lib/query/links";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { StatusBadge } from "../../../../components/ui/badge";
import { ErrorState, EmptyState, CardSkeleton } from "../../../../components/ui/feedback";
import { ArtifactLink } from "../../../../components/ui/activity";
import { PrereqBanner, StageEmpty } from "../../../../components/ui/stage";
import { useToast } from "../../../../components/ui/toast";
import { Tooltip } from "../../../../components/ui/overlay";
import { copyText } from "../../../../lib/clipboard";
import { api } from "../../../../lib/api/client";

/** User stories (§19): structured narrative + AC + real linked artifacts with search & filters & bulk triage bar. */
export default function Stories() {
  const { projectId: pid } = useParams() as { projectId: string };
  const toast = useToast();
  const storiesQ = useStories(pid);
  const prdQ = usePrd(pid);
  const traceQ = useTraceability(pid);
  const approve = useWrite(pid, ["stories", "activity", "runs"]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "DRAFT" | "APPROVED">("ALL");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Bulk actions state
  const [checkedStories, setCheckedStories] = useState<Set<string>>(new Set());
  const [bulkApproving, setBulkApproving] = useState(false);

  // All hooks must run before any early return. Putting this useMemo below the
  // loading guard made React see a different hook count on the render where
  // loading finished ("Rendered more hooks than during the previous render").
  const stories = storiesQ.data || [];
  const filteredStories = useMemo(() => {
    return stories.filter((s: any) => {
      const q = search.toLowerCase();
      const matchesSearch =
        (s.code || "").toLowerCase().includes(q) ||
        (s.story || "").toLowerCase().includes(q) ||
        (s.acceptance || []).some((a: string) => a.toLowerCase().includes(q));
      const matchesStatus =
        statusFilter === "ALL" || (s.status || "draft").toUpperCase() === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [stories, search, statusFilter]);

  // Stories render as a grid of cards, so a card skeleton matches the real
  // layout instead of a full-page spinner that collapses to nothing.
  if (storiesQ.isLoading || prdQ.isLoading) return (
    <div className="grid gap-3.5 md:grid-cols-2" aria-busy="true" aria-label="Loading user stories">
      {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
    </div>
  );
  if (storiesQ.isError) return <ErrorState message={(storiesQ.error as Error)?.message} onRetry={() => storiesQ.refetch()} />;
  const links = traceQ.data?.links || [];
  const hasPrd = !!(prdQ.data?.content && Object.keys(prdQ.data.content).length > 0);

  const copyStory = async (s: any) => {
    const text = `${s.code}: "${s.story}"\n\nAcceptance Criteria:\n${(s.acceptance || []).map((a: string) => `- ${a}`).join("\n")}`;
    if (await copyText(text)) {
      setCopiedCode(s.code);
      toast.success(`Copied ${s.code} to clipboard`);
      setTimeout(() => setCopiedCode(null), 2000);
    } else {
      toast.error("Couldn't copy — your browser blocked clipboard access.");
    }
  };

  const toggleCheck = (code: string) => {
    setCheckedStories((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (checkedStories.size === filteredStories.length) {
      setCheckedStories(new Set());
    } else {
      setCheckedStories(new Set(filteredStories.map((s: any) => s.code)));
    }
  };

  const bulkApprove = async () => {
    if (checkedStories.size === 0 || bulkApproving) return;
    setBulkApproving(true);
    try {
      for (const code of Array.from(checkedStories)) {
        await api(`/projects/${pid}/stories/${code}/approve`, { method: "POST" });
      }
      toast.success(`Approved ${checkedStories.size} user stories!`);
      setCheckedStories(new Set());
      await storiesQ.refetch();
    } catch (e: any) {
      toast.error(e.message || "Bulk approval failed");
    } finally {
      setBulkApproving(false);
    }
  };

  const bulkCopy = async () => {
    const selectedList = stories.filter((s: any) => checkedStories.has(s.code));
    const text = selectedList
      .map(
        (s: any) =>
          `### ${s.code}: ${s.title || ""}\n"${s.story}"\n\n**Acceptance Criteria:**\n${(
            s.acceptance || []
          )
            .map((a: string) => `- [ ] ${a}`)
            .join("\n")}`
      )
      .join("\n\n---\n\n");
    if (await copyText(text)) {
      toast.success(`Copied ${selectedList.length} stories as Markdown`);
    } else {
      toast.error("Clipboard blocked");
    }
  };

  const allFilteredChecked = filteredStories.length > 0 && checkedStories.size === filteredStories.length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight">User Stories</h1>
          <p className="text-[13px] text-secondary">
            {stories.length} stories · each linked to its source requirement and siblings
          </p>
        </div>
        {filteredStories.length > 0 && (
          <button
            type="button"
            onClick={toggleSelectAll}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-[12px] font-medium text-secondary hover:text-primary transition-colors"
          >
            <CheckSquare size={13} className="text-muted" />
            {allFilteredChecked ? "Deselect all" : "Select all"}
          </button>
        )}
      </div>

      {approve.isError && <div className="mb-3"><ErrorState message={(approve.error as Error)?.message} /></div>}

      {stories.length === 0 ? (
        <div>
          {!hasPrd && (
            <PrereqBanner text="Stories are written from the Product Spec — generate it first."
              href={`/projects/${pid}/prd`} action="Go to Product Spec" />
          )}
          <StageEmpty pageTitle="User Stories" title="No stories yet" hint="Generate user stories with acceptance criteria from the PRD."
            actionLabel="Generate stories" generating={approve.isPending}
            disabledReason={!hasPrd ? "Waiting on the Product Spec." : undefined}
            onGenerate={() => approve.mutate({ path: `/projects/${pid}/stories/generate`, init: { method: "POST" } })} />
          {approve.isError && <div className="mt-3"><ErrorState message={(approve.error as Error)?.message} /></div>}
        </div>
      ) : (
        <div className="space-y-3.5">
          {/* Search & Status Filter Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-subtle p-2">
            <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5">
              <Search size={14} className="text-muted" aria-hidden />
              <label htmlFor="story-search" className="sr-only">Search user stories or acceptance criteria</label>
              <input
                id="story-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search user stories or criteria..."
                className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {(["ALL", "DRAFT", "APPROVED"] as const).map((st) => {
                const count =
                  st === "ALL"
                    ? stories.length
                    : stories.filter((s: any) => (s.status || "draft").toUpperCase() === st).length;
                const active = statusFilter === st;
                return (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
                      active
                        ? "bg-primary font-semibold text-canvas"
                        : "text-secondary hover:bg-elevated hover:text-primary"
                    }`}
                  >
                    {st === "ALL" ? "All" : st.charAt(0) + st.slice(1).toLowerCase()} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {filteredStories.length === 0 ? (
            <EmptyState
              title="No stories match your filter"
              hint="Try clearing your search query or switching the status filter."
              action={
                <Button variant="ghost" onClick={() => { setSearch(""); setStatusFilter("ALL"); }}>
                  Reset filters
                </Button>
              }
            />
          ) : (
            <div className="grid gap-3.5 md:grid-cols-2">
              {filteredStories.map((s: any) => {
                const rel = siblings(links, "story", s.code);
                const isChecked = checkedStories.has(s.code);
                return (
                  <Card
                    key={s.code}
                    className={`flex flex-col justify-between transition-all ${
                      isChecked ? "ring-2 ring-primary/40 border-primary bg-primary/[0.02]" : ""
                    }`}
                  >
                    <div>
                      <div className="mb-2 flex items-center justify-between gap-2 border-b border-border/80 pb-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleCheck(s.code)}
                            aria-label={`Select ${s.code}`}
                            className="h-4 w-4 rounded accent-primary cursor-pointer"
                          />
                          <span className="font-mono text-[12.5px] font-bold text-accent">{s.code}</span>
                          <Tooltip tip="Copy story & criteria">
                            <button
                              type="button"
                              onClick={() => copyStory(s)}
                              className="rounded p-1 text-muted transition-colors hover:bg-elevated hover:text-primary"
                              aria-label={`Copy ${s.code}`}
                            >
                              {copiedCode === s.code ? (
                                <Check size={12} className="text-success" />
                              ) : (
                                <Copy size={12} />
                              )}
                            </button>
                          </Tooltip>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge value={s.status} />
                          {s.status !== "approved" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              loading={approve.isPending}
                              onClick={() =>
                                approve.mutate({
                                  path: `/projects/${pid}/stories/${s.code}/approve`,
                                  init: { method: "POST" },
                                })
                              }
                            >
                              Approve
                            </Button>
                          )}
                        </div>
                      </div>

                      <p className="text-[13.5px] italic leading-relaxed text-primary">“{s.story}”</p>

                      <div className="mt-3">
                        <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                          Acceptance criteria
                        </p>
                        <ul className="mt-1.5 space-y-1.5">
                          {(s.acceptance || []).map((a: string, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-[12.5px] text-secondary">
                              <CheckCircle2 size={13} className="mt-0.5 flex-none text-success" aria-hidden />
                              <span>{a}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="mt-3.5 border-t border-border/80 pt-2.5">
                      <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.06em] text-muted">Traces to</p>
                      <div className="flex flex-wrap gap-1.5">
                        <ArtifactLink code={s.req} href={`/projects/${pid}/requirements`} />
                        {rel.map((l, i) => (
                          <ArtifactLink key={i} code={l.to} />
                        ))}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Floating Linear-style Bulk Action Bar */}
          {checkedStories.size > 0 && (
            <div
              role="region"
              aria-label="Bulk actions bar"
              className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2.5 rounded-2xl border border-border bg-surface/95 px-4 py-2.5 shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-4 duration-200 ring-1 ring-border/80"
            >
              <span className="rounded-full bg-elevated px-2.5 py-0.5 font-mono text-[11.5px] font-bold text-primary">
                {checkedStories.size} selected
              </span>
              <div className="h-4 w-px bg-border" aria-hidden />
              <Button size="sm" variant="subtle" onClick={bulkApprove} loading={bulkApproving} className="text-[12px]">
                <Check size={13} className="text-success" /> Approve selected
              </Button>
              <Button size="sm" variant="ghost" onClick={bulkCopy} className="text-[12px]">
                <Copy size={13} /> Copy Markdown
              </Button>
              <div className="h-4 w-px bg-border" aria-hidden />
              <button
                type="button"
                onClick={() => setCheckedStories(new Set())}
                className="text-[12px] text-muted hover:text-primary transition-colors px-1"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
