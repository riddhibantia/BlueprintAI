"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, ChevronRight, HelpCircle, Menu, MessageSquarePlus, MoreHorizontal, Search, Share2, Download } from "lucide-react";
import { useShell } from "./context";
import { Button, IconButton } from "../ui/button";
import { ThemeToggle } from "../ui/theme-toggle";
import { Dropdown } from "../ui/overlay";
import { apiDownload, logout, me } from "../../lib/api/client";
import { checkConsistency } from "../../lib/api/endpoints";
import { copyText } from "../../lib/clipboard";
import { useToast } from "../ui/toast";
import { ExportModal } from "./export-modal";

type SessionUser = { name?: string; email?: string };

const NAMES: Record<string, string> = {
  requirements: "Requirements", prd: "Product Spec", stories: "User Stories", architecture: "Architecture",
  database: "Data Model", apis: "APIs", security: "Security", tasks: "Tasks", tests: "Tests",
  traceability: "Traceability", consistency: "Consistency", impact: "Impact Analysis", knowledge: "Knowledge",
  settings: "Settings", blueprint: "Blueprint",
};

const SECTION_CATS: Record<string, string> = {
  requirements: "Plan", prd: "Plan", stories: "Plan",
  architecture: "Design", database: "Design", apis: "Design", security: "Design",
  tasks: "Delivery", tests: "Delivery",
  traceability: "Assure", consistency: "Assure", impact: "Assure",
  knowledge: "Reference", settings: "Project", blueprint: "Pipeline",
};

/** Project top bar: breadcrumb · search · Share · overflow · avatar. */
export function TopBar({
  onPalette,
  onMenu,
  onShortcuts,
}: {
  onPalette: () => void;
  onMenu: () => void;
  onShortcuts?: () => void;
}) {
  const router = useRouter();
  const path = usePathname() || "";
  const { pid, project, reload, setCopilotOpen } = useShell();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [validating, setValidating] = useState(false);
  const [actionError, setActionError] = useState("");
  const [user, setUser] = useState<SessionUser | null>(null);
  useEffect(() => {
    let cancelled = false;
    me().then((u) => { if (!cancelled) setUser((u as SessionUser) || null); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const seg = path.split("/").pop() || "";
  const here = seg === pid ? "Overview" : NAMES[seg] || "Overview";

  const share = async () => {
    if (!(await copyText(window.location.href))) {
      toast.error("Couldn't copy the link — your browser blocked clipboard access.");
      setActionError("Could not copy the link — copy it from the address bar.");
      return;
    }
    setCopied(true);
    toast.success("Link copied to clipboard!");
    setTimeout(() => setCopied(false), 1500);
  };

  const download = (kind: "markdown" | "pdf" | "openapi" | "json" | "archify") => {
    const ext = kind === "markdown" ? "md" : kind === "pdf" ? "pdf" : kind === "archify" ? "archify.json" : "json";
    const ep = kind === "archify" ? "archify" : kind;
    apiDownload(`/projects/${pid}/export/${ep}`, `blueprint-${String(pid).slice(0, 8)}.${ext}`, kind === "openapi" || kind === "json" || kind === "archify");
  };

  const validate = async () => {
    setValidating(true);
    setActionError("");
    try {
      await checkConsistency(pid);
      await reload();
      router.push(`/projects/${pid}/consistency`);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Validation failed — try again.");
    } finally {
      setValidating(false);
    }
  };

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-canvas/80 backdrop-blur-md">
      <div className="flex min-h-16 items-center gap-2 px-5 py-2">
        <span className="lg:hidden">
          <IconButton label="Open navigation" onClick={onMenu}><Menu size={17} /></IconButton>
        </span>
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px]">
          <Link href="/dashboard" prefetch className="truncate rounded-md px-2 py-1 font-medium text-muted transition-colors hover:bg-elevated hover:text-primary">
            Projects
          </Link>
          <ChevronRight size={13} className="flex-none text-muted" aria-hidden />
          <Link href={`/projects/${pid}`} prefetch className="max-w-[180px] truncate rounded-md px-2 py-1 font-medium text-secondary transition-colors hover:bg-elevated hover:text-primary">
            {project?.name || "Project"}
          </Link>
          {here !== "Overview" && (
            <>
              <ChevronRight size={13} className="flex-none text-muted" aria-hidden />
              {SECTION_CATS[seg] && (
                <>
                  <span className="hidden sm:inline text-muted font-normal">{SECTION_CATS[seg]}</span>
                  <ChevronRight size={13} className="hidden sm:inline flex-none text-muted" aria-hidden />
                </>
              )}
              <span className="truncate rounded-md bg-elevated/70 px-2 py-0.5 font-medium text-primary border border-border/60" aria-current="page">{here}</span>
            </>
          )}
        </nav>
        <div className="mx-auto hidden md:block">
          <button onClick={onPalette} aria-label="Command palette (Ctrl+K)"
            className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1.5 text-[13px] text-secondary transition-colors duration-150 hover:border-border-strong hover:text-primary">
            <Search size={13} aria-hidden /><span className="text-muted">Search or run a command…</span>
            <kbd className="rounded-full bg-elevated px-2 py-0.5 font-mono text-[11px] text-muted">Ctrl K</kbd>
          </button>
        </div>
        <div className="ml-auto flex flex-none items-center gap-1.5 md:ml-0">
          <ThemeToggle />
          {onShortcuts && (
            <IconButton label="Keyboard shortcuts (?)" onClick={onShortcuts}>
              <HelpCircle size={17} />
            </IconButton>
          )}
          <IconButton label="Ask Copilot (Ctrl+J)" onClick={() => setCopilotOpen(true)}>
            <MessageSquarePlus size={17} />
          </IconButton>
          <Button variant="subtle" size="sm" onClick={() => setExportOpen(true)} aria-label="Export architecture blueprint">
            <Download size={13} />
            <span>Export</span>
          </Button>
          {/* A stable accessible name: the visible text flips to "Copied",
              which would otherwise silently rename the control mid-interaction. */}
          <Button variant="ghost" size="sm" onClick={share} aria-label="Copy project link">
            <span aria-hidden>{copied ? <><Check size={14} className="text-success" />Copied</> : <>Share</>}</span>
          </Button>
          <Dropdown labelText="More actions" label={<MoreHorizontal size={16} />} items={[
            { label: "Export Hub (All Formats)", onSelect: () => setExportOpen(true) },
            { label: validating ? "Validating…" : "Run validation", onSelect: validate },
            { label: "Export Markdown", onSelect: () => download("markdown") },
            { label: "Export PDF", onSelect: () => download("pdf") },
            { label: "Export OpenAPI JSON", onSelect: () => download("openapi") },
            { label: "Export Archify IR", onSelect: () => download("archify") },
            { label: "Settings", onSelect: () => router.push(`/projects/${pid}/settings`) },
          ]} />
          <Dropdown labelText="Account menu" label={
            <span aria-hidden className="grid h-8 w-8 place-items-center rounded-full bg-elevated text-[12px] font-semibold text-secondary">
              {(user?.name || user?.email || "?").slice(0, 1).toUpperCase()}
            </span>
          } items={[
            { label: "All Projects", onSelect: () => router.push("/dashboard") },
            { label: `Settings`, onSelect: () => router.push(`/projects/${pid}/settings`) },
            { label: "Log out", onSelect: () => logout() },
          ]} />
        </div>
      </div>
      {actionError && <p role="alert" className="border-t border-danger/40 bg-danger/5 px-5 py-1.5 text-[12.5px] text-danger">{actionError}</p>}
      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} pid={pid} projectName={project?.name} />
    </header>
  );
}
