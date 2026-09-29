"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { Plus, Trash2, Share } from "lucide-react";
import { useArchitecture, usePrd, useTraceability, useWrite } from "../../../../lib/query/useArtifacts";
import { apiDownload } from "../../../../lib/api/client";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { LoadingState, ErrorState, EmptyState } from "../../../../components/ui/feedback";
import { ArtifactLink } from "../../../../components/ui/activity";
import { Dialog } from "../../../../components/ui/overlay";
import { PrereqBanner, StageEmpty } from "../../../../components/ui/stage";
import { touching } from "../../../../lib/query/links";

const KINDS = ["service", "frontend", "api", "database", "queue", "external", "security", "cloud"];

/** Architecture workspace — styled listing; interactive React Flow canvas in the graph view. */
export default function Architecture() {
  const { projectId: pid } = useParams() as { projectId: string };
  const archQ = useArchitecture(pid);
  const prdQ = usePrd(pid);
  const traceQ = useTraceability(pid);
  const write = useWrite(pid, ["architecture", "activity", "runs", "traceability"]);
  const [form, setForm] = useState({ name: "", kind: "service", description: "", boundary: "" });
  const [sel, setSel] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);

  if (archQ.isLoading || prdQ.isLoading) return <LoadingState stage="Loading architecture" />;
  if (archQ.isError) return <ErrorState message={(archQ.error as Error)?.message} onRetry={() => archQ.refetch()} />;
  const arch = archQ.data || { components: [], relationships: [] };
  const hasPrd = !!(prdQ.data?.content && Object.keys(prdQ.data.content).length > 0);
  const links = traceQ.data?.links || [];
  const selected = sel ? arch.components.find((c: any) => c.name === sel) : null;
  const selLinks = selected ? touching(links, selected.name) : [];

  const add = () => {
    if (!form.name.trim()) return;
    write.mutate(
      { path: `/projects/${pid}/architecture/components`, init: { method: "POST", body: JSON.stringify(form) } },
      { onSuccess: () => setForm({ name: "", kind: "service", description: "", boundary: "" }) });
  };
  const remove = (id: string) => {
    write.mutate({ path: `/projects/${pid}/architecture/components/${id}`, init: { method: "DELETE" } },
      { onSuccess: () => { setSel(null); setPendingDelete(null); } });
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight">Architecture</h1>
          <p className="text-[13px] text-secondary">{arch.components.length} components · {arch.relationships.length} relationships</p>
        </div>
        {arch.components.length > 0 && (
          <Button variant="ghost" onClick={() => apiDownload(`/projects/${pid}/export/archify`, `arch-${String(pid).slice(0, 8)}.archify.json`, true)}>
            <Share size={14} />Archify IR
          </Button>
        )}
      </div>
      {write.isError && <div className="mb-3"><ErrorState message={(write.error as Error)?.message} /></div>}
      {arch.components.length === 0 ? (
        <div>
          {!hasPrd && (
            <PrereqBanner text="Architecture is derived from the Product Spec — generate it first."
              href={`/projects/${pid}/prd`} action="Go to Product Spec" />
          )}
          <StageEmpty title="No architecture yet" hint="Generate components and relationships from the PRD."
            actionLabel="Generate architecture" generating={write.isPending}
            disabledReason={!hasPrd ? "Waiting on the Product Spec." : undefined}
            onGenerate={() => write.mutate({ path: `/projects/${pid}/architecture/generate`, init: { method: "POST" } })} />
        </div>
      ) : (
        <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid content-start gap-2.5">
            {arch.components.map((c: any, i: number) => (
              <button key={c.name} onClick={() => setSel(sel === c.name ? null : c.name)}
                className={`rounded-2xl border p-4 text-left transition-colors ${sel === c.name ? "border-accent bg-elevated" : "border-border bg-surface hover:border-accent"}`}>
                <span className="flex items-start gap-3">
                  <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-elevated font-mono text-[12px] font-bold text-accent">{String(i + 1).padStart(2, "0")}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-semibold">{c.name}</span>
                    <span className="block text-[12.5px] text-secondary">{c.kind}{c.boundary ? ` · boundary: ${c.boundary}` : ""}</span>
                    {c.description && <span className="mt-0.5 block text-[13px]">{c.description}</span>}
                  </span>
                  {c.id && (
                    <button type="button" aria-label={`Remove ${c.name}`}
                      onClick={(e) => { e.stopPropagation(); setPendingDelete({ id: c.id, name: c.name }); }}
                      className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-danger"><Trash2 size={15} /></button>
                  )}
                </span>
              </button>
            ))}
            <Card>
              <p className="mb-1 text-[12px] font-bold uppercase tracking-[0.06em] text-muted">Relationships</p>
              <ul className="grid gap-1 text-[13px] text-secondary">
                {arch.relationships.map((r: any, i: number) => (
                  <li key={i}><code className="font-mono text-[12.5px] text-primary">{r.source}</code> → <code className="font-mono text-[12.5px] text-primary">{r.target}</code> <span>({r.label})</span></li>
                ))}
              </ul>
            </Card>
          </div>
          <div>
            {selected ? (
              <Card>
                <h3 className="text-[15px] font-semibold">{selected.name}</h3>
                <p className="text-[12.5px] text-secondary">{selected.kind}{selected.boundary ? ` · boundary: ${selected.boundary}` : ""}</p>
                {selected.description && <p className="mt-1 text-[13px]">{selected.description}</p>}
                <p className="mt-3 text-[12px] font-bold uppercase tracking-[0.06em] text-muted">Linked artifacts</p>
                <p className="mt-1 flex flex-wrap gap-1.5">
                  {selLinks.length === 0 ? <span className="text-[12.5px] text-secondary">None yet — confirm links in Traceability.</span>
                    : selLinks.map((l: any, i: number) => <ArtifactLink key={i} code={l.from.startsWith("component:") || !l.from.includes(String(selected.name)) ? l.from : l.to} />)}
                </p>
              </Card>
            ) : <EmptyState title="No component selected" hint="Click a component to inspect its links." />}
          </div>
        </div>
      )}
      <details className="mt-3.5">
        <summary className="cursor-pointer text-[13px] font-semibold text-accent">Add component manually</summary>
        <Card className="mt-2">
          <h3 className="mb-2 text-[14px] font-semibold">Add component</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-[12.5px] text-secondary">Name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Cache (Redis)"
                className="rounded-xl border border-border bg-canvas px-3 py-2 text-[13px] text-primary placeholder:text-muted focus:border-accent focus:outline-none" />
            </label>
            <label className="grid gap-1 text-[12.5px] text-secondary">Kind
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}
                className="rounded-xl border border-border bg-canvas px-3 py-2 text-[13px] text-primary focus:border-accent focus:outline-none">
                {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-[12.5px] text-secondary">Boundary
              <input value={form.boundary} onChange={(e) => setForm({ ...form, boundary: e.target.value })} placeholder="private"
                className="rounded-xl border border-border bg-canvas px-3 py-2 text-[13px] text-primary placeholder:text-muted focus:border-accent focus:outline-none" />
            </label>
            <label className="grid gap-1 text-[12.5px] text-secondary">Description
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What it does"
                className="rounded-xl border border-border bg-canvas px-3 py-2 text-[13px] text-primary placeholder:text-muted focus:border-accent focus:outline-none" />
            </label>
          </div>
          <div className="mt-2"><Button loading={write.isPending} onClick={add} disabled={!form.name.trim()}><Plus size={14} />Add component</Button></div>
        </Card>
      </details>
      <Dialog open={!!pendingDelete} onClose={() => setPendingDelete(null)} title={`Remove ${pendingDelete?.name}?`}>
        <p className="text-[13.5px] text-secondary">The component and its relationships are deleted. This cannot be undone.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setPendingDelete(null)}>Cancel</Button>
          <Button loading={write.isPending} onClick={() => pendingDelete && remove(pendingDelete.id)}>Remove</Button>
        </div>
      </Dialog>
    </div>
  );
}
