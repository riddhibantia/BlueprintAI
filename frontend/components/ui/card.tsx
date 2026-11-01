"use client";
import { ReactNode } from "react";
import { cn } from "../../lib/utils/cn";

/** Surface card with modern hairline border, micro-drop shadow, and optional interactive hover. */
export function Card({
  className,
  interactive,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/80 bg-surface p-4.5 shadow-[0_1px_3px_0_rgba(0,0,0,0.02),0_1px_2px_-1px_rgba(0,0,0,0.02)] transition-all duration-150",
        interactive && "hover:-translate-y-[1px] hover:border-border-strong hover:shadow-[0_4px_12px_rgba(0,0,0,0.04)] cursor-pointer",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Elevated panel for side regions and drawers' sections. */
export function Panel({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-2xl border border-border/80 bg-elevated/70 p-4 shadow-2xs", className)} {...rest}>
      {children}
    </div>
  );
}

/** Single health metric with tabular numerals and hairline border. */
export function Metric({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="group rounded-2xl border border-border/80 bg-surface p-4.5 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)] transition-all duration-150 hover:border-border-strong hover:shadow-xs">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</span>
        {icon && <span className="text-muted transition-colors group-hover:text-primary">{icon}</span>}
      </div>
      <div className="mt-2 text-[26px] font-bold tabular-nums tracking-tight leading-none text-primary">{value}</div>
      {hint && <div className="mt-1.5 text-[11.5px] text-muted">{hint}</div>}
    </div>
  );
}
