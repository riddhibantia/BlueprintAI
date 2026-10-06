"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, ChevronRight, Menu, MessageSquarePlus, MoreHorizontal, Search } from "lucide-react";
import { useShell } from "./context";
import { Button, IconButton } from "../ui/button";
import { Dropdown } from "../ui/overlay";
import { apiDownload, logout, me } from "../../lib/api/client";
import { checkConsistency } from "../../lib/api/endpoints";

type SessionUser = { name?: string; email?: string };

const NAMES: Record<string, string> = {
  requirements: "Requirements", prd: "Product Spec", stories: "User Stories", architecture: "Architecture",
  database: "Data Model", apis: "APIs", security: "Security", tasks: "Tasks", tests: "Tests",
  traceability: "Traceability", consistency: "Consistency", impact: "Impact Analysis", knowledge: "Knowledge",
  settings: "Settings", blueprint: "Blueprint",
};

/** Project top bar: breadcrumb · search · Share · overflow · avatar. */
export function TopBar({ onPalette, onMenu }: { onPalette: () => void; onMenu: () => void }) {
  const router = useRouter();
  const path = usePathname() || "";
  const { pid, project, reload, setCopilotOpen } = useShell();
  const [copied, setCopied] = useState(false);
  const [validating, setValidating] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  useEffect(() => {
    let cancelled = false;
    me().then((u) => { if (!cancelled) setUser((u as SessionUser) || null); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const seg = path.split("/").pop() || "";
  const here = seg === pid ? "Overview" : NAMES[seg] || "Overview";

  const share = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const download = (kind: "markdown" | "pdf" | "openapi" | "json" | "archify") => {
    const ext = kind === "markdown" ? "md" : kind === "pdf" ? "pdf" : kind === "archify" ? "archify.json" : "json";
    const ep = kind === "archify" ? "archify" : kind;
    apiDownload(`/projects/${pid}/export/${ep}`, `blueprint-${String(pid).slice(0, 8)}.${ext}`, kind === "openapi" || kind === "json" || kind === "archify");
  };

  const validate = async () => {
    setValidating(true);
    try { await checkConsistency(pid); await reload(); router.push(`/projects/${pid}/consistency`); }
    finally { setValidating(false); }
  };

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-canvas/90 backdrop-blur">
      <div className="flex min-h-16 items-center gap-2 px-5 py-2">
        <span className="lg:hidden">
          <IconButton label="Open navigation" onClick={onMenu}><Menu size={17} /></IconButton>
        </span>
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-[13px]">
          <Link href={`/projects/${pid}`} prefetch className="truncate font-medium text-secondary hover:text-primary">
            {project?.name || "Project"}
          </Link>
          <ChevronRight size={13} className="flex-none text-muted" aria-hidden />
          <span className="truncate text-primary" aria-current="page">{here}</span>
        </nav>
        <div className="mx-auto hidden md:block">
          <button onClick={onPalette} aria-label="Command palette (Ctrl+K)"
            className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1.5 text-[13px] text-secondary transition-colors duration-150 hover:border-border-strong hover:text-primary">
            <Search size={13} aria-hidden /><span className="text-muted">Search or run a command…</span>
            <kbd className="rounded-full bg-elevated px-2 py-0.5 font-mono text-[11px] text-muted">Ctrl K</kbd>
          </button>
        </div>
        <div className="ml-auto flex flex-none items-center gap-1.5 md:ml-0">
          <IconButton label="Ask Copilot (Ctrl+J)" onClick={() => setCopilotOpen(true)}>
            <MessageSquarePlus size={17} />
          </IconButton>
          <Button variant="ghost" size="sm" onClick={share}>
            {copied ? <><Check size={14} className="text-success" />Copied</> : <>Share</>}
          </Button>
          <Dropdown label={<MoreHorizontal size={16} />} items={[
            { label: validating ? "Validating…" : "Run validation", onSelect: validate },
            { label: "Export Markdown", onSelect: () => download("markdown") },
            { label: "Export PDF", onSelect: () => download("pdf") },
            { label: "Export OpenAPI JSON", onSelect: () => download("openapi") },
            { label: "Export Archify IR", onSelect: () => download("archify") },
            { label: "Settings", onSelect: () => router.push(`/projects/${pid}/settings`) },
          ]} />
          <Dropdown label={
            <span aria-label="Account" className="grid h-8 w-8 place-items-center rounded-full bg-elevated text-[12px] font-semibold text-secondary">
              {(user?.name || user?.email || "?").slice(0, 1).toUpperCase()}
            </span>
          } items={[
            { label: `Settings`, onSelect: () => router.push(`/projects/${pid}/settings`) },
            { label: "Log out", onSelect: () => logout() },
          ]} />
        </div>
      </div>
    </header>
  );
}
