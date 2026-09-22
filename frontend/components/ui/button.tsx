"use client";
import { ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../../lib/utils/cn";

type Variant = "primary" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md" | "icon";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-[#06201d] hover:brightness-110 shadow-[0_1px_3px_rgba(94,234,212,0.25)]",
  ghost: "bg-transparent text-primary border border-border hover:border-accent hover:bg-elevated",
  danger: "bg-transparent text-danger border border-danger/50 hover:bg-danger/10",
  subtle: "bg-transparent text-secondary hover:text-primary hover:bg-elevated",
};

const sizes: Record<Size, string> = {
  sm: "px-3 py-1.5 text-[12.5px]",
  md: "px-4 py-2 text-[13px]",
  icon: "p-2",
};

/** Primary action button (§7). */
export function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button
      className={cn("inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-150 hover:-translate-y-px disabled:opacity-50 disabled:hover:translate-y-0 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2", variants[variant], sizes[size], className)}
      disabled={disabled || loading} {...rest}>
      {loading && <Loader2 size={14} className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

/** Icon-only button with accessible label (§7). */
export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button aria-label={label} title={label}
      className={cn("inline-grid place-items-center rounded-lg p-2 text-secondary hover:text-primary hover:bg-elevated transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-accent", className)} {...rest}>
      {children}
    </button>
  );
}
