"use client";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, ListChecks, FileText, MessagesSquare, Network, Database,
  Globe, ShieldCheck, KanbanSquare, FlaskConical, GitBranch, Scale, Zap, BookOpen,
  Settings as SettingsIcon, User, ChevronsLeft, ChevronsRight, Layers,
} from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/utils/cn";
import { useShell } from "./context";

type Item = { label: string; slug: string; Icon: any; match: RegExp };

const SECTIONS: { title: string; items: Item[] }[] = [
  { title: "Workspace", items: [
    { label: "Overview", slug: "", Icon: LayoutDashboard, match: /^\/projects\/[^/]+$/ },
    { label: "Blueprint", slug: "blueprint", Icon: Layers, match: /\/blueprint$/ },
  ]},
  { title: "Engineering", items: [
    { label: "Requirements", slug: "requirements", Icon: ListChecks, match: /\/requirements/ },
    { label: "Product Spec", slug: "prd", Icon: FileText, match: /\/prd/ },
    { label: "User Stories", slug: "stories", Icon: MessagesSquare, match: /\/stories/ },
    { label: "Architecture", slug: "architecture", Icon: Network, match: /\/architecture/ },
    { label: "Data Model", slug: "database", Icon: Database, match: /\/database/ },
    { label: "APIs", slug: "apis", Icon: Globe, match: /\/apis/ },
    { label: "Security", slug: "security", Icon: ShieldCheck, match: /\/security/ },
  ]},
  { title: "Delivery", items: [
    { label: "Tasks", slug: "tasks", Icon: KanbanSquare, match: /\/tasks/ },
    { label: "Tests", slug: "tests", Icon: FlaskConical, match: /\/tests/ },
  ]},
  { title: "Intelligence", items: [
    { label: "Traceability", slug: "traceability", Icon: GitBranch, match: /\/traceability/ },
    { label: "Consistency", slug: "consistency", Icon: Scale, match: /\/consistency/ },
    { label: "Impact Analysis", slug: "impact", Icon: Zap, match: /\/impact/ },
    { label: "Knowledge", slug: "knowledge", Icon: BookOpen, match: /\/knowledge/ },
  ]},
];

/** Collapsible project sidebar (§8): grouped, icon-led, keyboard accessible. */
export function Sidebar() {
  const path = usePathname() || "";
  const { pid, project } = useShell();
  const [collapsed, setCollapsed] = useState(false);
  const base = `/projects/${pid}`;

  return (
    <aside aria-label="Project navigation"
      className={cn("sticky top-0 flex h-screen flex-col border-r border-border bg-surface transition-[width] duration-200", collapsed ? "w-[60px] px-2 py-4" : "w-[240px] px-3 py-4")}>
      <div className={cn("mb-2 flex items-center gap-2.5 px-1", collapsed && "justify-center px-0")}>
        <span className="grid h-8 w-8 flex-none place-items-center rounded-[10px] bg-gradient-to-br from-accent via-info to-accent2 text-[15px] font-extrabold text-[#06201d]" aria-hidden>D</span>
        {!collapsed && <span className="leading-tight"><b className="block text-[13.5px] tracking-tight">DEVBLUEPRINT</b><small className="block text-[11px] text-secondary">Engineering Workspace</small></span>}
      </div>
      {!collapsed && project?.name && <p className="truncate px-2 text-[12px] text-muted" title={project.name}>{project.name}</p>}
      <nav className="mt-1 flex-1 overflow-y-auto" aria-label="Modules">
        {SECTIONS.map((sec) => (
          <div key={sec.title} className="mt-3">
            {!collapsed && <p className="px-2.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted">{sec.title}</p>}
            {sec.items.map((it) => {
              const active = it.match.test(path);
              return (
                <a key={it.label} href={it.slug ? `${base}/${it.slug}` : base}
                  aria-current={active ? "page" : undefined} title={collapsed ? it.label : undefined}
                  className={cn("mt-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] font-medium transition-colors duration-120",
                    collapsed && "justify-center px-0",
                    active ? "bg-elevated text-primary shadow-[inset_2px_0_0_var(--color-accent)]" : "text-secondary hover:bg-elevated hover:text-primary")}>
                  <it.Icon size={16} className={cn("flex-none", active && "text-accent")} aria-hidden />
                  {!collapsed && it.label}
                </a>
              );
            })}
          </div>
        ))}
      </nav>
      <div className={cn("border-t border-border pt-2", collapsed && "flex flex-col items-center")}>
        <a href={`${base}/settings`} title="Settings"
          className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] text-secondary hover:bg-elevated hover:text-primary", collapsed && "justify-center px-2")}>
          <SettingsIcon size={16} aria-hidden />{!collapsed && "Settings"}
        </a>
        <a href={`${base}/profile`} title="Profile"
          className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] text-secondary hover:bg-elevated hover:text-primary", collapsed && "justify-center px-2")}>
          <User size={16} aria-hidden />{!collapsed && "Profile"}
        </a>
        <button onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg px-2 py-1.5 text-muted hover:bg-elevated hover:text-primary">
          {collapsed ? <ChevronsRight size={15} /> : <><ChevronsLeft size={15} /><span className="text-[12px]">Collapse</span></>}
        </button>
      </div>
    </aside>
  );
}
