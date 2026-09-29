"use client";
import { cn } from "../../lib/utils/cn";

// Monochrome-first statuses (Geist discipline): the pill is always neutral —
// ink text on a hairline border. Color survives only as the 6px status dot,
// so a screen full of badges reads calm and failures still pop.
const dot: Record<string, string> = {
  ok: "bg-success",
  warn: "bg-warning",
  bad: "bg-danger",
  info: "bg-info",
  neutral: "bg-muted",
};

function pick(value: string): string {
  const v = (value || "").toLowerCase();
  if (["approved", "passed", "done", "resolved", "success", "complete", "active", "linked", "covered", "jwt"].includes(v)) return "ok";
  if (["conflict", "rejected", "failed", "error", "blocked", "danger", "high"].includes(v)) return "bad";
  if (["warning", "draft", "todo", "open", "pending", "needs review", "medium", "orphan", "orphaned", "missing"].includes(v)) return "warn";
  return "info";
}

/** Plain badge: neutral pill + status dot, never color-only (§40). */
export function Badge({ value, tone: forced }: { value: string; tone?: keyof typeof dot }) {
  const d = dot[forced || pick(value)];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border border-border bg-elevated px-2.5 py-0.5 text-[11.5px] font-medium whitespace-nowrap text-secondary")}>
      <span className={cn("h-1.5 w-1.5 flex-none rounded-full", d)} aria-hidden />{value}
    </span>
  );
}

/** Status badge — same primitive, explicit intent for artifact states (§7). */
export function StatusBadge({ value }: { value: string }) {
  return <Badge value={value} />;
}
