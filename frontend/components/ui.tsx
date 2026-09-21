"use client";
import { ReactNode } from "react";

/** Status badge: icon + label, never color-only (§29.6). */
export function Status({ value }: { value: string }) {
  const v = (value || "").toLowerCase();
  let icon = "●";
  let cls = "b-info";
  if (["approved", "passed", "done", "resolved", "success"].includes(v)) { icon = "✓"; cls = "b-ok"; }
  else if (["warning", "draft", "todo", "open", "pending"].includes(v)) { icon = "▲"; cls = "b-warn"; }
  else if (["conflict", "rejected", "failed", "error"].includes(v)) { icon = "✖"; cls = "b-bad"; }
  return <span className={`badge ${cls}`}><span aria-hidden>{icon}</span> {value}</span>;
}

export function Metric({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="metric">
      <div className="metric-v">{value}</div>
      <div className="metric-l">{label}</div>
      {hint && <div className="metric-h">{hint}</div>}
    </div>
  );
}

export function Empty({ title, hint, children }: { title: string; hint: string; children?: ReactNode }) {
  return (
    <div className="state">
      <h3>{title}</h3>
      <p>{hint}</p>
      {children}
    </div>
  );
}

/** Loading names the running stage (§29.5) — never a bare spinner. */
export function Loading({ stage }: { stage: string }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <div className="spinner" aria-hidden />
      <p>{stage}…</p>
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="errorbox" role="alert">
      <b>Something didn’t work.</b>
      <p>{message}</p>
      {onRetry && <button onClick={onRetry}>Try again</button>}
    </div>
  );
}

/** Deterministic coverage bar (DB-computed, never LLM-invented). */
export function Bar({ pct }: { pct: number }) {
  return (
    <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${pct}% covered`}>
      <div className="bar-fill" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}
