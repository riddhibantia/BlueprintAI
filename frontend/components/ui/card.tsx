"use client";
import { ReactNode } from "react";
import { cn } from "../../lib/utils/cn";

/** Surface card (§7). */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-surface p-4 shadow-[0_1px_2px_rgba(0,0,0,0.3)]", className)}>
      {children}
    </div>
  );
}

/** Elevated panel for side regions and drawers' sections. */
export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-elevated p-4", className)}>
      {children}
    </div>
  );
}

/** Single health metric (§13). Value must come from a real endpoint. */
export function Metric({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="text-[24px] font-bold tracking-tight tabular-nums">{value}</div>
      <div className="text-[12px] font-semibold text-secondary">{label}</div>
      {hint && <div className="text-[11px] text-muted">{hint}</div>}
    </div>
  );
}
