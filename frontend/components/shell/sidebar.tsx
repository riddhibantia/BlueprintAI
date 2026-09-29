"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, ListChecks, FileText, MessagesSquare, Network, Database,
  Globe, ShieldCheck, KanbanSquare, FlaskConical, GitBranch, Scale, Zap, BookOpen,
  Settings as SettingsIcon, User, ChevronsLeft, ChevronsRight, Layers, Inbox as InboxIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/utils/cn";
import { useShell } from "./context";
import { useTraceability, useIssues } from "../../lib/query/useArtifacts";

type Item = { label: string; slug: string; Icon: LucideIcon; match: RegExp; badge?: number };

const TOP: Item[] = [
  { label: "Inbox", slug: "", Icon: InboxIcon, match: /^\/projects\/[^/]+$/ },
  { label: "Blueprint", slug: "blueprint", Icon: Layers, match: /\/blueprint$/ },
];

const SECTIONS: { title: string; items: Item[] }[] = [
  { title: "Discover", items: [
    { label: "Requirements", slug: "requirements", Icon: ListChecks, match: /\/requirements/ },
  ]},
  { title: "Define", items: [
    { label: "Product Spec", slug: "prd", Icon: FileText, match: /\/prd/ },
    { label: "User Stories", slug: "stories", Icon: MessagesSquare, match: /\/stories/ },
  ]},
  { title: "Design", items: [
    { label: "Architecture", slug: "architecture", Icon: Network, match: /\/architecture/ },
    { label: "Data Model", slug: "database", Icon: Database, match: /\/database/ },
    { label: "APIs", slug: "apis", Icon: Globe, match: /\/apis/ },
    { label: "Security", slug: "security", Icon: ShieldCheck, match: /\/security/ },
  ]},
  { title: "Build", items: [
    { label: "Tasks", slug: "tasks", Icon: KanbanSquare, match: /\/tasks/ },
  ]},
  { title: "Verify", items: [
    { label: "Tests", slug: "tests", Icon: FlaskConical, match: /\/tests/ },
    { label: "Traceability", slug: "traceability", Icon: GitBranch, match: /\/traceability/ },
    { label: "Consistency", slug: "consistency", Icon: Scale, match: /\/consistency/ },
    { label: "Impact Analysis", slug: "impact", Icon: Zap, match: /\/impact/ },
  ]},
  { title: "Knowledge", items: [
    { label: "Knowledge", slug: "knowledge", Icon: BookOpen, match: /\/knowledge/ },
  ]},
];

/** Collapsible project sidebar (§8): lifecycle groups, inbox badge, keyboard accessible. */
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname() || "";
  const { pid, project } = useShell();
  const [collapsed, setCollapsed] = useState(false);
  const base = `/projects/${pid}`;
  const { data: trace } = useTraceability(pid);
  const { data: issues } = useIssues(pid);
  const orphans = trace?.coverage?.orphans?.length || 0;
  const openIssues = issues?.filter((i: any) => i.status === "open").length || 0;
  // Triage = orphaned requirements + open consistency issues. These are distinct
  // sets (not duplicates): orphans need linking, issues need decisions.
  const inboxCount = orphans + openIssues;
  const inboxTitle = `Needs triage: ${orphans} orphaned, ${openIssues} open issues`;

  const renderItem = (it: Item) => {
    const active = it.match.test(path);
    const badge = it.label === "Inbox" ? inboxCount : it.badge;
    const Icon = it.Icon;
    return (
      <Link key={it.label} href={it.slug ? `${base}/${it.slug}` : base} onClick={onNavigate}
        aria-current={active ? "page" : undefined} title={collapsed ? it.label : undefined} prefetch
        className={cn("mt-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] font-medium transition-colors duration-120",
          collapsed && "justify-center px-0",
          active ? "bg-elevated text-primary shadow-[inset_2px_0_0_var(--color-accent)]" : "text-secondary hover:bg-elevated hover:text-primary")}>
        <Icon size={16} className={cn("flex-none", active && "text-accent")} aria-hidden />
        {!collapsed && it.label}
        {!collapsed && !!badge && (
          <span className="ml-auto rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-bold text-warning"
            title={it.label === "Inbox" ? inboxTitle : undefined}
            aria-label={it.label === "Inbox" ? inboxTitle : `${badge} items`}>{badge}</span>
        )}
      </Link>
    );
  };

  return (
    <aside aria-label="Project navigation"
      className={cn("sticky top-0 flex h-screen flex-col border-r border-border bg-surface transition-[width] duration-200", collapsed ? "w-[60px] px-2 py-4" : "w-[240px] px-3 py-4")}>
      <div className={cn("mb-2 flex items-center gap-2.5 px-1", collapsed && "justify-center px-0")}>
        <Image src="/logo.svg" alt="" width={32} height={32} className="h-8 w-8 flex-none rounded-[10px]" aria-hidden />
        {!collapsed && <span className="leading-tight"><b className="block text-[13.5px] tracking-tight">Blueprint <span className="text-accent">AI</span></b><small className="block text-[11px] text-secondary">Engineering Workspace</small></span>}
      </div>
      {!collapsed && project?.name && <p className="truncate px-2 text-[12px] text-muted" title={project.name}>{project.name}</p>}
      <nav className="scroll-thin mt-1 flex-1 overflow-y-auto" aria-label="Modules">
        {TOP.map(renderItem)}
        {SECTIONS.map((sec) => (
          <div key={sec.title} className="mt-3">
            {!collapsed && <p className="px-2.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted">{sec.title}</p>}
            {sec.items.map(renderItem)}
          </div>
        ))}
      </nav>
      <div className={cn("border-t border-border pt-2", collapsed && "flex flex-col items-center")}>
        <Link href={`${base}/settings`} title="Settings"
          className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] text-secondary hover:bg-elevated hover:text-primary", collapsed && "justify-center px-2")}>
          <SettingsIcon size={16} aria-hidden />{!collapsed && "Settings"}
        </Link>
        <Link href={`${base}/profile`} title="Profile"
          className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] text-secondary hover:bg-elevated hover:text-primary", collapsed && "justify-center px-2")}>
          <User size={16} aria-hidden />{!collapsed && "Profile"}
        </Link>
        <button onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg px-2 py-1.5 text-muted hover:bg-elevated hover:text-primary">
          {collapsed ? <ChevronsRight size={15} /> : <><ChevronsLeft size={15} /><span className="text-[12px]">Collapse</span></>}
        </button>
      </div>
    </aside>
  );
}
