"use client";
import { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowDown,
  GitFork,
  BookOpen,
  Code2,
  Database,
  ShieldAlert,
  CheckSquare,
  TestTube2,
  ExternalLink,
  AlertTriangle,
  ShieldCheck,
  Sparkles,
  Layers,
  Network,
  ListTree,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useRequirements } from "../../../../lib/query/useArtifacts";
import { analyzeImpact } from "../../../../lib/api/endpoints";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { ErrorState, EmptyState, LoadingState } from "../../../../components/ui/feedback";
import { ArtifactLink } from "../../../../components/ui/activity";
import { SlashInput } from "../../../../components/ui/slash";

const RANK: Record<string, number> = {
  requirement: 0,
  story: 1,
  api: 2,
  db: 3,
  security: 4,
  task: 5,
  test: 6,
};

function rankOf(code: string): number {
  const t = code.split(":")[0]?.toLowerCase() || "";
  return RANK[t] ?? 99;
}

type ImpactResult = { requirement: string; affected: string[]; explanation?: string; provider?: string };

interface DomainConfig {
  key: string;
  label: string;
  icon: LucideIcon;
  color: string;
  desc: string;
}

const DOMAINS: DomainConfig[] = [
  { key: "story", label: "User Stories", icon: BookOpen, color: "#818cf8", desc: "User journeys & acceptance criteria" },
  { key: "api", label: "API Endpoints", icon: Code2, color: "#3b5bdb", desc: "Payload schemas & contracts" },
  { key: "db", label: "Database Schema", icon: Database, color: "#b7791f", desc: "Entities, columns, and foreign keys" },
  { key: "security", label: "Security & Threat Rules", icon: ShieldAlert, color: "#c53030", desc: "Authentication & policy mitigations" },
  { key: "task", label: "Implementation Tasks", icon: CheckSquare, color: "#2f855a", desc: "Engineering sprint deliverables" },
  { key: "test", label: "Verification Tests", icon: TestTube2, color: "#7c5cd6", desc: "Unit, contract & security tests" },
  { key: "component", label: "UI Components", icon: Layers, color: "#8a857d", desc: "Frontend view components" },
];

/** Impact workspace (§28): deterministic branching tree, blast radius metrics, LLM architectural synthesis. */
export default function Impact() {
  const { projectId: pid } = useParams() as { projectId: string };
  const reqsQ = useRequirements(pid);
  const [code, setCode] = useState("REQ-001");
  const [result, setResult] = useState<ImpactResult | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [viewMode, setViewMode] = useState<"tree" | "chain">("tree");

  const analyze = async (targetCode?: string) => {
    const effectiveCode = targetCode || code;
    if (busy || !effectiveCode.trim()) return;
    setBusy(true);
    setErr("");
    setResult(null);
    try {
      setResult(await analyzeImpact(pid, effectiveCode));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Impact analysis failed.");
    } finally {
      setBusy(false);
    }
  };

  const chain = useMemo(() => {
    if (!result) return [];
    return [...result.affected].sort((a: string, b: string) => rankOf(a) - rankOf(b));
  }, [result]);

  const reqCodes = useMemo(() => {
    return (reqsQ.data || []).map((r) => r.code);
  }, [reqsQ.data]);

  // Group affected artifacts by category
  const groupedAffected = useMemo(() => {
    if (!result?.affected) return {};
    const groups: Record<string, string[]> = {};
    for (const a of result.affected as string[]) {
      const type = a.split(":")[0]?.toLowerCase() || "other";
      if (!groups[type]) groups[type] = [];
      groups[type].push(a);
    }
    return groups;
  }, [result]);

  // Blast radius calculation
  const blastRadius = useMemo(() => {
    if (!result?.affected) return null;
    const total = result.affected.length;
    const touchesDb = Boolean(groupedAffected["db"]?.length);
    const touchesSec = Boolean(groupedAffected["security"]?.length);
    const touchesApi = Boolean(groupedAffected["api"]?.length);

    let level: "Low" | "Medium" | "High" = "Low";
    let levelColor = "text-success bg-success/15 border-success/30";
    let message = "Localized downstream scope. No database or security rules affected.";

    if (touchesDb || touchesSec || total >= 8) {
      level = "High";
      levelColor = "text-danger bg-danger/15 border-danger/30";
      message = "Wide blast radius. Changes cross database schemas or security boundaries.";
    } else if (total >= 4 || touchesApi) {
      level = "Medium";
      levelColor = "text-amber-500 bg-amber-500/15 border-amber-500/30";
      message = "Moderate blast radius. Involves API contract and task schedule updates.";
    }

    return { total, level, levelColor, message, touchesDb, touchesSec, touchesApi };
  }, [result, groupedAffected]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight">Impact Analysis</h1>
          <p className="text-[13px] text-secondary">
            Deterministic BFS traversal across stored traceability links — zero guessing.
          </p>
        </div>
        {result && (
          <div className="flex gap-1 rounded-full border border-border bg-surface p-1" role="tablist" aria-label="View mode">
            <button
              role="tab"
              aria-selected={viewMode === "tree"}
              onClick={() => setViewMode("tree")}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
                viewMode === "tree" ? "bg-elevated text-primary font-semibold shadow-xs" : "text-secondary hover:text-primary"
              }`}
            >
              <Network size={13} /> Branching Tree
            </button>
            <button
              role="tab"
              aria-selected={viewMode === "chain"}
              onClick={() => setViewMode("chain")}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
                viewMode === "chain" ? "bg-elevated text-primary font-semibold shadow-xs" : "text-secondary hover:text-primary"
              }`}
            >
              <ListTree size={13} /> Traversal Chain
            </button>
          </div>
        )}
      </div>

      {err && <div className="mb-3"><ErrorState message={err} /></div>}

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <SlashInput
            value={code}
            onChange={(next) => { setCode(next); setResult(null); setErr(""); }}
            items={reqCodes}
            placeholder="/REQ-001"
            label="Requirement code"
          />
          <Button loading={busy} onClick={() => analyze()}>Analyze impact</Button>
        </div>

        {reqCodes.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2.5">
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wider mr-1">Quick Select:</span>
            {reqCodes.slice(0, 6).map((rc: string) => (
              <button
                key={rc}
                type="button"
                onClick={() => { setCode(rc); analyze(rc); }}
                className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] transition-colors ${
                  code === rc
                    ? "border-primary bg-primary/10 text-primary font-semibold"
                    : "border-border bg-surface text-secondary hover:border-border-strong hover:text-primary"
                }`}
              >
                {rc}
              </button>
            ))}
          </div>
        )}
      </Card>

      {busy && <LoadingState stage="Traversing dependent artifacts & evaluating blast radius" />}

      {!result && !busy && (
        <EmptyState
          title="No analysis yet"
          hint="Select a requirement above to calculate downstream blast radius and inspect affected architectural layers."
        />
      )}

      {result && blastRadius && (
        <div className="space-y-4">
          {/* Blast Radius & Risk Assessment Overview Card */}
          <Card className="border-border">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-[14px] font-bold text-accent">{result.requirement}</span>
                  <span className="text-secondary text-[13px]">→</span>
                  <span className="text-[14px] font-semibold text-primary">{blastRadius.total} affected artifacts</span>
                  <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${blastRadius.levelColor}`}>
                    {blastRadius.level} Risk
                  </span>
                </div>
                <p className="text-[12.5px] text-secondary">{blastRadius.message}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/projects/${pid}/traceability?focus=${result.requirement}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-elevated px-3 py-1.5 text-[12px] font-medium text-secondary hover:text-primary hover:border-border-strong transition-colors"
                >
                  <ExternalLink size={12} /> Open in Traceability Graph
                </Link>
              </div>
            </div>

            {/* Architectural Synthesis */}
            {result.explanation && (
              <div className="mt-3.5 rounded-xl border border-border/80 bg-subtle/40 p-3 text-[12.5px] leading-relaxed text-secondary">
                <div className="flex items-center justify-between gap-2 mb-1 text-[11.5px] font-semibold text-primary">
                  <span className="flex items-center gap-1">
                    <Sparkles size={12} className="text-accent" aria-hidden /> Architectural Impact Synthesis
                  </span>
                  {result.provider && (
                    <span className="font-mono text-[10px] text-muted uppercase tracking-wider">
                      Provider: {result.provider}
                    </span>
                  )}
                </div>
                {result.explanation}
              </div>
            )}
          </Card>

          {/* View Mode 1: Interactive Branching Tree */}
          {viewMode === "tree" ? (
            <div className="space-y-4">
              {/* Root Requirement Card */}
              <div className="mx-auto max-w-[420px] text-center">
                <div className="relative rounded-2xl border-2 border-accent bg-elevated p-4 shadow-sm ring-2 ring-accent/20">
                  <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent border border-accent/30 inline-block mb-1.5">
                    Root Change Source
                  </span>
                  <p className="font-mono text-[16px] font-bold text-primary">{result.requirement}</p>
                  <p className="mt-1 text-[12px] text-secondary">Selected Requirement Under Analysis</p>
                </div>

                {/* Tree Trunk Stem */}
                <div className="mx-auto h-8 w-0.5 bg-accent/60" />
                <div className="mx-auto -mt-1 h-2 w-2 rounded-full bg-accent" />
              </div>

              {/* Branch Clusters Grid */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {DOMAINS.map((dom) => {
                  const items = groupedAffected[dom.key] || [];
                  const DomIcon = dom.icon;
                  const hasItems = items.length > 0;

                  return (
                    <div
                      key={dom.key}
                      style={{ borderColor: hasItems ? `${dom.color}55` : undefined }}
                      className={`rounded-2xl border p-3.5 transition-all ${
                        hasItems
                          ? "bg-surface shadow-xs hover:border-border-strong"
                          : "bg-canvas/40 opacity-40 border-dashed border-border"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <DomIcon size={14} style={{ color: dom.color }} aria-hidden />
                          <h3 className="text-[13px] font-semibold text-primary">{dom.label}</h3>
                        </div>
                        <span
                          style={{
                            background: hasItems ? `${dom.color}22` : undefined,
                            color: hasItems ? dom.color : undefined,
                            borderColor: hasItems ? `${dom.color}44` : undefined,
                          }}
                          className={`rounded-full px-2 py-0.5 font-mono text-[10.5px] font-bold border ${
                            !hasItems ? "bg-subtle text-muted border-border/40" : ""
                          }`}
                        >
                          {items.length}
                        </span>
                      </div>
                      <p className="text-[11px] text-secondary mb-3">{dom.desc}</p>

                      {hasItems ? (
                        <div className="flex flex-wrap gap-1.5">
                          {items.map((item) => (
                            <ArtifactLink key={item} code={item} pid={pid} />
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11.5px] italic text-muted">No affected artifacts in this domain</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* View Mode 2: Sequential Traversal Chain */
            <div className="mx-auto max-w-[600px] space-y-2">
              <div className="rounded-xl border-2 border-accent/60 bg-elevated p-3 text-center shadow-xs">
                <ArtifactLink code={result.requirement} pid={pid} />
                <p className="mt-1 text-[11.5px] text-secondary">Root changed requirement</p>
              </div>

              {chain.map((a: string, idx: number) => {
                const type = a.split(":")[0]?.toLowerCase() || "";
                const dom = DOMAINS.find((d) => d.key === type);

                return (
                  <div key={a} className="flex flex-col items-center">
                    <ArrowDown size={14} className="my-1 text-muted" aria-hidden />
                    <div className="w-full rounded-xl border border-border bg-surface p-2.5 shadow-2xs hover:border-border-strong transition-colors">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="grid h-5 w-5 place-items-center rounded-full bg-elevated font-mono text-[10px] font-bold text-secondary">
                            {idx + 1}
                          </span>
                          <ArtifactLink code={a} pid={pid} />
                        </div>
                        {dom && (
                          <span
                            style={{ color: dom.color }}
                            className="font-mono text-[10.5px] font-semibold uppercase tracking-wider"
                          >
                            {dom.label}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
