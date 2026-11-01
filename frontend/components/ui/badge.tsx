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

/** Status tag: hairline bordered pill, ink text, micro status indicator. */
export function Badge({
  value,
  tone: forced,
  pulse,
}: {
  value: string;
  tone?: keyof typeof dot;
  pulse?: boolean;
}) {
  const d = dot[forced || pick(value)];
  const isLive = pulse || ["in progress", "running", "validating", "generating"].includes((value || "").toLowerCase());
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-elevated/75 px-2.5 py-0.5 text-[12px] font-medium tracking-tight whitespace-nowrap text-primary shadow-[0_1px_1px_0_rgba(0,0,0,0.02)]"
      )}
    >
      <span className="relative flex h-1.5 w-1.5 flex-none items-center justify-center">
        {isLive && (
          <span
            className={cn("absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping", d)}
            aria-hidden
          />
        )}
        <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", d)} aria-hidden />
      </span>
      {value}
    </span>
  );
}

/** Status badge — same primitive, explicit intent for artifact states (§7). */
export function StatusBadge({ value, pulse }: { value: string; pulse?: boolean }) {
  return <Badge value={value} pulse={pulse} />;
}

/* Tone tokens carry both themes, so no `dark:` variant is needed and both
   themes stay AA. Tailwind's stock palette failed here: `text-emerald-600`
   measured 3.65:1 on white. */
const METHOD_STYLES: Record<string, string> = {
  GET: "text-tone-green bg-tone-green/10 border-tone-green/25",
  POST: "text-tone-blue bg-tone-blue/10 border-tone-blue/25",
  PUT: "text-tone-amber bg-tone-amber/10 border-tone-amber/25",
  PATCH: "text-tone-orange bg-tone-orange/10 border-tone-orange/25",
  DELETE: "text-tone-rose bg-tone-rose/10 border-tone-rose/25",
};

/** HTTP Method Badge with REST convention color pill (GET/POST/PUT/PATCH/DELETE) */
export function HttpMethodBadge({ method }: { method: string }) {
  const m = (method || "GET").toUpperCase();
  const cls = METHOD_STYLES[m] || "text-secondary bg-elevated border-border/80";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[10.5px] font-bold tracking-wider select-none",
        cls
      )}
    >
      {m}
    </span>
  );
}
