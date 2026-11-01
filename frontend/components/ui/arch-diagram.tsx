"use client";
import { useEffect, useId, useRef, useState } from "react";
import mermaid from "mermaid";

mermaid.initialize({ startOnLoad: false, theme: "neutral", fontFamily: "Inter, sans-serif" });

export type ArchNode = { name: string; kind: string; boundary?: string };
export type ArchEdge = { source: string; target: string; label?: string };

const esc = (s: string) => (s || "node").replace(/["#<>`{}|]/g, "").trim().slice(0, 60) || "node";

/** Mermaid flowchart definition from stored components + relationships. */
export function archDefinition(comps: ArchNode[], rels: ArchEdge[]): string {
  const ids = new Map<string, string>();
  comps.forEach((c, i) => ids.set(c.name, `n${i}`));
  const shape = (c: ArchNode, id: string) => {
    const label = esc(c.name);
    const kind = (c.kind || "").toLowerCase();
    if (kind === "database") return `${id}[("${label}")]`;
    if (kind === "frontend") return `${id}(["${label}"])`;
    if (kind === "external") return `${id}[["${label}"]]`;
    if (kind === "queue") return `${id}["${label}"]`;
    return `${id}["${label}"]`;
  };
  const lines = ["flowchart LR"];
  const groups = new Map<string, ArchNode[]>();
  const ungrouped: ArchNode[] = [];
  for (const c of comps) {
    const b = (c.boundary || "").trim();
    if (b) {
      if (!groups.has(b)) groups.set(b, []);
      groups.get(b)!.push(c);
    } else ungrouped.push(c);
  }
  for (const c of ungrouped) lines.push(`  ${shape(c, ids.get(c.name)!)}`);
  for (const [b, members] of groups) {
    lines.push(`  subgraph ${esc(b).replace(/\s+/g, "_")}[${esc(b)}]`);
    for (const c of members) lines.push(`    ${shape(c, ids.get(c.name)!)}`);
    lines.push("  end");
  }
  for (const r of rels) {
    const a = ids.get(r.source);
    const b = ids.get(r.target);
    if (!a || !b) continue; // dangling edges are dropped, never guessed
    const label = esc(r.label || "");
    lines.push(label ? `  ${a} -->|${label}| ${b}` : `  ${a} --> ${b}`);
  }
  return lines.join("\n");
}

/** Rendered architecture diagram (SVG). Falls back to nothing on parse errors. */
export function ArchDiagram({ comps, rels }: { comps: ArchNode[]; rels: ArchEdge[] }) {
  const reactId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    (async () => {
      try {
        const renderId = `arch-${reactId}-${Math.random().toString(36).slice(2, 8)}`;
        const { svg } = await mermaid.render(renderId, archDefinition(comps, rels));
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [comps, rels, reactId]);

  const def = archDefinition(comps, rels);
  const [copied, setCopied] = useState(false);
  const copyDef = async () => {
    try {
      await navigator.clipboard.writeText(def);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  if (comps.length === 0) return null;

  if (failed) {
    return (
      <div className="rounded-xl border border-border bg-canvas p-4 text-[13px]">
        <p className="font-medium text-secondary">Mermaid graph could not be previewed visually, but the definition is preserved:</p>
        <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-elevated p-3 font-mono text-[12px] text-primary">{def}</pre>
        <button type="button" onClick={copyDef} className="mt-2 text-[12.5px] font-medium text-accent hover:underline">
          {copied ? "✓ Copied definition" : "Copy Mermaid definition"}
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} role="img" aria-label="Architecture diagram"
      className="overflow-x-auto [&_svg]:h-auto [&_svg]:w-full [&_svg]:max-w-[900px]" />
  );
}
