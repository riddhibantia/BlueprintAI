"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, Download, Menu, Moon, Play, Search, Sun } from "lucide-react";
import { useShell } from "./context";
import { timeAgo } from "../../lib/utils/time";
import { StatusBadge } from "../ui/badge";
import { Button, IconButton } from "../ui/button";
import { Dropdown } from "../ui/overlay";
import { apiDownload, me } from "../../lib/api/client";
import { checkConsistency } from "../../lib/api/endpoints";

type SessionUser = { name?: string; email?: string };

/** Project top bar (§9): name, status, updated time, palette, share, export, validation, avatar. */
export function TopBar({ onPalette, onMenu }: { onPalette: () => void; onMenu: () => void }) {
  const router = useRouter();
  const { pid, project, activity, reload } = useShell();
  const [copied, setCopied] = useState(false);
  const [validating, setValidating] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [light, setLight] = useState(false);
  useEffect(() => { setLight(document.documentElement.dataset.theme === "light"); }, []);
  // Load session user once (not on avatar hover) so the avatar initial is stable.
  useEffect(() => {
    let cancelled = false;
    me().then((u) => { if (!cancelled) setUser((u as SessionUser) || null); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const share = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const download = (kind: "markdown" | "pdf" | "openapi" | "json" | "archify") => {
    const ext = kind === "markdown" ? "md" : kind === "pdf" ? "pdf" : kind === "archify" ? "archify.json" : "json";
    const path = kind === "archify" ? "archify" : kind;
    apiDownload(`/projects/${pid}/export/${path}`, `blueprint-${String(pid).slice(0, 8)}.${ext}`, kind === "openapi" || kind === "json" || kind === "archify");
  };

  const validate = async () => {
    setValidating(true);
    try { await checkConsistency(pid); await reload(); router.push(`/projects/${pid}/consistency`); }
    finally { setValidating(false); }
  };

  const toggleTheme = () => {
    const el = document.documentElement;
    const next = el.dataset.theme === "light" ? "dark" : "light";
    el.dataset.theme = next;
    setLight(next === "light");
    try { localStorage.setItem("dbp-theme", next); } catch { /* private mode */ }
  };

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-canvas/90 backdrop-blur">
      <div className="flex items-center gap-3 px-5 py-2.5">
        <span className="lg:hidden">
          <IconButton label="Open navigation" onClick={onMenu}><Menu size={17} /></IconButton>
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-semibold tracking-tight">{project?.name || "Loading…"}</h1>
          <p className="flex items-center gap-2 text-[12px] text-secondary">
            {project?.metrics && <StatusBadge value={project.metrics.blueprint_status || "Draft"} />}
            {(activity[0]?.at || project?.updated_at) && (
              <span>Updated {timeAgo(activity[0]?.at || project?.updated_at)}</span>
            )}
          </p>
        </div>
        <div className="ml-auto flex flex-none items-center gap-1.5">
          <button onClick={onPalette} aria-label="Command palette (Ctrl+K)"
            className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[12.5px] text-secondary hover:border-accent hover:text-primary">
            <Search size={13} aria-hidden /><span className="hidden sm:inline">Search</span>
            <kbd className="hidden rounded bg-elevated px-1.5 font-mono text-[11px] md:inline">Ctrl K</kbd>
          </button>
          <span className="hidden lg:inline">
            <Button variant="ghost" size="sm" onClick={share}>
              {copied ? <><Check size={14} className="text-success" />Copied</> : <>Share</>}
            </Button>
          </span>
          <span className="hidden sm:inline">
            <Dropdown label={<span className="flex items-center gap-1.5"><Download size={14} /><span className="hidden xl:inline">Export</span></span>}
              items={[
                { label: "Markdown", onSelect: () => download("markdown") },
                { label: "PDF", onSelect: () => download("pdf") },
                { label: "OpenAPI JSON", onSelect: () => download("openapi") },
                { label: "Archify diagram IR", onSelect: () => download("archify") },
                { label: "Full JSON", onSelect: () => download("json") },
              ]} />
          </span>
          <Button size="sm" loading={validating} onClick={validate} className="max-md:px-3">
            <Play size={13} aria-hidden /><span className="hidden md:inline">Run Validation</span><span className="md:hidden">Validate</span>
          </Button>
          <IconButton label={light ? "Switch to dark theme" : "Switch to light theme"} onClick={toggleTheme}>
            {light ? <Moon size={16} /> : <Sun size={16} />}
          </IconButton>
          <Link href={`/projects/${pid}/profile`} aria-label="Profile"
            className="grid h-8 w-8 place-items-center rounded-full bg-elevated text-[12px] font-bold text-accent hover:ring-2 hover:ring-accent">
            {(user?.name || user?.email || "?").slice(0, 1).toUpperCase()}
          </Link>
        </div>
      </div>
    </header>
  );
}
