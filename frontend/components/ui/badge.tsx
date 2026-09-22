"use client";
import { AlertTriangle, CheckCircle2, Info, XCircle, MinusCircle } from "lucide-react";
import { cn } from "../../lib/utils/cn";

const tone: Record<string, { cls: string; Icon: any }> = {
  ok: { cls: "text-success border-success/40 bg-success/10", Icon: CheckCircle2 },
  warn: { cls: "text-warning border-warning/40 bg-warning/10", Icon: AlertTriangle },
  bad: { cls: "text-danger border-danger/40 bg-danger/10", Icon: XCircle },
  info: { cls: "text-info border-info/40 bg-info/10", Icon: Info },
  neutral: { cls: "text-secondary border-border bg-elevated", Icon: MinusCircle },
};

function pick(value: string): string {
  const v = (value || "").toLowerCase();
  if (["approved", "passed", "done", "resolved", "success", "complete", "active", "linked", "covered", "jwt"].includes(v)) return "ok";
  if (["conflict", "rejected", "failed", "error", "blocked", "danger", "high"].includes(v)) return "bad";
  if (["warning", "draft", "todo", "open", "pending", "needs review", "medium", "orphan", "orphaned", "missing"].includes(v)) return "warn";
  return "info";
}

/** Plain badge (icon + label, never color-only §40). */
export function Badge({ value, tone: forced }: { value: string; tone?: keyof typeof tone }) {
  const t = tone[forced || pick(value)];
  const Icon = t.Icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold whitespace-nowrap", t.cls)}>
      <Icon size={12} aria-hidden />{value}
    </span>
  );
}

/** Status badge — same primitive, explicit intent for artifact states (§7). */
export function StatusBadge({ value }: { value: string }) {
  return <Badge value={value} />;
}
