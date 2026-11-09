"use client";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Search } from "lucide-react";
import { useTests, useRequirements, useTraceability, useWrite } from "../../../../lib/query/useArtifacts";
import { Card } from "../../../../components/ui/card";
import { StatusBadge } from "../../../../components/ui/badge";
import { DataTable } from "../../../../components/ui/data";
import { ErrorState, EmptyState, TableSkeleton } from "../../../../components/ui/feedback";
import { ArtifactLink } from "../../../../components/ui/activity";
import { PrereqBanner, StageEmpty } from "../../../../components/ui/stage";
import { siblings } from "../../../../lib/query/links";
import type { TestCase } from "../../../../lib/api/types";

/** Test workspace (§25): search, kind filters, requirements linkage, full trace chain. */
export default function Tests() {
  const { projectId: pid } = useParams() as { projectId: string };
  const testsQ = useTests(pid);
  const reqsQ = useRequirements(pid);
  const traceQ = useTraceability(pid);
  const write = useWrite(pid, ["tests", "activity", "runs", "traceability"]);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState("ALL");

  // Hooks run before the loading guard — see note in stories/page.tsx.
  const tests = testsQ.data || [];

  const allKinds = useMemo(() => {
    const s = new Set<string>();
    tests.forEach((t) => s.add((t.kind || "acceptance").toUpperCase()));
    return ["ALL", ...Array.from(s)];
  }, [tests]);

  const filteredTests = useMemo(() => {
    return tests.filter((t) => {
      const q = search.toLowerCase();
      const matchesSearch =
        (t.code || "").toLowerCase().includes(q) ||
        (t.title || "").toLowerCase().includes(q) ||
        (t.req || "").toLowerCase().includes(q);
      const matchesKind = kindFilter === "ALL" || (t.kind || "acceptance").toUpperCase() === kindFilter;
      return matchesSearch && matchesKind;
    });
  }, [tests, search, kindFilter]);

  const kinds: Record<string, TestCase[]> = {};
  filteredTests.forEach((t) => {
    (kinds[t.kind || "acceptance"] = kinds[t.kind || "acceptance"] || []).push(t);
  });

  if (testsQ.isLoading || reqsQ.isLoading) return <TableSkeleton rows={6} cols={5} />;
  if (testsQ.isError) return <ErrorState message={(testsQ.error as Error)?.message} onRetry={() => testsQ.refetch()} />;
  const hasReqs = (reqsQ.data || []).length > 0;
  const links = traceQ.data?.links || [];

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-[24px] font-bold tracking-tight">Tests</h1>
        <p className="text-[13px] text-secondary">{tests.length} cases · coverage is computed from links, never claimed</p>
      </div>

      {tests.length === 0 ? (
        <div>
          {!hasReqs && (
            <PrereqBanner text="Test cases validate requirements — generate them first."
              href={`/projects/${pid}/requirements`} action="Go to Requirements" />
          )}
          <StageEmpty title="No tests yet" hint="Generate acceptance, API, and security cases linked to requirements."
            actionLabel="Generate tests" generating={write.isPending}
            disabledReason={!hasReqs ? "Waiting on requirements." : undefined}
            onGenerate={() => write.mutate({ path: `/projects/${pid}/tests/generate`, init: { method: "POST" } })} />
          {write.isError && <div className="mt-3"><ErrorState message={(write.error as Error)?.message} /></div>}
        </div>
      ) : (
        <div className="space-y-3.5">
          {/* Search & Kind Filter Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-subtle p-2">
            <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5">
              <Search size={14} className="text-muted" aria-hidden />
              <label htmlFor="test-search" className="sr-only">Search test cases, IDs, or requirements</label>
              <input
                id="test-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search test cases, IDs, or requirements..."
                className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {allKinds.map((k) => {
                const count = k === "ALL" ? tests.length : tests.filter((t) => (t.kind || "acceptance").toUpperCase() === k).length;
                const active = kindFilter === k;
                return (
                  <button
                    key={k}
                    onClick={() => setKindFilter(k)}
                    className={`rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors ${
                      active ? "bg-elevated font-semibold text-primary shadow-sm" : "text-secondary hover:text-primary"
                    }`}
                  >
                    {k === "ALL" ? "All Tests" : k[0] + k.slice(1).toLowerCase()}{" "}
                    <span className="font-mono text-[11px] text-muted">({count})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {filteredTests.length === 0 ? (
            <EmptyState
              title="No matching tests"
              hint={`No test cases match "${search}" with kind filter ${kindFilter}.`}
            />
          ) : (
            Object.entries(kinds).map(([kind, list]) => (
              <Card key={kind} className="!p-0 overflow-hidden shadow-xs">
                <p className="border-b border-border bg-subtle/50 px-4 py-2.5 text-[14px] font-semibold capitalize text-primary">
                  {kind} ({list.length})
                </p>
                <DataTable label={`${kind} tests`} head={<><th>ID</th><th>Title</th><th>Req</th><th>Chain</th><th>Steps</th></>}>
                  {list.map((t) => (
                    <tr key={t.code} className="hover:[&_td]:bg-elevated/40">
                      <td className="font-mono text-[12.5px] font-semibold text-secondary">{t.code}</td>
                      <td>
                        <span className="font-medium text-primary">{t.title}</span>
                        <div className="mt-1"><StatusBadge value={t.kind || "acceptance"} /></div>
                      </td>
                      <td><ArtifactLink code={t.req || ""} href={`/projects/${pid}/requirements`} /></td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {siblings(links, t.req || "", `test:${t.code}`).slice(0, 4).map((l, i) => (
                            <ArtifactLink key={i} code={l.to} />
                          ))}
                        </div>
                      </td>
                      <td>
                        <details className="group">
                          <summary className="cursor-pointer font-semibold text-accent hover:underline">
                            View Steps
                          </summary>
                          <div className="mt-1.5 rounded-lg border border-border bg-canvas/80 p-2.5 text-[12px]">
                            <p className="font-medium text-primary">{t.steps}</p>
                            <p className="mt-1 text-secondary">
                              <span className="font-semibold text-muted">Expected:</span> {t.expected}
                            </p>
                          </div>
                        </details>
                      </td>
                    </tr>
                  ))}
                </DataTable>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
