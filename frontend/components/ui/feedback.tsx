"use client";
import { ReactNode, useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "../../lib/utils/cn";
import { Button } from "./button";

/** Empty state: icon, heading, hint, and primary action (§35). */
export function EmptyState({
  title,
  hint,
  icon,
  action,
}: {
  title: string;
  hint: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-strong bg-surface/40 px-6 py-9 text-center">
      {icon && (
        <div className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-elevated text-secondary shadow-xs">
          {icon}
        </div>
      )}
      <h3 className="text-[15px] font-semibold text-primary">{title}</h3>
      <p className="mx-auto mt-1 max-w-[48ch] text-[13px] leading-relaxed text-secondary">{hint}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Error state: what happened + what next, never a stack trace (§36). */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-danger/40 bg-danger/[0.07] p-4">
      <p className="flex items-center gap-2 text-[14px] font-semibold text-danger"><AlertTriangle size={15} aria-hidden />Something didn't work.</p>
      <p className="mt-1 text-[13px] text-secondary">{message}</p>
      {onRetry && <div className="mt-3"><Button variant="ghost" size="sm" onClick={onRetry}>Try again</Button></div>}
    </div>
  );
}

/** Loading state naming the running stage (§34).
 *
 *  Delays appearing by ~180ms: most of these stages finish near-instantly, and
 *  a spinner that flashes for 40ms reads as jank rather than progress. The
 *  region is announced either way, so a fast load is never silent. */
export function LoadingState({ stage, delayMs = 180 }: { stage: string; delayMs?: number }) {
  const [show, setShow] = useState(delayMs === 0);
  useEffect(() => {
    if (delayMs === 0) return;
    const t = setTimeout(() => setShow(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);
  return (
    <div role="status" aria-live="polite" className="rounded-2xl border border-border bg-surface px-6 py-8 text-center shadow-xs">
      {show ? (
        <>
          <div className="mx-auto mb-2.5 h-6 w-6 animate-spin rounded-full border-[2.5px] border-border border-t-accent" aria-hidden />
          <p className="font-mono text-[12.5px] text-secondary">{stage}…</p>
        </>
      ) : (
        // Reserve the same height so the region doesn't jump when the spinner lands.
        <p className="sr-only">{stage}…</p>
      )}
    </div>
  );
}

/**
 * Field-level error. Renders below its input and is referenced by the input's
 * `aria-describedby`, so a screen reader announces the specific problem instead
 * of a single unexplained banner.
 */
export function FieldError({ id, children }: { id: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-1 flex items-start gap-1.5 text-[12.5px] font-medium text-danger">
      <AlertTriangle size={13} className="mt-0.5 flex-none" aria-hidden />
      {children}
    </p>
  );
}

/**
 * Focusable error summary for a form with multiple problems (WCAG 3.3.1).
 * Focus it after a failed submit — it links to each invalid field while the
 * inline messages stay in place.
 */
export function ErrorSummary({ id = "error-summary", title = "There is a problem", errors }: { id?: string; title?: string; errors: { fieldId: string; message: string }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  if (errors.length === 0) return null;
  return (
    <div ref={ref} id={id} tabIndex={-1} role="alert"
      className="mb-3 rounded-xl border border-danger/40 bg-danger/[0.07] p-3 outline-none">
      <h2 className="text-[13.5px] font-semibold text-danger">{title}</h2>
      <ul className="mt-1.5 space-y-1">
        {errors.map((e) => (
          <li key={e.fieldId}>
            <a href={`#${e.fieldId}`} className="text-[13px] text-danger underline underline-offset-2 hover:no-underline"
              onClick={(ev) => { ev.preventDefault(); document.getElementById(e.fieldId)?.focus(); }}>
              {e.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Skeleton shimmer for loading regions (§41: subtle only).
 *  Internal building block for TableSkeleton/CardSkeleton — not exported,
 *  because a bare shimmer block at a call site is almost always the wrong
 *  shape for the content that is about to replace it. */
function Skeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden
      className={cn("rounded-lg bg-elevated", className)}
      style={{ backgroundImage: "linear-gradient(90deg, transparent, rgba(139,146,158,0.12), transparent)", backgroundSize: "400px 100%", animation: "v2-shimmer 1.4s linear infinite" }} />
  );
}

/** Skeleton for data tables */
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
      <div className="flex items-center gap-4 border-b border-border bg-subtle px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      <div className="divide-y divide-border/60">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 px-4 py-3.5">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className={cn("h-4", c === 0 ? "w-16" : c === 1 ? "w-12" : "flex-1")} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Skeleton for card grids */
export function CardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-[0_1px_2px_0_rgba(0,0,0,0.03)]">
      <div className="flex items-center justify-between gap-2 border-b border-border pb-2.5">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="mt-3 space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}

/** Determinate progress (0–100, real values only).
 *  `label` names what is being measured — a bare percentage announces "62%"
 *  with no subject, which is useless to a screen reader. */
export function Progress({ pct, label }: { pct: number; label?: string }) {
  const v = Math.min(100, Math.max(0, pct));
  const name = label || "Progress";
  return (
    <div>
      <div className="h-2 overflow-hidden rounded-full bg-elevated" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={name} aria-valuetext={`${name}: ${v}%`}>
        <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}
