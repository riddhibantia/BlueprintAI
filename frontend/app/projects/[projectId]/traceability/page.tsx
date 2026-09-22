"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ReactFlow, Background, Controls, Handle, Position, Node, Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { getTraceability, suggestLinks, traceArtifact } from "../../../../lib/api/endpoints";
import { linkCounts } from "../../../../lib/query/links";
import { useShell } from "../../../../components/shell/context";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { StatusBadge } from "../../../../components/ui/badge";
import { LoadingState, ErrorState, EmptyState, Progress } from "../../../../components/ui/feedback";
import { Drawer } from "../../../../components/ui/overlay";
import { ArtifactLink } from "../../../../components/ui/activity";

const ORDER = ["requirement", "story", "api", "db", "security", "task", "test", "component"];
const COLORS: Record<string, string> = {
  requirement: "#5eead4", story: "#818cf8", api: "#60a5fa", db: "#fbbf24",
  security: "#fb7185", task: "#34d399", test: "#c084fc", component: "#8b929e",
};

function TypeNode({ data }: any) {
  const color = COLORS[data.type] || "#8b929e";
  return (
    <div style={{ borderColor: color }}
      className={`rounded-xl border-2 bg-[#171a1f] px-3 py-1.5 text-center shadow ${data.selected ? "ring-2 ring-white/40" : ""}`}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <p className="font-mono text-[12px] font-bold" style={{ color }}>{data.code}</p>
      <p className="text-[10.5px] uppercase tracking-wide text-[#8b929e]">{data.type}</p>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

const nodeTypes = { typed: TypeNode };

/** Traceability workspace (§26): stored relationships as an interactive graph. No invented edges. */
export default function Traceability() {
  const { projectId: pid } = useParams() as { projectId: string };
  const { setSelection } = useShell();
  const [data, setData] = useState<any>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [selLinks, setSelLinks] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => getTraceability(pid).then(setData).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [pid]);

  const { nodes, edges } = useMemo(() => {
    if (!data) return { nodes: [], edges: [] };
    const seen = new Map<string, { type: string; code: string }>();
    for (const l of data.links) {
      for (const end of [l.from, l.to]) {
        const [t, c] = end.split(":");
        const key = `${t}:${c}`;
        if (!seen.has(key)) seen.set(key, { type: t, code: c });
      }
    }
    const cols: Record<string, { type: string; code: string }[]> = {};
    for (const n of seen.values()) (cols[n.type] = cols[n.type] || []).push(n);
    const nodes: Node[] = [];
    ORDER.forEach((t, ci) => {
      (cols[t] || []).forEach((n, ri) => {
        nodes.push({
          id: `${n.type}:${n.code}`, type: "typed", position: { x: ci * 190, y: ri * 92 },
          data: { ...n, selected: sel === `${n.type}:${n.code}` }, draggable: true,
        });
      });
    });
    const ids = new Set(nodes.map((n) => n.id));
    const edges: Edge[] = data.links
      .filter((l: any) => ids.has(l.from) && ids.has(l.to))
      .map((l: any, i: number) => ({
        id: `e${i}`, source: l.from, target: l.to, label: l.rel, animated: false,
        style: { stroke: "#3a4150" }, labelStyle: { fill: "#8b929e", fontSize: 10 },
      }));
    return { nodes, edges };
  }, [data, sel]);

  const onNodeClick = useCallback(async (_: any, node: Node) => {
    const id = node.id as string;
    setSel(id);
    setSelection(id);
    try {
      const t = await traceArtifact(pid, id.split(":").pop() || "");
      setSelLinks([...(t.forward || []), ...(t.backward || [])]);
    } catch { setSelLinks([]); }
  }, [pid, setSelection]);

  const suggest = async () => {
    setBusy(true);
    try { setSuggestions((await suggestLinks(pid)).suggestions || []); }
    catch (e: any) { setErr(e.message); }
    setBusy(false);
  };

  const confirm = async (s: any) => {
    const { api } = await import("../../../../lib/api/client");
    const [tt, tid] = s.to.split(":");
    await api(`/projects/${pid}/traceability/links`, {
      method: "POST",
      body: JSON.stringify({ source_type: "requirement", source_id: s.from, target_type: tt, target_id: tid, relationship_type: s.rel }),
    });
    setSuggestions(suggestions.filter((x) => x !== s));
    await load();
  };

  if (err && !data) return <ErrorState message={err} onRetry={load} />;
  if (!data) return <LoadingState stage="Building traceability graph" />;

  const cov = data.coverage || {};
  const counts = linkCounts(data.links || []);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight">Traceability</h1>
          <p className="text-[13px] text-secondary">{cov.covered || 0}/{cov.total || 0} requirements traced · every edge stored, none invented</p>
        </div>
        <Button variant="ghost" onClick={suggest} disabled={busy}>{busy ? "Analyzing…" : "Suggest links"}</Button>
      </div>
      {err && <div className="mb-3"><ErrorState message={err} /></div>}

      <Card className="mb-3.5">
        <div className="flex items-center justify-between gap-3">
          <b className="text-[14px]">Coverage {cov.coverage_pct || 0}%</b>
          <span className="text-[12px] text-secondary">{(cov.orphans || []).length} orphaned</span>
        </div>
        <Progress pct={cov.coverage_pct || 0} label="Traceability coverage" />
        {(cov.orphans || []).length > 0 && (
          <p className="mt-2 text-[12.5px] text-secondary">Orphaned: {(cov.orphans || []).map((o: string) => <span key={o} className="mr-1"><ArtifactLink code={o} /></span>)}</p>
        )}
      </Card>

      {(data.links || []).length === 0 ? (
        <EmptyState title="No relationships yet" hint="Approve artifacts to begin building the traceability graph." />
      ) : (
        <div className="mb-3.5 h-[420px] overflow-hidden rounded-2xl border border-border bg-canvas">
          <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodeClick={onNodeClick}
            fitView fitViewOptions={{ padding: 0.2 }} minZoom={0.3} maxZoom={1.5}
            proOptions={{ hideAttribution: false }} colorMode="dark">
            <Background gap={22} size={1} color="#242830" />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      )}

      {suggestions.length > 0 && (
        <Card className="mb-3.5">
          <h3 className="mb-2 text-[14px] font-semibold">Suggested links ({suggestions.length})</h3>
          <p className="mb-2 text-[12.5px] text-secondary">Deterministic proposals — you confirm each one.</p>
          {suggestions.slice(0, 8).map((s, i) => (
            <p key={i} className="flex flex-wrap items-center gap-2 border-b border-border py-1.5 text-[13px] last:border-b-0">
              <code className="font-mono text-[12.5px]">{s.from}</code>→<code className="font-mono text-[12.5px]">{s.to}</code>
              <span className="text-secondary">({s.reason})</span>
              <Button variant="ghost" size="sm" onClick={() => confirm(s)}>Confirm</Button>
            </p>
          ))}
        </Card>
      )}

      <Drawer open={!!sel} onClose={() => setSel(null)} label={`Artifact ${sel}`} title={<span className="font-mono">{sel}</span>}>
        <p className="mb-2 text-[13px] text-secondary">{selLinks.length} touching relationships · downstream links: {sel && sel.startsWith("requirement:") ? counts[sel.split(":")[1]] || 0 : "—"}</p>
        <ul className="grid gap-1.5">
          {selLinks.map((l: any, i: number) => (
            <li key={i} className="font-mono text-[12.5px]">{l.from} → {l.to} <span className="text-secondary">({l.rel})</span></li>
          ))}
        </ul>
        {selLinks.length === 0 && <p className="text-[13px] text-secondary">Orphaned — no stored relationships touch this node.</p>}
      </Drawer>
    </div>
  );
}
