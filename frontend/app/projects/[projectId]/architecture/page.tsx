"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "../../../../lib/api/client";
import { Loading, ErrorBox, Empty } from "../../../../components/ui";

/** Architecture canvas (§31): visual components, relationships, click for linked artifacts. */
export default function Architecture() {
  const { projectId: pid } = useParams() as { projectId: string };
  const [arch, setArch] = useState<any>(null);
  const [err, setErr] = useState("");
  const [sel, setSel] = useState<any>(null);
  const [linked, setLinked] = useState<any[]>([]);
  const [form, setForm] = useState({ name: "", kind: "service", description: "", boundary: "" });

  const load = () => api(`/projects/${pid}/architecture`).then(setArch).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const select = async (c: any) => {
    setSel(c);
    try {
      const t = await api(`/projects/${pid}/traceability/${encodeURIComponent(c.name)}`);
      setLinked(t.backward || []);
    } catch { setLinked([]); }
  };

  const add = async () => {
    if (!form.name.trim()) return;
    await api(`/projects/${pid}/architecture/components`, { method: "POST", body: JSON.stringify(form) });
    setForm({ name: "", kind: "service", description: "", boundary: "" });
    await load();
  };

  const remove = async (id: string) => {
    if (!confirm("Remove this component?")) return;
    await api(`/projects/${pid}/architecture/components/${id}`, { method: "DELETE" });
    setSel(null);
    await load();
  };

  if (err && !arch) return <ErrorBox message={err} onRetry={load} />;
  if (!arch) return <Loading stage="Loading architecture" />;

  const comps = arch.components || [];
  const W = 560, BH = 64, GAP = 46;

  return (
    <div>
      <h1>Architecture</h1>
      <p className="sub">Components, data stores and boundaries — click a component for details and links.</p>
      {err && <ErrorBox message={err} />}
      {comps.length === 0 ? (
        <Empty title="No architecture yet" hint="Generate it from the Overview pipeline." />
      ) : (
        <div className="grid m2">
          <div className="card">
            <svg viewBox={`0 0 ${W} ${comps.length * (BH + GAP) + 20}`} width="100%" role="img" aria-label="Architecture diagram">
              {comps.map((c: any, i: number) => {
                const y = 10 + i * (BH + GAP);
                const active = sel?.name === c.name;
                return (
                  <g key={c.name} onClick={() => select(c)} style={{ cursor: "pointer" }} role="button" tabIndex={0}
                     onKeyDown={(e) => e.key === "Enter" && select(c)} aria-label={c.name}>
                    <rect x="100" y={y} width="360" height={BH} rx="6"
                      fill={active ? "var(--bg-raise)" : "var(--bg-surface)"}
                      stroke={active ? "var(--accent)" : "var(--border-strong)"} strokeWidth={active ? 2 : 1} />
                    <text x="280" y={y + 24} textAnchor="middle" fill="var(--text-primary)" fontSize="13" fontWeight="600">{c.name}</text>
                    <text x="280" y={y + 42} textAnchor="middle" fill="var(--text-secondary)" fontSize="11">{c.kind}{c.boundary ? ` · ${c.boundary}` : ""}</text>
                    {i < comps.length - 1 && <line x1="280" y1={y + BH} x2="280" y2={y + BH + GAP} stroke="var(--border-strong)" strokeWidth="1.5" markerEnd="url(#ah)" />}
                  </g>
                );
              })}
              <defs><marker id="ah" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="none" stroke="var(--border-strong)" /></marker></defs>
            </svg>
            <b>Relationships</b>
            <ul className="muted">{(arch.relationships || []).map((r: any, i: number) => <li key={i}><code>{r.source}</code> → <code>{r.target}</code> ({r.label})</li>)}</ul>
          </div>
          <div>
            {sel ? (
              <div className="card">
                <h3>{sel.name}</h3>
                <p className="muted">{sel.kind}{sel.boundary ? ` · boundary: ${sel.boundary}` : ""}</p>
                <p>{sel.description}</p>
                <b>Linked artifacts</b>
                {linked.length === 0
                  ? <p className="muted">None yet — confirm links on the Traceability page.</p>
                  : <ul>{linked.map((l: any, i: number) => <li key={i}><code>{l.from}</code> <span className="muted">({l.rel})</span></li>)}</ul>}
                {sel.id && <button className="ghost" onClick={() => remove(sel.id)}>Remove component</button>}
              </div>
            ) : <Empty title="No component selected" hint="Click a component in the diagram to inspect it." />}
            <div className="card">
              <h3>Add component</h3>
              <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Cache (Redis)" /></label>
              <label>Kind<input value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} placeholder="service" /></label>
              <label>Boundary<input value={form.boundary} onChange={(e) => setForm({ ...form, boundary: e.target.value })} placeholder="private" /></label>
              <label>Description<textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
              <button onClick={add}>Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
