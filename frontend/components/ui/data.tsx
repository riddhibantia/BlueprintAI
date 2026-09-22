"use client";
import { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils/cn";

/** Breadcrumb trail (§7). */
export function Breadcrumb({ trail }: { trail: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1 text-[12.5px] text-secondary">
      {trail.map((t, i) => (
        <span key={t.label} className="flex items-center gap-1">
          {i > 0 && <ChevronRight size={12} className="text-muted" aria-hidden />}
          {t.href ? <a href={t.href} className="hover:text-primary hover:underline">{t.label}</a> : <span className="text-primary">{t.label}</span>}
        </span>
      ))}
    </nav>
  );
}

/** Tabs with keyboard arrow support (§40). */
export function Tabs({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (t: string) => void }) {
  return (
    <div role="tablist" aria-label="Sections" className="mb-4 flex gap-1 border-b border-border">
      {tabs.map((t) => (
        <button key={t} role="tab" aria-selected={t === active} onClick={() => onChange(t)}
          onKeyDown={(e) => {
            const i = tabs.indexOf(t);
            if (e.key === "ArrowRight") onChange(tabs[(i + 1) % tabs.length]);
            if (e.key === "ArrowLeft") onChange(tabs[(i - 1 + tabs.length) % tabs.length]);
          }}
          className={cn("border-b-2 px-3 py-2 text-[13px] font-medium transition-colors",
            t === active ? "border-accent text-primary" : "border-transparent text-secondary hover:text-primary")}>
          {t}
        </button>
      ))}
    </div>
  );
}

/** Dense engineering table wrapper (§17: ID, priority, status, coverage, links). */
export function DataTable({ head, children, label }: { head: ReactNode; children: ReactNode; label: string }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
      <table aria-label={label} className="w-full border-collapse text-[13px]">
        <thead><tr className="border-b border-border text-left text-[11.5px] uppercase tracking-[0.05em] text-secondary">{head}</tr></thead>
        <tbody className="[&_td]:border-b [&_td]:border-border [&_td]:px-3 [&_td]:py-2.5 [&_th]:px-3 [&_th]:py-2 [&_tr:last-child_td]:border-b-0 [&_tbody_tr:hover]:bg-elevated">{children}</tbody>
      </table>
    </div>
  );
}
