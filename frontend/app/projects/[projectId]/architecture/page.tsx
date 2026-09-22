"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Plus, Trash2, Share } from "lucide-react";
import { getArchitecture } from "../../../../lib/api/endpoints";
import { api, apiDownload } from "../../../../lib/api/client";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { LoadingState, ErrorState, EmptyState } from "../../../../components/ui/feedback";

/** Architecture workspace — styled listing now; interactive React Flow canvas lands in Phase 5. */
export default function Architecture() {
  const { projectId: pid } = useParams() as { projectId: string };
  const [arch, setArch] = useState<any>(null);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({ name: "", kind: "service", description: "", boundary: "" });

  const load = () => getArchitecture(pid).then(setArch).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [pid]);

  const add = async () => {
    if (!form.name.trim()) return;
    await api(`/projects/${pid}/architecture/components`, { method: "POST", body: JSON.stringify(form) });
    setForm({ name: "", kind: "service", description: "", boundary: "" });
    await load();
  };
  const remove = async (id: string, name: string) => {
    if (!confirm(`Remove ${name}?`)) return;
    await api(`/projects/${pid}/architecture/components/${id}`, { method: "DELETE" });
    await load();
  };

  if (err && !arch) return <ErrorState message={err} onRetry={load} />;
  if (!arch) return <LoadingState stage="Loading architecture" />;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight">Architecture</h1>
          <p className="text-[13px] text-secondary">{(arch.components || []).length} components · {(arch.relationships || []).length} relationships</p>
        </div>
        {(arch.components || []).length > 0 && (
          <Button variant="ghost" onClick={() => apiDownload(`/projects/${pid}/export/archify`, `arch-${String(pid).slice(0, 8)}.archify.json`, true)}>
            <Share size={14} />Archify IR
          </Button>
        )}
      </div>
      {err && <div className="mb-3"><ErrorState message={err} /></div>}
      {(arch.components || []).length === 0 ? (
        <EmptyState title="No architecture yet" hint="Generate it from the Blueprint pipeline." />
      ) : (
        <div className="grid gap-2.5">
          {(arch.components || []).map((c: any, i: number) => (
            <Card key={c.name}>
              <div className="flex items-start gap-3">
                <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-elevated font-mono text-[12px] font-bold text-accent">{String(i + 1).padStart(2, "0")}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-semibold">{c.name}</p>
                  <p className="text-[12.5px] text-secondary">{c.kind}{c.boundary ? ` · boundary: ${c.boundary}` : ""}</p>
                  {c.description && <p className="mt-0.5 text-[13px]">{c.description}</p>}
                </div>
                {c.id && (
                  <button onClick={() => remove(c.id, c.name)} aria-label={`Remove ${c.name}`}
                    className="rounded-lg p-1.5 text-muted hover:bg-elevated hover:text-danger"><Trash2 size={15} /></button>
                )}
              </div>
            </Card>
          ))}
          <Card>
            <p className="mb-1 text-[12px] font-bold uppercase tracking-[0.06em] text-muted">Relationships</p>
            <ul className="grid gap-1 text-[13px] text-secondary">
              {(arch.relationships || []).map((r: any, i: number) => (
                <li key={i}><code className="font-mono text-[12.5px] text-primary">{r.source}</code> → <code className="font-mono text-[12.5px] text-primary">{r.target}</code> <span>({r.label})</span></li>
              ))}
            </ul>
          </Card>
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
        <div className="mt-2"><Button onClick={add}><Plus size={14} />Add component</Button></div>
      </Card>
    </div>
  );
}
