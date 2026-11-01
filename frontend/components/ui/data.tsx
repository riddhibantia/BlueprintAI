"use client";
import Link from "next/link";
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
          {t.href ? <Link href={t.href} prefetch className="hover:text-primary hover:underline">{t.label}</Link> : <span className="text-primary">{t.label}</span>}
        </span>
      ))}
    </nav>
  );
}

/** Dense engineering table wrapper (§17: ID, priority, status, coverage, links).
 *
 *  The header is sticky *within a bounded scroll box*, because the previous
 *  `overflow-x-auto` wrapper was a scroll container that never scrolled
 *  vertically — making `sticky top-0` a no-op while still clipping it.
 *  On small screens the wrapper keeps horizontal scroll (with a visible
 *  affordance) rather than compressing every column to unreadable widths. */
export function DataTable({ head, children, label, footer }: { head: ReactNode; children: ReactNode; label: string; footer?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/80 bg-surface shadow-[0_1px_3px_0_rgba(0,0,0,0.02)]">
      <div className="scroll-thin max-h-[min(70vh,720px)] overflow-auto rounded-2xl" tabIndex={0} role="region" aria-label={`${label} (scrollable)`}>
        <table aria-label={label} className="w-full min-w-[640px] border-collapse text-[13px]">
          <thead className="sticky top-0 z-10 bg-subtle shadow-[0_1px_0_0_var(--color-border)]">
            <tr className="border-b border-border text-left font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{head}</tr>
          </thead>
          <tbody className="divide-y divide-border/60 [&_td]:px-4 [&_td]:py-2.5 [&_th]:px-4 [&_th]:py-2.5 [&_tr]:transition-colors [&_tr:hover]:bg-elevated/60">{children}</tbody>
        </table>
      </div>
      {footer}
      {/* Below md, tell the user the table scrolls instead of letting it look cut off. */}
      <p className="border-t border-border px-4 py-1.5 text-[11.5px] text-muted md:hidden" aria-hidden>
        Scroll sideways to see all columns →
      </p>
    </div>
  );
}

/** Pagination control for engineering tables. */
export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  pageSize,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems?: number;
  pageSize?: number;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1 text-[12.5px] text-secondary">
      <div>
        {totalItems !== undefined && pageSize !== undefined && (
          <span>
            Showing {Math.min(totalItems, (currentPage - 1) * pageSize + 1)}–
            {Math.min(totalItems, currentPage * pageSize)} of {totalItems}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          aria-label="Previous page"
          className="min-h-9 rounded-lg border border-border bg-surface px-3 py-1.5 font-medium text-secondary transition-all hover:bg-elevated hover:text-primary active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
        >
          Previous
        </button>
        <span className="px-2 font-mono text-[12px] text-muted">
          {currentPage} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          aria-label="Next page"
          className="min-h-9 rounded-lg border border-border bg-surface px-3 py-1.5 font-medium text-secondary transition-all hover:bg-elevated hover:text-primary active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
        >
          Next
        </button>
      </div>
    </div>
  );
}

