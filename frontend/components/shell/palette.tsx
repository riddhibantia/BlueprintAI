"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "lucide-react";
import { useShell } from "./context";
import { apiDownload } from "../../lib/api/client";
import { checkConsistency, genStories } from "../../lib/api/endpoints";

/** Command palette (§10): Ctrl/⌘K, fully keyboard-operable. */
export function Palette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { pid, reload, setCopilotOpen } = useShell();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const base = `/projects/${pid}`;

  const cmds = useMemo(() => [
    { label: "Search requirements", hint: "Go to Requirements", run: () => router.push(`${base}/requirements`) },
    { label: "Open PRD", hint: "Product Spec", run: () => router.push(`${base}/prd`) },
    { label: "Open architecture", hint: "Canvas", run: () => router.push(`${base}/architecture`) },
    { label: "Open database", hint: "Data Model", run: () => router.push(`${base}/database`) },
    { label: "Open APIs", hint: "Explorer", run: () => router.push(`${base}/apis`) },
    { label: "Open security", hint: "Controls", run: () => router.push(`${base}/security`) },
    { label: "Run consistency check", hint: "Validate", run: async () => { setBusy("Validating…"); await checkConsistency(pid); await reload(); router.push(`${base}/consistency`); } },
    { label: "Run traceability validation", hint: "Coverage + orphans", run: () => router.push(`${base}/traceability`) },
    { label: "Generate user stories", hint: "From requirements", run: async () => { setBusy("Generating stories…"); await genStories(pid); await reload(); router.push(`${base}/stories`); } },
    { label: "Open knowledge", hint: "RAG base", run: () => router.push(`${base}/knowledge`) },
    { label: "Open Blueprint Copilot", hint: "Contextual help", run: () => setCopilotOpen(true) },
    { label: "Export blueprint (Markdown)", hint: "Download", run: () => apiDownload(`/projects/${pid}/export/markdown`, `blueprint-${pid.slice(0, 8)}.md`, false) },
    { label: "Settings", hint: "System status", run: () => router.push(`${base}/settings`) },
  ], [base, pid, reload, router, setCopilotOpen]);

  const filtered = cmds.filter((c) => (c.label + c.hint).toLowerCase().includes(q.toLowerCase()));

  useEffect(() => {
    if (open) { setQ(""); setIdx(0); setBusy(""); setTimeout(() => inputRef.current?.focus(), 30); }
  }, [open ]);

  useEffect(() => { setIdx(0); }, [q]);
  if (!open) return null;

  const run = async (i: number) => {
    const c = filtered[i];
    if (!c) return;
    onClose();
    await c.run();
    setBusy("");
  };

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <div className="relative mx-auto mt-[12vh] w-full max-w-[560px] overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Command size={15} className="text-muted" aria-hidden />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setIdx((idx + 1) % Math.max(1, filtered.length)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setIdx((idx - 1 + filtered.length) % Math.max(1, filtered.length)); }
              if (e.key === "Enter") run(idx);
              if (e.key === "Escape") onClose();
            }}
            placeholder={busy || "Type a command…"} aria-label="Command search"
            className="w-full bg-transparent text-[14px] outline-none placeholder:text-muted" />
          <kbd className="rounded bg-elevated px-1.5 font-mono text-[11px] text-secondary">esc</kbd>
        </div>
        <ul role="listbox" aria-label="Commands" className="max-h-[320px] overflow-auto p-1.5">
          {filtered.map((c, i) => (
            <li key={c.label}>
              <button role="option" aria-selected={i === idx} onClick={() => run(i)} onMouseEnter={() => setIdx(i)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13.5px] ${i === idx ? "bg-elevated text-primary" : "text-secondary"}`}>
                <span>{c.label}</span><span className="text-[12px] text-muted">{c.hint}</span>
              </button>
            </li>
          ))}
          {filtered.length === 0 && <li className="px-3 py-4 text-center text-[13px] text-secondary">No matching command.</li>}
        </ul>
      </div>
    </div>
  );
}
