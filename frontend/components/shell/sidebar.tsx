"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ListChecks, FileText, MessagesSquare, Network, Database,
  Globe, ShieldCheck, KanbanSquare, FlaskConical, GitBranch, Scale, Zap, BookOpen,
  ChevronsLeft, ChevronsRight, Layers, LayoutDashboard,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/utils/cn";
import { useShell } from "./context";
import { useTraceability, useIssues } from "../../lib/query/useArtifacts";

type Dot = "ok" | "warn" | "muted" | null;
type Item = { label: string; slug: string; Icon: LucideIcon; match: RegExp; dotKey?: string };

const SECTIONS: { title: string | null; items: Item[] }[] = [
  { title: null, items: [
    { label: "Overview", slug: "", Icon: LayoutDashboard, match: /^\/projects\/[^/]+$/, dotKey: "overview" },
    { label: "Blueprint", slug: "blueprint", Icon: Layers, match: /\/blueprint$/ },
  ]},
  { title: "Plan", items: [
    { label: "Requirements", slug: "requirements", Icon: ListChecks, match: /\/requirements/, dotKey: "requirements" },
    { label: "Product Spec", slug: "prd", Icon: FileText, match: /\/prd/ },
    { label: "User Stories", slug: "stories", Icon: MessagesSquare, match: /\/stories/, dotKey: "stories" },
  ]},
  { title: "Design", items: [
    { label: "Architecture", slug: "architecture", Icon: Network, match: /\/architecture/ },
    { label: "Data Model", slug: "database", Icon: Database, match: /\/database/ },
    { label: "APIs", slug: "apis", Icon: Globe, match: /\/apis/, dotKey: "apis" },
    { label: "Security", slug: "security", Icon: ShieldCheck, match: /\/security/ },
  ]},
  { title: "Delivery", items: [
    { label: "Tasks", slug: "tasks", Icon: KanbanSquare, match: /\/tasks/ },
    { label: "Tests", slug: "tests", Icon: FlaskConical, match: /\/tests/, dotKey: "tests" },
  ]},
  { title: "Assure", items: [
    { label: "Traceability", slug: "traceability", Icon: GitBranch, match: /\/traceability/, dotKey: "traceability" },
    { label: "Consistency", slug: "consistency", Icon: Scale, match: /\/consistency/, dotKey: "issues" },
    { label: "Impact Analysis", slug: "impact", Icon: Zap, match: /\/impact/ },
  ]},
  { title: "Reference", items: [
    { label: "Knowledge", slug: "knowledge", Icon: BookOpen, match: /\/knowledge/ },
  ]},
];

const DOT_CLS: Record<Exclude<Dot, null>, string> = {
  ok: "bg-success", warn: "bg-warning", muted: "bg-border-strong",
};

/** Collapsible project sidebar (§8): lifecycle groups, inbox badge, keyboard accessible. */
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname() || "";
  const { pid, project } = useShell();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("dbp-nav") === "collapsed"; } catch { return false; }
  });
  const toggle = () => {
    setCollapsed((c) => {
      try { localStorage.setItem("dbp-nav", c ? "expanded" : "collapsed"); } catch { /* private mode */ }
      return !c;
    });
  };
  const base = `/projects/${pid}`;
  const { data: trace } = useTraceability(pid);
  const { data: issues } = useIssues(pid);
  const orphans = trace?.coverage?.orphans?.length || 0;
  const openIssues = issues?.filter((i: any) => i.status === "open").length || 0;
  const cov = trace?.coverage?.coverage_pct || 0;
  const totalReqs = trace?.coverage?.total || 0;
  const m = project?.metrics || {};
  // Status dots are data presence from already-loaded queries (never invented):
  // ok = healthy/has data, warn = needs attention, muted = empty, null = no signal.
  const dots: Record<string, Dot> = {
    overview: orphans + openIssues > 0 ? "warn" : "ok",
    requirements: totalReqs === 0 ? "muted" : cov === 100 ? "ok" : "warn",
    stories: (m.stories || 0) > 0 ? "ok" : "muted",
    apis: (m.apis || 0) > 0 ? "ok" : "muted",
    tests: (m.tests || 0) > 0 ? "ok" : "muted",
    traceability: totalReqs === 0 ? "muted" : cov === 100 ? "ok" : "warn",
    issues: openIssues > 0 ? "warn" : "ok",
  };
  const issuesTitle = `Needs triage: ${orphans} orphaned, ${openIssues} open issues`;

  const renderItem = (it: Item) => {
    const active = it.match.test(path);
    const dot = it.dotKey ? dots[it.dotKey] ?? null : null;
    const showBadge = it.label === "Overview" && (orphans + openIssues) > 0;
    const Icon = it.Icon;
    return (
      <Link key={it.label} href={it.slug ? `${base}/${it.slug}` : base} onClick={onNavigate}
        aria-current={active ? "page" : undefined} title={collapsed ? it.label : undefined} prefetch
        className={cn("mt-0.5 flex items-center gap-2 rounded-lg px-2.5 py-2 text-[14px] transition-colors duration-150",
          collapsed && "justify-center px-0",
          active ? "bg-elevated font-medium text-primary" : "text-secondary hover:bg-elevated hover:text-primary")}>
        <Icon size={16} className="flex-none" aria-hidden />
        {!collapsed && <span className="min-w-0 flex-1 truncate">{it.label}</span>}
        {!collapsed && dot && (
          <span className={cn("h-1.5 w-1.5 flex-none rounded-full", DOT_CLS[dot])} aria-hidden />
        )}
        {!collapsed && showBadge && (
          <span className="rounded-full bg-elevated px-2 py-0.5 font-mono text-[11px] font-semibold text-secondary"
            title={issuesTitle} aria-label={issuesTitle}>{orphans + openIssues}</span>
        )}
      </Link>
    );
  };

  return (
    <aside aria-label="Project navigation"
      className={cn("sticky top-0 flex h-screen flex-col border-r border-border bg-subtle transition-[width] duration-200", collapsed ? "w-14 px-2 py-4" : "w-60 px-3 py-4")}>
      <div className={cn("mb-2 flex items-center gap-2.5 px-1", collapsed && "justify-center px-0")}>
        <Image src="/logo.svg" alt="" width={32} height={32} className="h-8 w-8 flex-none rounded-full" aria-hidden />
        {!collapsed && <span className="leading-tight"><b className="block text-[15px] font-medium tracking-[-0.18px]">Blueprint <span className="text-muted">AI</span></b></span>}
      </div>
      <nav className="scroll-thin mt-1 flex-1 overflow-y-auto" aria-label="Modules">
        {SECTIONS.map((sec) => (
          <div key={sec.title || "top"} className="mt-3 first:mt-0">
            {!collapsed && sec.title && <p className="px-2.5 text-[11px] font-semibold uppercase tracking-[0.96px] text-muted">{sec.title}</p>}
            {sec.items.map(renderItem)}
          </div>
        ))}
      </nav>
      <div className={cn("border-t border-border pt-2", collapsed && "flex flex-col items-center")}>
        <button onClick={toggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className="mt-1 flex w-full items-center justify-center gap-2 rounded-full px-2 py-1.5 text-muted transition-colors duration-150 hover:bg-elevated hover:text-primary">
          {collapsed ? <ChevronsRight size={15} /> : <><ChevronsLeft size={15} /><span className="text-[12px]">Collapse</span></>}
        </button>
      </div>
    </aside>
  );
}
