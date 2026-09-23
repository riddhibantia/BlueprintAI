"use client";
import { useState } from "react";

/** Slash picker (Notion-style): type `/` to filter artifact codes, Enter/click to pick. */
export function SlashInput({ value, onChange, items, placeholder, label }: {
  value: string; onChange: (v: string) => void; items: string[]; placeholder?: string; label: string;
}) {
  const [open, setOpen] = useState(false);
  const query = value.startsWith("/") ? value.slice(1).toLowerCase() : null;
  const matches = query === null ? [] : items.filter((c) => c.toLowerCase().includes(query)).slice(0, 8);

  return (
    <span className="relative inline-block">
      <input value={value} placeholder={placeholder} aria-label={label}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && open && matches.length > 0) { onChange(matches[0]); setOpen(false); }
          if (e.key === "Escape") setOpen(false);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className="w-56 rounded-xl border border-border bg-canvas px-3 py-2 font-mono text-[13px]" />
      {open && matches.length > 0 && (
        <span className="absolute left-0 top-full z-30 mt-1 block w-56 overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
          {matches.map((m) => (
            <button key={m} onMouseDown={() => { onChange(m); setOpen(false); }}
              className="block w-full px-3 py-1.5 text-left font-mono text-[12.5px] hover:bg-elevated">
              /{m}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

/** Render `[ABC-123]`-style codes in Copilot text as citation chips (NotebookLM-style). */
export function CitedText({ text, base }: { text: string; base: string }) {
  const parts = text.split(/([A-Z]{2,4}-\d{3})/g);
  return (
    <span>
      {parts.map((p, i) =>
        /^[A-Z]{2,4}-\d{3}$/.test(p)
          ? <a key={i} href={`${base}/traceability`} title={`Open ${p} in Traceability`}
              className="mx-0.5 inline-block rounded-full border border-accent/50 bg-accent/10 px-1.5 font-mono text-[11.5px] text-accent hover:underline">{p}</a>
          : <span key={i}>{p}</span>
      )}
    </span>
  );
}
