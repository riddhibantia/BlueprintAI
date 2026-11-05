"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ReactFlow, Background, Controls, Handle, Position, Node, Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Layers, X, Sparkles, Filter, RefreshCw } from "lucide-react";
import { useTraceability } from "../../../../lib/query/useArtifacts";
import { api } from "../../../../lib/api/client";
import { suggestLinks, traceArtifact } from "../../../../lib/api/endpoints";
import { linkCounts } from "../../../../lib/query/links";
import { useShell } from "../../../../components/shell/context";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { LoadingState, ErrorState, EmptyState, Progress } from "../../../../components/ui/feedback";
import { Drawer } from "../../../../components/ui/overlay";
import { ArtifactLink } from "../../../../components/ui/activity";
import { SlashInput } from "../../../../components/ui/slash";

const ORDER = ["requirement", "story", "api", "db", "security", "task", "test", "component"];
/* Graph node colors are static, not token-driven. Here color ENCODES artifact
   type, so it must stay distinguishable from every other color — which the
   brand palette deliberately does not guarantee (accent and accent2 are both
   ink). Tokenizing these collapsed requirement/story into the same grey and
   made this legend describe colors the graph never drew. */
const LEGEND: Record<string, string> = {
  requirement: "#0e7c6b", story: "#818cf8", api: "#3b5bdb", db: "#b7791f",
  security: "#c53030", task: "#2f855a", test: "#7c5cd6", component: "#8a857d",
};
const COLORS = LEGEND;

type TypeNodeData = {
  type: string;
  code: string;
  selected?: boolean;
  dimmed?: boolean;
  inPath?: boolean;
};

function TypeNode({ data, selected }: { data: TypeNodeData; selected?: boolean }) {
  const node = data as TypeNodeData;
  const color = COLORS[node.type] || "var(--color-secondary)";
  const isSel = selected ?? node.selected;
  const isDimmed = node.dimmed;
  const inPath = node.inPath;

  return (
    <div
      style={{
        borderColor: isDimmed ? "var(--color-border)" : isSel ? color : inPath ? color : "var(--color-border-strong)",
        opacity: isDimmed ? 0.22 : 1,
        boxShadow: isSel ? `0 0 16px ${color}66` : inPath ? `0 0 8px ${color}33` : undefined,
      }}
      className={`relative rounded-xl border-2 bg-elevated px-3 py-1.5 text-center transition-all duration-200 ${
        isSel
          ? "ring-2 ring-primary ring-offset-2 ring-offset-canvas scale-105 z-10"
          : inPath
          ? "scale-[1.02] z-[5]"
          : "hover:border-border-strong"
      }`}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <p className="font-mono text-[12px] font-bold" style={{ color: isDimmed ? "var(--color-muted)" : color }}>
        {node.code}
      </p>
      <p className="text-[10px] uppercase tracking-wide text-secondary">{node.type}</p>
      {inPath && !isSel && (
        <span className="absolute -top-1 -right-1 flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: color }} />
          <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: color }} />
        </span>
      )}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

const nodeTypes = { typed: TypeNode };

/** Traceability workspace (§26): stored relationships as an interactive graph. No invented edges. */
export default function Traceability() {
  const { projectId: pid } = useParams() as { projectId: string };
  const searchParams = useSearchParams();
  const initialFocus = searchParams.get("focus");

  const { setSelection } = useShell();
  const traceQ = useTraceability(pid);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [sel, setSel] = useState<string | null>(initialFocus ? (initialFocus.includes(":") ? initialFocus : `requirement:${initialFocus}`) : null);
  const [selLinks, setSelLinks] = useState<any[]>([]);
  const [activeLayer, setActiveLayer] = useState<string>("all");
  const [lookup, setLookup] = useState("REQ-001");
  const [trace, setTrace] = useState<any>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [healing, setHealing] = useState(false);
  const [healReport, setHealReport] = useState<string | null>(null);

  const data = traceQ.data;
  const codes = useMemo(() => {
    const s = new Set<string>();
    for (const l of data?.links || []) {
      for (const end of [l.from, l.to]) {
        const [t, c] = end.split(":");
        if (t && c) s.add(t === "requirement" ? c : `${t}:${c}`);
      }
    }
    return [...s].sort();
  }, [data]);

  // Transitive path isolation: Find all ancestors and descendants reachable from `sel`
  const connectedNodeIds = useMemo(() => {
    if (!sel || !data?.links) return new Set<string>();
    const connected = new Set<string>([sel]);

    // Transitive forward (descendants)
    let frontier = [sel];
    while (frontier.length > 0) {
      const next: string[] = [];
      for (const curr of frontier) {
        for (const l of data.links) {
          if (l.from === curr && !connected.has(l.to)) {
            connected.add(l.to);
            next.push(l.to);
          }
        }
      }
      frontier = next;
    }

    // Transitive backward (ancestors)
    frontier = [sel];
    while (frontier.length > 0) {
      const next: string[] = [];
      for (const curr of frontier) {
        for (const l of data.links) {
          if (l.to === curr && !connected.has(l.from)) {
            connected.add(l.from);
            next.push(l.from);
          }
        }
      }
      frontier = next;
    }
    return connected;
  }, [sel, data?.links]);

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
        const nodeId = `${n.type}:${n.code}`;
        const isSel = sel === nodeId;
        const isInPath = sel ? connectedNodeIds.has(nodeId) : false;
        const isLayerMatch = activeLayer === "all" || n.type === activeLayer;
        const isDimmed = sel ? !isInPath : !isLayerMatch;

        nodes.push({
          id: nodeId,
          type: "typed",
          position: { x: ci * 190, y: ri * 92 },
          data: {
            ...n,
            selected: isSel,
            dimmed: isDimmed,
            inPath: isInPath,
          },
          draggable: true,
        });
      });
    });

    const ids = new Set(nodes.map((n) => n.id));
    const edges: Edge[] = data.links
      .filter((l: any) => ids.has(l.from) && ids.has(l.to))
      .map((l: any, i: number) => {
        const isDirect = sel ? l.from === sel || l.to === sel : false;
        const isTransitive = sel ? connectedNodeIds.has(l.from) && connectedNodeIds.has(l.to) : false;
        const isLayerEdge = activeLayer === "all" || (l.from.startsWith(`${activeLayer}:`) || l.to.startsWith(`${activeLayer}:`));

        const isHighlighted = sel ? isTransitive : isLayerEdge;
        const isDimmed = sel ? !isTransitive : !isLayerEdge;

        return {
          id: `e${i}`,
          source: l.from,
          target: l.to,
          label: l.rel,
          animated: isDirect || isTransitive,
          style: {
            stroke: isDirect ? "var(--color-primary)" : isTransitive ? "var(--color-accent)" : "var(--color-border)",
            strokeWidth: isDirect ? 2.5 : isTransitive ? 2 : 1,
            opacity: isDimmed ? 0.12 : isHighlighted ? 1 : 0.7,
          },
          labelStyle: {
            fill: isDirect ? "var(--color-primary)" : isTransitive ? "var(--color-accent)" : "var(--color-secondary)",
            fontSize: 10,
            fontWeight: isDirect || isTransitive ? 600 : 400,
          },
        };
      });
    return { nodes, edges };
  }, [data, sel, connectedNodeIds, activeLayer]);

  const onNodeClick = useCallback(async (_: any, node: Node) => {
    const id = node.id as string;
    setSel(id);
    setSelection(id);
    try {
      const t = await traceArtifact(pid, id.split(":").pop() || "");
      setSelLinks([...(t.forward || []), ...(t.backward || [])]);
    } catch { setSelLinks([]); }
  }, [pid, setSelection]);

  const clearSelection = useCallback(() => {
    setSel(null);
    setSelLinks([]);
  }, []);

  const lookupGo = async () => {
    try {
      const code = lookup.includes(":") ? lookup : lookup;
      const bare = code.includes(":") ? code.split(":").pop() || "" : code;
      setTrace(await traceArtifact(pid, bare));
    } catch (e: any) { setErr(e.message); }
  };

  const suggest = async () => {
    setBusy(true);
    setErr("");
    try { setSuggestions((await suggestLinks(pid)).suggestions || []); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not suggest links."); }
    finally { setBusy(false); }
  };

  const autoHeal = async () => {
    setHealing(true);
    setErr("");
    try {
      const res = await api<any>(`/projects/${pid}/traceability/auto-heal`, { method: "POST" });
      setHealReport(`Healed! Coverage: ${res.coverage_before}% → ${res.coverage_after}%, repaired ${res.healed_stories + res.healed_tests} artifacts.`);
      setTimeout(() => setHealReport(null), 5000);
      await traceQ.refetch();
    } catch (e: any) {
      setErr(e instanceof Error ? e.message : "Auto-heal failed.");
    } finally {
      setHealing(false);
    }
  };

  const [confirming, setConfirming] = useState<string | null>(null);
  const [confirmedCount, setConfirmedCount] = useState(0);
  const [justConfirmed, setJustConfirmed] = useState<string | null>(null);
  const confirm = async (s: { from: string; to: string; rel: string }) => {
    const key = `${s.from}→${s.to}`;
    const [tt, tid] = s.to.split(":");
    if (!tt || !tid) { setErr(`Cannot confirm malformed suggestion: ${s.to}`); return; }
    setConfirming(key);
    setErr("");
    try {
      await api(`/projects/${pid}/traceability/links`, {
        method: "POST",
        body: { source_type: "requirement", source_id: s.from, target_type: tt, target_id: tid, relationship_type: s.rel },
      });
      setSuggestions((prev) => prev.filter((x) => x !== s));
      setConfirmedCount((n) => n + 1);
      setJustConfirmed(key);
      setTimeout(() => setJustConfirmed((cur) => (cur === key ? null : cur)), 4000);
      await traceQ.refetch();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not confirm link.");
    } finally {
      setConfirming(null);
    }
  };

  useEffect(() => {
    if (sel) onNodeClick({}, { id: sel } as Node);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (traceQ.isLoading) return <LoadingState stage="Building traceability graph" />;
  if (traceQ.isError) return <ErrorState message={(traceQ.error as Error)?.message} onRetry={() => traceQ.refetch()} />;

  const cov = data?.coverage ?? { coverage_pct: 0, orphans: [] as string[] };
  const counts = linkCounts(data?.links || []);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight">Traceability</h1>
          <p className="text-[13px] text-secondary">{cov.covered || 0}/{cov.total || 0} requirements traced · every edge stored, none invented</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="subtle" onClick={autoHeal} loading={healing}>{healing ? "Healing…" : "Auto-Heal Links"}</Button>
          <Button variant="ghost" onClick={suggest} disabled={busy}>{busy ? "Analyzing…" : "Suggest links"}</Button>
        </div>
      </div>
      {healReport && (
        <div className="mb-3 rounded-xl border border-success/40 bg-success/10 px-4 py-2.5 text-[13px] text-success" role="status">
          {healReport}
        </div>
      )}
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

      {(data?.links || []).length === 0 ? (
        <EmptyState title="No relationships yet" hint="Approve artifacts to begin building the traceability graph." />
      ) : (
        <>
        {/* Layer Filters & Path Isolation Controls */}
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Layer filter">
            <span className="flex items-center gap-1 text-[11.5px] font-semibold text-secondary mr-1">
              <Layers size={13} aria-hidden /> Filter layer:
            </span>
            <button
              role="tab"
              aria-selected={activeLayer === "all"}
              onClick={() => setActiveLayer("all")}
              className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-medium transition-colors ${
                activeLayer === "all"
                  ? "bg-primary text-canvas font-semibold shadow-xs"
                  : "bg-surface border border-border text-secondary hover:text-primary hover:border-border-strong"
              }`}
            >
              All layers
            </button>
            {ORDER.filter((t) => t !== "component").map((t) => {
              const isActive = activeLayer === t;
              return (
                <button
                  key={t}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveLayer(isActive ? "all" : t)}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[11px] transition-colors ${
                    isActive
                      ? "bg-elevated font-semibold text-primary border-2 shadow-xs"
                      : "bg-surface border border-border text-muted hover:text-secondary hover:border-border-strong"
                  }`}
                  style={{ borderColor: isActive ? LEGEND[t] : undefined }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: LEGEND[t] }} aria-hidden />
                  {t}
                </button>
              );
            })}
          </div>

          {(sel || activeLayer !== "all") && (
            <button
              onClick={() => { clearSelection(); setActiveLayer("all"); }}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-0.5 text-[11.5px] font-medium text-secondary hover:bg-elevated hover:text-primary transition-colors"
            >
              <RefreshCw size={11} aria-hidden /> Reset view
            </button>
          )}
        </div>

        {/* Selected Path Status Banner */}
        {sel && (
          <div className="mb-2 flex items-center justify-between rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-[12px] text-accent animate-in fade-in duration-150">
            <span className="flex items-center gap-1.5">
              <Sparkles size={13} className="text-accent" aria-hidden />
              <span>Isolated path for <b className="font-mono">{sel}</b>: <b>{connectedNodeIds.size}</b> artifacts in connected lineage.</span>
            </span>
            <button
              onClick={clearSelection}
              className="flex items-center gap-1 text-[11.5px] font-semibold text-secondary hover:text-primary hover:underline ml-2"
              title="Clear selection"
            >
              <X size={12} /> Clear path
            </button>
          </div>
        )}

        <div className="mb-3.5 h-[clamp(340px,54vh,540px)] overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
          <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodeClick={onNodeClick}
            fitView fitViewOptions={{ padding: 0.2 }} minZoom={0.3} maxZoom={1.5}
            colorMode={typeof document !== "undefined" && document.documentElement.dataset.theme === "light" ? "light" : "dark"}>
            <Background gap={24} size={1.5} color="var(--color-border)" />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        </>
      )}

      <Card className="mb-3.5">
        <h3 className="mb-2 text-[14px] font-semibold">Trace an artifact — type / to pick</h3>
        <div className="flex flex-wrap items-center gap-2">
          <SlashInput value={lookup} onChange={setLookup} items={codes} placeholder="/REQ-001" label="Artifact code" />
          <Button onClick={lookupGo}>Trace</Button>
        </div>
        {trace && (
          <div className="mt-2 text-[13px]">
            {(trace.forward || []).length === 0 && (trace.backward || []).length === 0
              ? <p className="text-secondary">Orphaned — no stored relationships.</p>
              : <>
                {(trace.forward || []).length > 0 && <><b>Downstream</b><ul>{trace.forward.map((l: any, i: number) => <li key={i} className="font-mono text-[12.5px]">{l.from} → {l.to}</li>)}</ul></>}
                {(trace.backward || []).length > 0 && <><b>Upstream</b><ul>{trace.backward.map((l: any, i: number) => <li key={i} className="font-mono text-[12.5px]">{l.from} → {l.to}</li>)}</ul></>}
              </>}
          </div>
        )}
      </Card>

      {suggestions.length > 0 && (
        <Card className="mb-3.5">
          <h3 className="mb-2 text-[14px] font-semibold">
            Suggested links ({suggestions.length}{suggestions.length > 8 ? " · showing first 8" : ""})
            {confirmedCount > 0 && <span className="ml-2 font-normal text-success">· {confirmedCount} confirmed</span>}
          </h3>
          {justConfirmed && (
            <p className="mb-2 rounded-lg border border-success/40 bg-success/10 px-2.5 py-1.5 text-[12.5px] text-success" role="status">
              Link confirmed: {justConfirmed} — next suggestion shown above.
            </p>
          )}
          {suggestions.slice(0, 8).map((s, i) => {
            const key = `${s.from}→${s.to}`;
            return (
              <p key={i} className="flex flex-wrap items-center gap-2 border-b border-border py-1.5 text-[13px] last:border-b-0">
                <code className="font-mono text-[12.5px]">{s.from}</code>→<code className="font-mono text-[12.5px]">{s.to}</code>
                <span className="text-secondary">({s.reason})</span>
                <Button variant="ghost" size="sm" loading={confirming === key} disabled={confirming !== null} onClick={() => confirm(s)}>Confirm</Button>
              </p>
            );
          })}
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
