"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Command,
  Database,
  FileText,
  Globe,
  ListChecks,
  MessagesSquare,
  Sparkles,
  Zap,
} from "lucide-react";
import { useShell } from "./context";
import { apiDownload } from "../../lib/api/client";
import { checkConsistency, genStories } from "../../lib/api/endpoints";
import { useFocusTrap } from "../ui/overlay";
import {
  useRequirements,
  useApis,
  useDatabase,
  useStories,
} from "../../lib/query/useArtifacts";

interface PaletteItem {
  id: string;
  category: "Commands" | "Requirements" | "APIs" | "Data Model" | "User Stories";
  label: string;
  hint: string;
  icon: typeof Command;
  run: () => void | Promise<void>;
}

/** Command palette & Omnibar: Ctrl/⌘K, keyboard-operable, deep-searches all project artifacts. */
export function Palette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { pid, reload, setCopilotOpen } = useShell();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const base = `/projects/${pid}`;

  const reqsQ = useRequirements(pid);
  const apisQ = useApis(pid);
  const dbQ = useDatabase(pid);
  const storiesQ = useStories(pid);

  const trapRef = useFocusTrap(open, onClose, inputRef);

  const staticCmds: PaletteItem[] = useMemo(() => [
    { id: "cmd-reqs", category: "Commands", label: "Open Requirements workspace", hint: "Plan", icon: ListChecks, run: () => router.push(`${base}/requirements`) },
    { id: "cmd-prd", category: "Commands", label: "Open Product Spec (PRD)", hint: "Plan", icon: FileText, run: () => router.push(`${base}/prd`) },
    { id: "cmd-arch", category: "Commands", label: "Open Architecture Canvas", hint: "Design", icon: Zap, run: () => router.push(`${base}/architecture`) },
    { id: "cmd-db", category: "Commands", label: "Open Data Model workspace", hint: "Design", icon: Database, run: () => router.push(`${base}/database`) },
    { id: "cmd-apis", category: "Commands", label: "Open APIs Explorer", hint: "Design", icon: Globe, run: () => router.push(`${base}/apis`) },
    { id: "cmd-stories", category: "Commands", label: "Open User Stories", hint: "Plan", icon: MessagesSquare, run: () => router.push(`${base}/stories`) },
    { id: "cmd-validate", category: "Commands", label: "Run consistency check", hint: "Validate", icon: Zap, run: async () => { setBusy("Validating…"); await checkConsistency(pid); await reload(); router.push(`${base}/consistency`); } },
    { id: "cmd-trace", category: "Commands", label: "Run traceability validation", hint: "Assure", icon: Zap, run: () => router.push(`${base}/traceability`) },
    { id: "cmd-gen-stories", category: "Commands", label: "Generate user stories", hint: "AI Agent", icon: Sparkles, run: async () => { setBusy("Generating stories…"); await genStories(pid); await reload(); router.push(`${base}/stories`); } },
    { id: "cmd-copilot", category: "Commands", label: "Open Blueprint Copilot", hint: "AI Assistant", icon: Sparkles, run: () => setCopilotOpen(true) },
    { id: "cmd-exp-md", category: "Commands", label: "Export blueprint (Markdown)", hint: "Download .md", icon: FileText, run: () => apiDownload(`/projects/${pid}/export/markdown`, `blueprint-${pid.slice(0, 8)}.md`, false) },
    { id: "cmd-exp-postman", category: "Commands", label: "Export Postman Collection v2.1", hint: "Download JSON", icon: Globe, run: () => apiDownload(`/projects/${pid}/export/postman`, `postman-collection-${pid.slice(0, 8)}.json`, true) },
    { id: "cmd-exp-openapi", category: "Commands", label: "Export OpenAPI 3.0 specification", hint: "Download JSON", icon: Globe, run: () => apiDownload(`/projects/${pid}/export/openapi`, `openapi-${pid.slice(0, 8)}.json`, true) },
    { id: "cmd-exp-sql", category: "Commands", label: "Export PostgreSQL Schema DDL", hint: "Download SQL", icon: Database, run: () => apiDownload(`/projects/${pid}/export/schema?target=postgres`, `schema-${pid.slice(0, 8)}.sql`, false) },
  ], [base, pid, reload, router, setCopilotOpen]);

  // Dynamic entity items from loaded project corpus
  const entityItems: PaletteItem[] = useMemo(() => {
    const list: PaletteItem[] = [];

    // Requirements
    (reqsQ.data || []).forEach((r: any) => {
      list.push({
        id: `req-${r.code}`,
        category: "Requirements",
        label: `${r.code} · ${r.title}`,
        hint: `${r.priority || "medium"} priority`,
        icon: ListChecks,
        run: () => router.push(`${base}/requirements?sel=${encodeURIComponent(r.code)}`),
      });
    });

    // APIs
    (apisQ.data || []).forEach((a: any) => {
      list.push({
        id: `api-${a.code || a.path}`,
        category: "APIs",
        label: `${(a.method || "GET").toUpperCase()} ${a.path}`,
        hint: a.code || "Endpoint",
        icon: Globe,
        run: () => router.push(`${base}/apis?sel=${encodeURIComponent(a.code)}`),
      });
    });

    // Database Tables
    (dbQ.data?.entities || []).forEach((e: any) => {
      list.push({
        id: `db-${e.name}`,
        category: "Data Model",
        label: `Table: ${e.name}`,
        hint: `${(e.fields || []).length} columns`,
        icon: Database,
        run: () => router.push(`${base}/database?sel=${encodeURIComponent(e.name)}`),
      });
    });

    // User Stories
    (storiesQ.data || []).forEach((s: any) => {
      list.push({
        id: `story-${s.code}`,
        category: "User Stories",
        label: `${s.code} · ${s.story}`,
        hint: "User Story",
        icon: MessagesSquare,
        run: () => router.push(`${base}/stories?q=${encodeURIComponent(s.code)}`),
      });
    });

    return list;
  }, [reqsQ.data, apisQ.data, dbQ.data, storiesQ.data, base, router]);

  const allItems = useMemo(() => [...staticCmds, ...entityItems], [staticCmds, entityItems]);

  const filtered = useMemo(() => {
    if (!q.trim()) return staticCmds;
    const query = q.toLowerCase();
    return allItems.filter(
      (c) =>
        c.label.toLowerCase().includes(query) ||
        c.hint.toLowerCase().includes(query) ||
        c.category.toLowerCase().includes(query)
    ).slice(0, 30);
  }, [allItems, staticCmds, q]);

  useEffect(() => {
    if (open) {
      setQ("");
      setIdx(0);
      setBusy("");
      setErr("");
    }
  }, [open]);

  useEffect(() => {
    setIdx(0);
  }, [q]);

  if (!open) return null;

  const run = async (i: number) => {
    const c = filtered[i];
    if (!c) return;
    setErr("");
    try {
      await c.run();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Command failed.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div
      ref={trapRef}
      className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xs" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-[620px] overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3.5">
          <Command size={16} className="text-muted" aria-hidden />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            role="combobox"
            aria-expanded
            aria-controls="palette-listbox"
            aria-autocomplete="list"
            aria-activedescendant={filtered.length ? `palette-opt-${idx}` : undefined}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIdx((idx + 1) % Math.max(1, filtered.length));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setIdx((idx - 1 + filtered.length) % Math.max(1, filtered.length));
              }
              if (e.key === "Enter") run(idx);
              if (e.key === "Escape") onClose();
            }}
            placeholder="Search requirements, APIs, tables, or run a command…"
            aria-label="Command search"
            className="w-full bg-transparent text-[14px] outline-none placeholder:text-muted"
          />
          <kbd className="rounded bg-elevated px-2 py-0.5 font-mono text-[11px] text-secondary">
            esc
          </kbd>
        </div>

        {busy && (
          <div className="border-b border-border bg-elevated/50 px-4 py-2 text-[12.5px] text-primary">
            {busy}
          </div>
        )}
        {err && (
          <div className="border-b border-danger/30 bg-danger/10 px-4 py-2 text-[12.5px] text-danger">
            {err}
          </div>
        )}

        <ul
          id="palette-listbox"
          role="listbox"
          aria-label="Commands"
          className="scroll-thin max-h-[380px] overflow-y-auto p-2 space-y-0.5"
        >
          {filtered.map((c, i) => {
            const Icon = c.icon;
            const isSelected = i === idx;
            return (
              <li
                key={c.id}
                id={`palette-opt-${i}`}
                role="option"
                aria-selected={isSelected}
                onClick={() => run(i)}
                onMouseEnter={() => setIdx(i)}
                className={`flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-[13px] transition-colors ${
                  isSelected ? "bg-elevated font-medium text-primary shadow-xs" : "text-secondary hover:bg-subtle"
                }`}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={`grid h-7 w-7 flex-none place-items-center rounded-lg border text-muted ${
                      isSelected
                        ? "border-border bg-surface text-primary"
                        : "border-border/50 bg-surface/50"
                    }`}
                  >
                    <Icon size={14} />
                  </span>
                  <span className="truncate">{c.label}</span>
                </div>
                <div className="flex flex-none items-center gap-2">
                  <span className="text-[11px] font-mono text-muted">{c.hint}</span>
                  <span className="rounded bg-canvas px-1.5 py-0.5 text-[10px] uppercase font-semibold tracking-wider text-muted-soft">
                    {c.category}
                  </span>
                </div>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li role="presentation" className="px-4 py-8 text-center text-[13px] text-secondary">
              No matching commands, requirements, APIs, or tables found.
            </li>
          )}
        </ul>

        <div className="flex items-center justify-between border-t border-border bg-subtle/40 px-4 py-2 text-[11.5px] text-muted">
          <span>Navigate with <kbd className="font-mono">↑</kbd> <kbd className="font-mono">↓</kbd></span>
          <span>Select with <kbd className="font-mono">Enter</kbd></span>
        </div>
      </div>
    </div>
  );
}
