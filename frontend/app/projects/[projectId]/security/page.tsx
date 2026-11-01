"use client";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, Search, ShieldCheck } from "lucide-react";
import { useSecurity, useArchitecture, useIssues, useTraceability, useWrite } from "../../../../lib/query/useArtifacts";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { LoadingState, ErrorState, EmptyState } from "../../../../components/ui/feedback";
import { ArtifactLink } from "../../../../components/ui/activity";
import { PrereqBanner, StageEmpty } from "../../../../components/ui/stage";
import { touching } from "../../../../lib/query/links";

/** Category rollup: a category is healthy when controls exist AND no open issue touches it. */
const CATS: { label: string; keys: string[] }[] = [
  { label: "Authentication", keys: ["auth", "jwt", "login"] },
  { label: "Authorization", keys: ["rbac", "role", "permission", "access"] },
  { label: "Data Protection", keys: ["encrypt", "data", "protect", "pii"] },
  { label: "Secrets", keys: ["secret", "vault", "key"] },
  { label: "Audit Logging", keys: ["audit", "log"] },
];

function inCat(text: string, keys: string[]): boolean {
  const t = text.toLowerCase();
  return keys.some((k) => t.includes(k));
}

/** Security workspace (§23): real controls, interactive categories, real issues, real links. */
export default function Security() {
  const { projectId: pid } = useParams() as { projectId: string };
  const controlsQ = useSecurity(pid);
  const archQ = useArchitecture(pid);
  const issuesQ = useIssues(pid);
  const traceQ = useTraceability(pid);
  const write = useWrite(pid, ["security", "activity", "runs", "traceability"]);
  const [sel, setSel] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState<string | null>(null);

  // Hooks run before the loading guard — see note in stories/page.tsx.
  const controls = controlsQ.data || [];

  const filteredControls = useMemo(() => {
    return controls.filter((c: any) => {
      const q = search.toLowerCase();
      const matchesSearch =
        (c.code || "").toLowerCase().includes(q) ||
        (c.title || "").toLowerCase().includes(q) ||
        (c.description || "").toLowerCase().includes(q);
      const catObj = activeCat ? CATS.find((cat) => cat.label === activeCat) : null;
      const matchesCat = !catObj || inCat(`${c.title} ${c.description}`, catObj.keys);
      return matchesSearch && matchesCat;
    });
  }, [controls, search, activeCat]);

  if (controlsQ.isLoading || archQ.isLoading) return <LoadingState stage="Loading security controls" />;
  if (controlsQ.isError) return <ErrorState message={(controlsQ.error as Error)?.message} onRetry={() => controlsQ.refetch()} />;
  const hasArch = (archQ.data?.components?.length || 0) > 0;
  const issues = (issuesQ.data || []).filter((x: any) => x.status === "open");
  const links = traceQ.data?.links || [];

  const selected = sel ? controls.find((c: any) => c.code === sel) : filteredControls[0] || null;
  const selLinks = selected ? touching(links, selected.code) : [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight">Security</h1>
          <p className="text-[13px] text-secondary">
            {controls.length} controls · {issues.length} open issues across all checks
          </p>
        </div>
      </div>

      {controls.length === 0 ? (
        <div>
          {!hasArch && (
            <PrereqBanner text="Controls are scoped to real APIs — generate the architecture first."
              href={`/projects/${pid}/architecture`} action="Go to Architecture" />
          )}
          <StageEmpty pageTitle="Security" title="No controls yet" hint="Analyze the API surface and generate traceable security controls."
            actionLabel="Analyze security" generating={write.isPending}
            disabledReason={!hasArch ? "Waiting on architecture components." : undefined}
            onGenerate={() => write.mutate({ path: `/projects/${pid}/security/analyze`, init: { method: "POST" } })} />
          {write.isError && <div className="mt-3"><ErrorState message={(write.error as Error)?.message} /></div>}
        </div>
      ) : (
        <div className="space-y-3.5">
          {/* Interactive Category Rollup Strip */}
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
            {CATS.map((cat) => {
              const has = controls.filter((c: any) => inCat(`${c.title} ${c.description}`, cat.keys));
              const flagged = issues.filter((i: any) => inCat(`${i.description} ${i.check}`, cat.keys));
              const ok = has.length > 0 && flagged.length === 0;
              const isSelected = activeCat === cat.label;
              return (
                <button
                  key={cat.label}
                  type="button"
                  onClick={() => setActiveCat(isSelected ? null : cat.label)}
                  className={`rounded-2xl border p-3.5 text-left transition-all ${
                    isSelected
                      ? "border-accent bg-elevated shadow-xs"
                      : "border-border bg-surface hover:border-border-strong hover:bg-elevated/40"
                  }`}
                >
                  <p className="flex items-center justify-between gap-1 text-[13px] font-semibold text-primary">
                    <span>{cat.label}</span>
                    {ok ? (
                      <CheckCircle2 size={14} className="text-success" aria-hidden />
                    ) : (
                      <AlertTriangle size={14} className="text-warning" aria-hidden />
                    )}
                  </p>
                  <p className="mt-1 text-[11.5px] text-muted">
                    {has.length} controls{flagged.length > 0 && ` · ${flagged.length} issues`}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Search toolbar & filter chip */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-subtle p-2">
            <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5">
              <Search size={14} className="text-muted" aria-hidden />
              <label htmlFor="control-search" className="sr-only">Search security controls</label>
              <input
                id="control-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search security controls..."
                className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted"
              />
            </div>
            {activeCat && (
              <div className="flex items-center gap-2 px-2 text-[12px]">
                <span className="text-muted">Filtering by:</span>
                <span className="rounded-md bg-elevated px-2 py-0.5 font-semibold text-primary">
                  {activeCat}
                </span>
                <button
                  onClick={() => setActiveCat(null)}
                  className="text-accent underline hover:opacity-80"
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          {filteredControls.length === 0 ? (
            <EmptyState
              title="No matching controls"
              hint={`No security controls match "${search}"${activeCat ? ` in category ${activeCat}` : ""}.`}
            />
          ) : (
            <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="grid content-start gap-2.5">
                {filteredControls.map((s: any) => (
                  <button
                    key={s.code}
                    onClick={() => setSel(s.code)}
                    className={`rounded-2xl border p-4 text-left transition-all ${
                      selected?.code === s.code
                        ? "border-accent bg-elevated shadow-xs"
                        : "border-border bg-surface hover:border-border-strong hover:bg-elevated/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-mono text-[12px] font-bold text-accent">{s.code}</p>
                      <ShieldCheck size={14} className="text-muted" />
                    </div>
                    <p className="mt-1 text-[13.5px] font-semibold text-primary">{s.title}</p>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-secondary">{s.description}</p>
                  </button>
                ))}
              </div>

              <div>
                {selected ? (
                  <Card className="sticky top-20 shadow-xs">
                    <div className="border-b border-border pb-2.5">
                      <p className="font-mono text-[12px] font-bold text-accent">{selected.code}</p>
                      <p className="mt-1 text-[14px] font-bold text-primary">{selected.title}</p>
                    </div>
                    <p className="mt-2 text-[13px] leading-relaxed text-secondary">{selected.description}</p>
                    <div className="mt-3.5 border-t border-border pt-2.5">
                      <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                        Linked artifacts
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {selLinks.length === 0 ? (
                          <span className="text-[12px] text-secondary">
                            No links yet — verify links in Traceability.
                          </span>
                        ) : (
                          selLinks.map((l, i) => (
                            <ArtifactLink key={i} code={l.from.startsWith("security:") ? l.to : l.from} />
                          ))
                        )}
                      </div>
                    </div>
                  </Card>
                ) : (
                  <EmptyState title="No control selected" hint="Click a control to inspect its links." />
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
