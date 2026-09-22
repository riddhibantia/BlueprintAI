"use client";
import { ReactNode } from "react";
import { AlertTriangle, Inbox } from "lucide-react";
import { cn } from "../../lib/utils/cn";
import { Button } from "./button";

/** Empty state: invitation to act, never a blank table (§35). */
export function EmptyState({ title, hint, action }: { title: string; hint: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-8 text-center">
      <Inbox size={22} className="mx-auto mb-2 text-muted" aria-hidden />
      <h3 className="text-[15px] font-semibold">{title}</h3>
      <p className="mt-1 text-[13px] text-secondary">{hint}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** Error state: what happened + what next, never a stack trace (§36). */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-danger/40 bg-danger/[0.07] p-4">
      <p className="flex items-center gap-2 text-[14px] font-semibold"><AlertTriangle size={15} aria-hidden />Something didn't work.</p>
      <p className="mt-1 text-[13px] text-secondary">{message}</p>
      {onRetry && <div className="mt-3"><Button variant="ghost" size="sm" onClick={onRetry}>Try again</Button></div>}
    </div>
  );
}

/** Loading state naming the running stage (§34). */
export function LoadingState({ stage }: { stage: string }) {
  return (
    <div role="status" aria-live="polite" className="rounded-2xl border border-border bg-surface px-6 py-8 text-center">
      <div className="mx-auto mb-2 h-6 w-6 animate-spin rounded-full border-[3px] border-border border-t-accent" aria-hidden />
      <p className="text-[13px] text-secondary">{stage}…</p>
    </div>
  );
}

/** Skeleton shimmer for loading regions (§41: subtle only). */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden
      className={cn("rounded-lg bg-elevated", className)}
      style={{ backgroundImage: "linear-gradient(90deg, transparent, rgba(139,146,158,0.12), transparent)", backgroundSize: "400px 100%", animation: "v2-shimmer 1.4s linear infinite" }} />
  );
}

/** Determinate progress (0–100, real values only). */
export function Progress({ pct, label }: { pct: number; label?: string }) {
  const v = Math.min(100, Math.max(0, pct));
  return (
    <div>
      <div className="h-2 overflow-hidden rounded-full bg-elevated" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label || `${v}%`}>
        <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}
