"use client";
import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import {
  Pencil,
  History,
  RotateCcw,
  BookOpen,
  SlidersHorizontal,
  Copy,
  Check,
  Download,
  CheckCircle2,
  XCircle,
  Users,
  Target,
  Layers,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  Milestone,
  ArrowRight,
  Sparkles,
  FileText,
  HelpCircle,
  Clock,
  Compass,
} from "lucide-react";
import { usePrd, useRequirements, useProject, useWrite } from "../../../../lib/query/useArtifacts";
import type { Prd } from "../../../../lib/api/types";

/** One saved revision of the PRD artifact, as returned by /versions?artifact_type=prd. */
type PrdVersion = { id: string; version: number; status?: string; created_at?: string };
import { fmtDate } from "../../../../lib/utils/time";
import { Card, Panel, Metric } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { StatusBadge, Badge } from "../../../../components/ui/badge";
import { LoadingState, ErrorState } from "../../../../components/ui/feedback";
import { ApprovalBanner } from "../../../../components/ui/activity";
import { PrereqBanner, StageEmpty } from "../../../../components/ui/stage";
import { Dialog } from "../../../../components/ui/overlay";
import { useToast } from "../../../../components/ui/toast";

function buildPrdMarkdown(title: string, status: string, updatedAt: string, content: Prd["content"]): string {
  const lines: string[] = [];
  lines.push(`# Product Requirements Document (PRD): ${title || "Software Blueprint"}`);
  lines.push(`**Status:** ${status.toUpperCase()}  |  **Last Updated:** ${updatedAt}  |  **Author:** Staff Product Manager\n`);

  if (content.overview) {
    lines.push(`## 1. Executive Summary & Vision\n${content.overview}\n`);
  }
  if (content.problem) {
    lines.push(`## 2. Customer Problem Statement & Market Context\n${content.problem}\n`);
  }
  if (content.personas?.length) {
    lines.push(`## 3. Target User Personas & Key Stakeholders`);
    const pList = Array.isArray(content.personas) ? content.personas : [content.personas];
    pList.forEach((p: string) => lines.push(`- **${p}**`));
    lines.push("");
  }
  if (content.goals?.length || content.non_goals?.length) {
    lines.push(`## 4. Product Goals & Non-Goals`);
    if (content.goals?.length) {
      lines.push(`### In-Scope Strategic Goals`);
      const gList = Array.isArray(content.goals) ? content.goals : [content.goals];
      gList.forEach((g: string) => lines.push(`- [x] ${g}`));
      lines.push("");
    }
    if (content.non_goals?.length) {
      lines.push(`### Explicit Non-Goals (Out of Scope)`);
      const ngList = Array.isArray(content.non_goals) ? content.non_goals : [content.non_goals];
      ngList.forEach((ng: string) => lines.push(`- [ ] ${ng}`));
      lines.push("");
    }
  }
  if (content.user_journeys?.length) {
    lines.push(`## 5. End-to-End User Journeys`);
    const jList = Array.isArray(content.user_journeys) ? content.user_journeys : [content.user_journeys];
    jList.forEach((j: string) => lines.push(`- ${j}`));
    lines.push("");
  }
  if (content.scope_in?.length) {
    lines.push(`## 6. Functional Scope Matrix`);
    const sList = Array.isArray(content.scope_in) ? content.scope_in : [content.scope_in];
    sList.forEach((s: string) => lines.push(`- ${s}`));
    lines.push("");
  }
  if (content.non_functional?.length) {
    lines.push(`## 7. Non-Functional Requirements & Performance SLAs`);
    const nfList = Array.isArray(content.non_functional) ? content.non_functional : [content.non_functional];
    nfList.forEach((nf: string) => lines.push(`- ${nf}`));
    lines.push("");
  }
  if (content.success_metrics?.length) {
    lines.push(`## 8. Success Metrics & North Star KPIs`);
    const mList = Array.isArray(content.success_metrics) ? content.success_metrics : [content.success_metrics];
    mList.forEach((m: string) => lines.push(`- ${m}`));
    lines.push("");
  }
  if (content.risks?.length) {
    lines.push(`## 9. Key Risks & Mitigation Strategies`);
    const rList = Array.isArray(content.risks) ? content.risks : [content.risks];
    rList.forEach((r: string) => lines.push(`- ${r}`));
    lines.push("");
  }
  if (content.milestones?.length) {
    lines.push(`## 10. Product Roadmap & Release Milestones`);
    const msList = Array.isArray(content.milestones) ? content.milestones : [content.milestones];
    msList.forEach((ms: string) => lines.push(`- ${ms}`));
    lines.push("");
  }

  const standardKeys = new Set([
    "overview", "problem", "personas", "goals", "non_goals", "user_journeys",
    "scope_in", "scope_out", "non_functional", "priority_focus", "user_experience",
    "success_metrics", "risks", "milestones",
  ]);
  for (const [k, v] of Object.entries(content)) {
    if (!standardKeys.has(k) && v) {
      lines.push(`## ${k.replace(/_/g, " ").toUpperCase()}`);
      if (Array.isArray(v)) {
        v.forEach((item) => lines.push(`- ${item}`));
      } else {
        lines.push(String(v));
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

/** PRD Document Workspace (§18): Executive Product Manager Specification View + Section Outline Editor. */
export default function Prd() {
  const { projectId: pid } = useParams() as { projectId: string };
  const toast = useToast();
  const projectQ = useProject(pid);
  const prdQ = usePrd(pid);
  const reqsQ = useRequirements(pid);
  const write = useWrite(pid, ["prd", "activity", "runs"]);

  const [viewMode, setViewMode] = useState<"document" | "outline">("document");
  const [draft, setDraft] = useState<Prd["content"] | null>(null);
  const [editing, setEditing] = useState(false);
  const [section, setSection] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versions, setVersions] = useState<PrdVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [copied, setCopied] = useState(false);

  const [activeSection, setActiveSection] = useState("vision");
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (totalHeight > 0) {
        setScrollProgress(Math.min(100, Math.round((window.scrollY / totalHeight) * 100)));
      }

      const sectionIds = ["vision", "problem", "personas", "goals", "journeys", "functional", "nfr", "metrics"];
      for (let i = sectionIds.length - 1; i >= 0; i--) {
        const el = document.getElementById(sectionIds[i]);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 180) {
            setActiveSection(sectionIds[i]);
            break;
          }
        }
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSection = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
      setActiveSection(id);
    }
  };

  const openHistory = async () => {
    setHistoryOpen(true);
    setLoadingVersions(true);
    try {
      const res = await fetch(`/api/proxy/projects/${pid}/versions?artifact_type=prd`, { credentials: "include" });
      if (res.ok) {
        setVersions(await res.json());
      }
    } catch {
      setVersions([]);
    } finally {
      setLoadingVersions(false);
    }
  };

  const rollback = async (v: PrdVersion) => {
    try {
      const res = await fetch(`/api/proxy/projects/${pid}/versions/${v.id}/rollback`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        toast.success(`Rolled back PRD to version ${v.version}!`);
        setHistoryOpen(false);
        prdQ.refetch();
      } else {
        toast.error("Rollback failed");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rollback failed");
    }
  };

  // Hydrate draft state when PRD loads
  const loaded = prdQ.data;
  useEffect(() => {
    if (!editing && loaded?.content && Object.keys(loaded.content).length > 0) {
      setDraft((d) => d ?? loaded.content);
      setSection((s: string) => s || Object.keys(loaded.content)[0] || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  if (prdQ.isLoading || reqsQ.isLoading) return <LoadingState stage="Loading Product Requirements Document (PRD)" />;
  if (prdQ.isError) return <ErrorState message={(prdQ.error as Error)?.message} onRetry={() => prdQ.refetch()} />;

  const prd = prdQ.data ?? { content: {}, status: "draft" };
  const reqs = reqsQ.data || [];
  const approved = reqs.filter((r) => r.status === "approved").length;
  const projectTitle = projectQ.data?.name || "Product Specification";
  const projectIdea = projectQ.data?.idea || projectQ.data?.product_idea || projectQ.data?.description || "";

  if (!prd.content || Object.keys(prd.content).length === 0) {
    return (
      <div>
        {approved === 0 && (
          <PrereqBanner
            text="PRD generation needs at least one approved requirement — approvals gate downstream generation."
            href={`/projects/${pid}/requirements`}
            action="Review and approve requirements"
          />
        )}
        <StageEmpty
          pageTitle="Product Requirements Document (PRD)"
          title="No PRD generated yet"
          hint="Once requirements are approved, BlueprintAI compiles an authentic, executive-ready Product Manager PRD detailing customer problems, user personas, strategic goals, user journeys, functional matrix, and delivery roadmap."
          actionLabel="Generate Product Spec (PRD)"
          generating={write.isPending}
          disabledReason={approved === 0 ? "Waiting on requirement approvals (0 approved) — unlock by approving at least 1 requirement." : undefined}
          onGenerate={() => write.mutate({ path: `/projects/${pid}/prd/generate`, init: { method: "POST" } })}
        />
        {write.isError && <div className="mt-3"><ErrorState message={(write.error as Error)?.message} /></div>}
      </div>
    );
  }

  const content = editing ? draft || {} : prd.content || {};
  const keys = Object.keys(content);
  const shown = section || keys[0];
  const val = content[shown];

  const save = (status?: string) =>
    write.mutate(
      {
        path: `/projects/${pid}/prd`,
        init: { method: "PUT", body: JSON.stringify({ content: draft, ...(status ? { status } : {}) }) },
      },
      {
        onSuccess: () => {
          setEditing(false);
          toast.success("PRD saved successfully!");
        },
      }
    );

  const setSectionText = (text: string) => {
    if (!draft) return;
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    setDraft({ ...draft, [shown]: Array.isArray(draft[shown]) ? lines : text });
  };

  const copyMarkdown = () => {
    const md = buildPrdMarkdown(projectTitle, prd.status || "draft", fmtDate(prd.updated_at), content);
    navigator.clipboard.writeText(md);
    setCopied(true);
    toast.success("PRD copied to clipboard as Markdown!");
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadMarkdown = () => {
    const md = buildPrdMarkdown(projectTitle, prd.status || "draft", fmtDate(prd.updated_at), content);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `PRD-${projectTitle.replace(/[^a-zA-Z0-9_-]/g, "_")}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded PRD markdown file!");
  };

  const personasList: string[] = Array.isArray(content.personas) ? content.personas : content.personas ? [String(content.personas)] : [];
  const goalsList: string[] = Array.isArray(content.goals) ? content.goals : content.goals ? [String(content.goals)] : [];
  const nonGoalsList: string[] = Array.isArray(content.non_goals) ? content.non_goals : content.non_goals ? [String(content.non_goals)] : [];
  const journeysList: string[] = Array.isArray(content.user_journeys) ? content.user_journeys : content.user_journeys ? [String(content.user_journeys)] : [];
  const scopeInList: string[] = Array.isArray(content.scope_in) ? content.scope_in : content.scope_in ? [String(content.scope_in)] : [];
  const nonFuncList: string[] = Array.isArray(content.non_functional) ? content.non_functional : content.non_functional ? [String(content.non_functional)] : [];
  const metricsList: string[] = Array.isArray(content.success_metrics) ? content.success_metrics : content.success_metrics ? [String(content.success_metrics)] : [];
  const risksList: string[] = Array.isArray(content.risks) ? content.risks : content.risks ? [String(content.risks)] : [];
  const milestonesList: string[] = Array.isArray(content.milestones) ? content.milestones : content.milestones ? [String(content.milestones)] : [];

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-16">
      {/* Top Header & Executive Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-accent">
              <Sparkles size={12} /> Product Manager Specification
            </span>
            <StatusBadge value={prd.status || "draft"} />
          </div>
          <h1 className="mt-1 text-[26px] font-bold tracking-tight text-primary">
            {projectTitle}
          </h1>
          <p className="mt-0.5 text-[13px] text-secondary">
            Authored by Staff Product Manager · Updated {fmtDate(prd.updated_at)} · Grounded in {approved} approved requirements
          </p>
        </div>

        {/* View Mode & Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Document vs Outline Mode Toggle */}
          <div className="flex rounded-xl border border-border/80 bg-surface p-1 shadow-2xs">
            <button
              onClick={() => setViewMode("document")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                viewMode === "document" ? "bg-elevated font-semibold text-primary shadow-xs" : "text-secondary hover:text-primary"
              }`}
            >
              <BookOpen size={14} /> Document View
            </button>
            <button
              onClick={() => setViewMode("outline")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                viewMode === "outline" ? "bg-elevated font-semibold text-primary shadow-xs" : "text-secondary hover:text-primary"
              }`}
            >
              <SlidersHorizontal size={14} /> Section Outline
            </button>
          </div>

          <Button variant="ghost" size="sm" onClick={copyMarkdown} title="Copy full PRD formatted as Markdown">
            {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy MD"}
          </Button>

          <Button variant="ghost" size="sm" onClick={downloadMarkdown} title="Download as .md file">
            <Download size={14} /> Export
          </Button>

          <Button variant="ghost" size="sm" onClick={openHistory} title="View version snapshot history">
            <History size={14} /> History
          </Button>

          {!editing ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => { setDraft(prd.content); setEditing(true); setViewMode("outline"); }}>
                <Pencil size={14} /> Edit PRD
              </Button>
              {prd.status !== "approved" && (
                <Button loading={write.isPending} onClick={() => save("approved")}>
                  Approve PRD
                </Button>
              )}
            </>
          ) : (
            <>
              <Button loading={write.isPending} onClick={() => save(prd.status)}>
                Save Changes
              </Button>
              <Button variant="ghost" onClick={() => { setEditing(false); setDraft(prd.content); }}>
                Cancel
              </Button>
            </>
          )}
        </div>
      </div>

      {write.isError && <ErrorState message={(write.error as Error)?.message} />}

      {/* Approval Banner */}
      <ApprovalBanner
        status={prd.status || "draft"}
        onApprove={() => save("approved")}
        onEdit={() => { setDraft(prd.content); setEditing(true); setViewMode("outline"); }}
      />

      {/* Version History Modal */}
      <Dialog open={historyOpen} onClose={() => setHistoryOpen(false)} title="PRD Version History & Rollback">
        <div className="flex flex-col gap-3">
          {loadingVersions ? (
            <p className="text-[13px] text-secondary">Loading history...</p>
          ) : versions.length === 0 ? (
            <p className="text-[13px] text-secondary">No previous snapshots recorded yet.</p>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border">
              {versions.map((v) => (
                <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <div>
                    <span className="font-mono text-[13px] font-bold text-accent">Version {v.version}</span>
                    <span className="ml-2 text-[12px] text-muted">{fmtDate(v.created_at)}</span>
                    <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-[11px] uppercase tracking-wider text-secondary">{v.status}</span>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => rollback(v)}>
                    <RotateCcw size={13} /> Rollback
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Dialog>

      {/* MAIN CONTENT AREA */}
      {viewMode === "document" ? (
        /* ================= EXECUTIVE PRODUCT MANAGER DOCUMENT VIEW ================= */
        <div className="space-y-6">
          {/* Quick Jump Bar with Scroll-Spy & Reading Progress */}
          <div className="sticky top-16 z-20 -mx-2 overflow-hidden rounded-xl border border-border/80 bg-surface/95 shadow-xs backdrop-blur-md">
            {/* Reading progress hairline */}
            <div
              className="h-0.5 bg-primary transition-all duration-150"
              style={{ width: `${scrollProgress}%` }}
              aria-hidden
            />
            <div className="flex items-center justify-between gap-2 overflow-x-auto px-3.5 py-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted mr-1">Outline:</span>
                {[
                  { id: "vision", label: "Executive Summary" },
                  { id: "problem", label: "Problem Statement" },
                  { id: "personas", label: "Personas" },
                  { id: "goals", label: "Goals & Scope" },
                  { id: "journeys", label: "User Journeys" },
                  { id: "functional", label: "Functional Matrix" },
                  { id: "nfr", label: "SLAs & NFRs" },
                  { id: "metrics", label: "KPIs & Roadmap" },
                ].map((s) => {
                  const isActive = activeSection === s.id;
                  return (
                    <a
                      key={s.id}
                      href={`#${s.id}`}
                      onClick={(e) => scrollToSection(e, s.id)}
                      className={`rounded-lg px-2.5 py-1 text-[12px] font-medium whitespace-nowrap transition-all ${
                        isActive
                          ? "bg-elevated font-semibold text-primary shadow-xs border border-border/70"
                          : "text-secondary hover:bg-subtle hover:text-primary"
                      }`}
                    >
                      {s.label}
                    </a>
                  );
                })}
              </div>
              <span className="text-[11px] font-mono text-muted pl-2 hidden sm:inline flex-none">
                {scrollProgress}% read
              </span>
            </div>
          </div>

          {/* Metric Highlights Strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Requirements Linked" value={`${approved} REQs`} hint="Traceable scope" icon={<Layers size={14} />} />
            <Metric label="Target Personas" value={`${personasList.length || 3} Roles`} hint="User archetypes" icon={<Users size={14} />} />
            <Metric label="Core Journeys" value={`${journeysList.length || 4} Steps`} hint="End-to-end workflows" icon={<Compass size={14} />} />
            <Metric label="Release Milestones" value={`${milestonesList.length || 3} Phases`} hint="Roadmap horizon" icon={<Milestone size={14} />} />
          </div>

          {/* 1. Executive Summary & Vision */}
          <section id="vision" className="scroll-mt-28">
            <Card className="p-6 border-l-4 border-l-accent shadow-sm">
              <div className="flex items-center gap-2 mb-2 text-accent">
                <Target size={18} />
                <h2 className="text-[14px] font-bold uppercase tracking-wider">1. Executive Summary & Product Vision</h2>
              </div>
              <p className="text-[15px] leading-relaxed text-primary font-normal">
                {content.overview || (
                  <span className="italic text-muted">Executive summary will be synthesized from your approved requirements.</span>
                )}
              </p>
            </Card>
          </section>

          {/* 2. Customer Problem Statement & Market Context */}
          <section id="problem" className="scroll-mt-28">
            <Card className="p-6 border-l-4 border-l-amber-500/80 shadow-sm">
              <div className="flex items-center gap-2 mb-2 text-amber-600 dark:text-amber-400">
                <AlertTriangle size={18} />
                <h2 className="text-[14px] font-bold uppercase tracking-wider">2. Customer Problem Statement & Market Context</h2>
              </div>
              <p className="text-[14.5px] leading-relaxed text-primary">
                {content.problem || (
                  <span className="italic text-muted">Customer pain point and current state breakdown.</span>
                )}
              </p>
            </Card>
          </section>

          {/* 3. Target Customer Personas */}
          {personasList.length > 0 && (
            <section id="personas" className="scroll-mt-28">
              <div className="flex items-center gap-2 mb-3">
                <Users size={18} className="text-accent" />
                <h2 className="text-[16px] font-bold tracking-tight text-primary">3. Target User Personas & Key Stakeholders</h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {personasList.map((persona: string, idx: number) => {
                  const parts = persona.split(/—|-|:/);
                  const title = parts.length > 1 ? parts[0].trim() : `Persona ${idx + 1}`;
                  const desc = parts.length > 1 ? parts.slice(1).join("—").trim() : persona;
                  return (
                    <Card key={idx} className="p-4 flex flex-col justify-between hover:border-border-strong transition-all">
                      <div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-[12px] font-bold text-accent">
                            {title.charAt(0)}
                          </span>
                          <h3 className="text-[14px] font-semibold text-primary">{title}</h3>
                        </div>
                        <p className="text-[13px] leading-relaxed text-secondary">{desc}</p>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

          {/* 4. Strategic Goals & Non-Goals */}
          <section id="goals" className="scroll-mt-28">
            <div className="flex items-center gap-2 mb-3">
              <Target size={18} className="text-accent" />
              <h2 className="text-[16px] font-bold tracking-tight text-primary">4. Product Goals & Explicit Non-Goals</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {/* In-Scope Goals */}
              <Card className="p-4 border-l-4 border-l-success">
                <div className="flex items-center gap-1.5 mb-2.5 text-success">
                  <CheckCircle2 size={16} />
                  <h3 className="text-[13px] font-bold uppercase tracking-wider">In-Scope Strategic Goals</h3>
                </div>
                <ul className="space-y-2">
                  {goalsList.map((g: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-[13.5px] leading-relaxed text-primary">
                      <span className="text-success mt-0.5">•</span>
                      <span>{g}</span>
                    </li>
                  ))}
                  {goalsList.length === 0 && <li className="text-[13px] text-muted italic">No goals defined</li>}
                </ul>
              </Card>

              {/* Non-Goals */}
              <Card className="p-4 border-l-4 border-l-muted">
                <div className="flex items-center gap-1.5 mb-2.5 text-muted">
                  <XCircle size={16} />
                  <h3 className="text-[13px] font-bold uppercase tracking-wider">Explicit Non-Goals (Out of Scope)</h3>
                </div>
                <ul className="space-y-2">
                  {nonGoalsList.map((ng: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-[13.5px] leading-relaxed text-secondary">
                      <span className="text-muted mt-0.5 font-bold">✕</span>
                      <span>{ng}</span>
                    </li>
                  ))}
                  {nonGoalsList.length === 0 && <li className="text-[13px] text-muted italic">No non-goals defined</li>}
                </ul>
              </Card>
            </div>
          </section>

          {/* 5. End-to-End User Journeys */}
          {journeysList.length > 0 && (
            <section id="journeys" className="scroll-mt-28">
              <div className="flex items-center gap-2 mb-3">
                <Compass size={18} className="text-accent" />
                <h2 className="text-[16px] font-bold tracking-tight text-primary">5. End-to-End User Journeys</h2>
              </div>
              <div className="space-y-2.5">
                {journeysList.map((j: string, i: number) => {
                  const parts = j.split(/:\s*(.+)/);
                  const stepTitle = parts[0] || `Step ${i + 1}`;
                  const stepDetail = parts[1] || "";
                  return (
                    <Card key={i} className="p-4 flex items-start gap-3.5">
                      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-elevated font-mono text-[12px] font-bold text-accent border border-border">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-semibold text-primary">{stepTitle}</p>
                        {stepDetail && <p className="mt-0.5 text-[13px] leading-relaxed text-secondary">{stepDetail}</p>}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

          {/* 6. Functional Scope Matrix */}
          <section id="functional" className="scroll-mt-28">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <Layers size={18} className="text-accent" />
                <h2 className="text-[16px] font-bold tracking-tight text-primary">6. Functional Scope Matrix</h2>
              </div>
              <Link
                href={`/projects/${pid}/requirements`}
                className="text-[12.5px] font-medium text-accent hover:underline flex items-center gap-1"
              >
                View Source Requirements <ArrowRight size={13} />
              </Link>
            </div>
            <Card className="p-4">
              <div className="divide-y divide-border/60">
                {scopeInList.map((s: string, i: number) => {
                  const match = s.match(/^\[(REQ-\d+)\]\s*(.*)$/);
                  const code = match ? match[1] : null;
                  const title = match ? match[2] : s;
                  return (
                    <div key={i} className="py-2.5 first:pt-0 last:pb-0 flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        {code ? (
                          <Link
                            href={`/projects/${pid}/requirements`}
                            className="font-mono text-[12px] font-semibold text-accent hover:underline bg-accent/10 px-2 py-0.5 rounded-md border border-accent/20 flex-none"
                          >
                            {code}
                          </Link>
                        ) : (
                          <span className="h-2 w-2 rounded-full bg-accent mt-1.5 flex-none" />
                        )}
                        <span className="text-[13.5px] text-primary">{title}</span>
                      </div>
                      <Badge value="In Scope" tone="ok" />
                    </div>
                  );
                })}
              </div>
            </Card>
          </section>

          {/* 7. Non-Functional Requirements & Performance SLAs */}
          {nonFuncList.length > 0 && (
            <section id="nfr" className="scroll-mt-28">
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck size={18} className="text-accent" />
                <h2 className="text-[16px] font-bold tracking-tight text-primary">7. Non-Functional Requirements & Performance SLAs</h2>
              </div>
              <Card className="p-4">
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {nonFuncList.map((nf: string, i: number) => (
                    <div key={i} className="rounded-xl border border-border/80 bg-canvas/40 p-3">
                      <div className="flex items-center gap-1.5 mb-1 text-[11px] font-bold uppercase tracking-wider text-muted">
                        <Clock size={12} /> Service Level Requirement
                      </div>
                      <p className="text-[13px] leading-relaxed text-primary">{nf}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </section>
          )}

          {/* 8. Success Metrics & Roadmap */}
          <section id="metrics" className="scroll-mt-28">
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Success Metrics */}
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-3 text-accent">
                  <TrendingUp size={16} />
                  <h3 className="text-[13px] font-bold uppercase tracking-wider">8. Success Metrics & North Star KPIs</h3>
                </div>
                <ul className="space-y-2">
                  {metricsList.map((m: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-[13px] leading-relaxed text-primary">
                      <span className="text-accent font-bold">✓</span>
                      <span>{m}</span>
                    </li>
                  ))}
                  {metricsList.length === 0 && <li className="text-[13px] text-muted italic">No metrics defined</li>}
                </ul>
              </Card>

              {/* Release Milestones */}
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-3 text-accent">
                  <Milestone size={16} />
                  <h3 className="text-[13px] font-bold uppercase tracking-wider">9. Release Roadmap & Milestones</h3>
                </div>
                <ul className="space-y-2">
                  {milestonesList.map((ms: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-[13px] leading-relaxed text-primary">
                      <span className="font-mono text-[11px] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded border border-accent/20">
                        P{i + 1}
                      </span>
                      <span>{ms}</span>
                    </li>
                  ))}
                  {milestonesList.length === 0 && <li className="text-[13px] text-muted italic">No milestones defined</li>}
                </ul>
              </Card>
            </div>
          </section>

          {/* 10. Risks & Mitigations */}
          {risksList.length > 0 && (
            <Card className="p-4 border-l-4 border-l-amber-500/80">
              <div className="flex items-center gap-2 mb-2 text-amber-600 dark:text-amber-400">
                <AlertTriangle size={16} />
                <h3 className="text-[13px] font-bold uppercase tracking-wider">10. Key Product Risks & Mitigations</h3>
              </div>
              <ul className="space-y-1.5">
                {risksList.map((r: string, i: number) => (
                  <li key={i} className="text-[13px] leading-relaxed text-secondary">• {r}</li>
                ))}
              </ul>
            </Card>
          )}

          {/* Downstream Blueprints Navigation Footer */}
          <Card className="p-5 bg-elevated/40 border-border">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h4 className="text-[14px] font-bold text-primary">Authoritative Specification Sealed</h4>
                <p className="text-[12.5px] text-secondary">
                  This PRD directly drives user story decomposition, architectural component mapping, and database schema generation.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/projects/${pid}/stories`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-[12.5px] font-medium text-primary hover:border-border-strong hover:shadow-xs transition-all"
                >
                  User Stories <ArrowRight size={13} />
                </Link>
                <Link
                  href={`/projects/${pid}/architecture`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-[12.5px] font-medium text-primary hover:border-border-strong hover:shadow-xs transition-all"
                >
                  Architecture <ArrowRight size={13} />
                </Link>
                <Link
                  href={`/projects/${pid}/traceability`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-[12.5px] font-medium text-primary hover:border-border-strong hover:shadow-xs transition-all"
                >
                  Traceability Matrix <ArrowRight size={13} />
                </Link>
              </div>
            </div>
          </Card>
        </div>
      ) : (
        /* ================= SECTION OUTLINE & EDITOR VIEW ================= */
        <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          {/* Outline Sidebar */}
          <Card className="p-2 space-y-1 h-fit">
            <p className="px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Document Sections</p>
            {keys.map((k) => (
              <button
                key={k}
                onClick={() => setSection(k)}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[13px] capitalize transition-colors ${
                  k === shown
                    ? "bg-elevated font-semibold text-primary shadow-2xs"
                    : "text-secondary hover:bg-surface hover:text-primary"
                }`}
              >
                <span>{k.replace(/_/g, " ")}</span>
                <span className="font-mono text-[10px] text-muted">
                  {Array.isArray(content[k]) ? `${content[k].length}` : "txt"}
                </span>
              </button>
            ))}
          </Card>

          {/* Section Detail & Editor */}
          <Card className="w-full">
            <div className="flex items-center justify-between border-b border-border/80 pb-3 mb-3">
              <h3 className="text-[17px] font-semibold capitalize text-primary">{shown.replace(/_/g, " ")}</h3>
              <div className="flex items-center gap-2">
                {!editing ? (
                  <Button size="sm" variant="ghost" onClick={() => { setDraft(content); setEditing(true); }}>
                    <Pencil size={13} /> Edit Section
                  </Button>
                ) : (
                  <span className="text-[12px] text-amber-500 font-medium">Editing Active Draft</span>
                )}
              </div>
            </div>

            {editing ? (
              <div className="space-y-3">
                <textarea
                  rows={Math.max(8, (Array.isArray(val) ? val.length : 3) + 3)}
                  value={Array.isArray(val) ? val.join("\n") : String(val ?? "")}
                  onChange={(e) => setSectionText(e.target.value)}
                  aria-label={shown}
                  placeholder={`Enter content for ${shown}... (one item per line for lists)`}
                  className="w-full rounded-xl border border-border bg-canvas p-3.5 text-[13.5px] leading-relaxed font-mono focus:border-accent focus:outline-none"
                />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDraft(prd.content); }}>
                    Cancel
                  </Button>
                  <Button size="sm" loading={write.isPending} onClick={() => save(prd.status)}>
                    Save Section
                  </Button>
                </div>
              </div>
            ) : Array.isArray(val) ? (
              <ul className="space-y-2">
                {val.map((v: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-[14px] leading-relaxed text-primary">
                    <span className="text-accent mt-0.5 font-bold">•</span>
                    <span>{v}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14.5px] leading-relaxed text-primary whitespace-pre-wrap">{String(val ?? "")}</p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
