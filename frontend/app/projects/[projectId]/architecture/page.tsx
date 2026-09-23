"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { Plus, Trash2, Share } from "lucide-react";
import { useArchitecture, useTraceability, useWrite } from "../../../../lib/query/useArtifacts";
import { apiDownload } from "../../../../lib/api/client";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { LoadingState, ErrorState, EmptyState } from "../../../../components/ui/feedback";
import { ArtifactLink } from "../../../../components/ui/activity";
import { touching } from "../../../../lib/query/links";

/** Architecture workspace — styled listing; interactive React Flow canvas in the graph view. */
export default function Architecture() {
  const { projectId: pid } = useParams() as { projectId: string };
  const archQ = useArchitecture(pid);
  const traceQ = useTraceability(pid);
  const write = useWrite(pid, ["architecture", "activity", "runs"]);
  const [form, setForm] = useState({ name: "", kind: "service", description: "", boundary: "" });
  const [sel, setSel] = useState<string | null>(null);

  if (archQ.isLoading) return <LoadingState stage="Loading architecture" />;
  if (archQ.isError) return <ErrorState message={(archQ.error as Error)?.message} onRetry={() => archQ.refetch()} />;
  const arch = archQ.data || { components: [], relationships: [] };
  const links = traceQ.data?.links || [];
  const selected = sel ? arch.components.find((c: any) => c.name === sel) : null;
  const selLinks = selected ? touching(links, selected.name) : [];

  const add = () => {
    if (!form.name.trim()) return;
    write.mutate(
      { path: `/projects/${pid}/architecture/components`, init: { method: "POST", body: JSON.stringify(form) } },
      { onSuccess: () => setForm({ name: "", kind: "service", description: "", boundary: "" }) });
  };
  const remove = (id: string, name: string) => {
    if (!confirm(`Remove ${name}?`)) return;
    write.mutate({ path: `/projects/${pid}/architecture/components/${id}`, init: { method: "DELETE" } },
      { onSuccess: () => setSel(null) });
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
        <EmptyState title="No architecture yet" hint="Generate it from the Blueprint pipeline." />
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
                    <span role="button" tabIndex={0} aria-label={`Remove ${c.name}`}
                      onClick={(e) => { e.stopPropagation(); remove(c.id, c.name); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); remove(c.id, c.name); } }}
                      className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-danger"><Trash2 size={15} /></span>
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
      <Card>
        <h3 className="mb-2 text-[14px] font-semibold">Add component</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Cache (Redis)" aria-label="Component name"
            className="rounded-xl border border-border bg-canvas px-3 py-2 text-[13px]" />
          <input value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} placeholder="service" aria-label="Kind"
            className="rounded-xl border border-border bg-canvas px-3 py-2 text-[13px]" />
          <input value={form.boundary} onChange={(e) => setForm({ ...form, boundary: e.target.value })} placeholder="private" aria-label="Boundary"
            className="rounded-xl border border-border bg-canvas px-3 py-2 text-[13px]" />
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What it does" aria-label="Description"
            className="rounded-xl border border-border bg-canvas px-3 py-2 text-[13px]" />
        </div>
        <div className="mt-2"><Button loading={write.isPending} onClick={add}><Plus size={14} />Add component</Button></div>
      </Card>
    </div>
  );
}
