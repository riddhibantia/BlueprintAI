"use client";
import { ReactNode } from "react";
import { cn } from "../../lib/utils/cn";

/** Surface card (§7). Hairline border, no shadow — elevation via lightness. */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-xl border border-border bg-surface p-4", className)}>
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
    <div className="rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-border-strong">
      <div className="text-[26px] font-semibold tabular-nums leading-none">{value}</div>
      <div className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted">{label}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted">{hint}</div>}
    </div>
  );
}
