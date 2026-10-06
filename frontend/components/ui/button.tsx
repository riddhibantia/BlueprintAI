"use client";
import { ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../../lib/utils/cn";

type Variant = "primary" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md" | "icon";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-on-accent hover:bg-primary-active",
  ghost: "bg-transparent text-primary border border-border-strong hover:bg-subtle",
  danger: "bg-transparent text-danger border border-danger/40 hover:bg-danger/10",
  subtle: "bg-transparent text-secondary hover:text-primary hover:bg-elevated",
};

const sizes: Record<Size, string> = {
  sm: "min-h-9 px-4 py-1.5 text-[13px]",
  md: "min-h-10 px-5 py-2 text-[15px]",
  icon: "p-2",
};

/** Primary action button — ink pill. Pill geometry is the brand button (no sharp
    corners), and ink is the only action colour in the system. */
export function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button
      className={cn("inline-flex items-center justify-center gap-2 rounded-full font-medium transition-[background-color,color,transform,box-shadow] duration-150 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2", variants[variant], sizes[size], className)}
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
      className={cn("inline-grid place-items-center rounded-full p-2 text-secondary hover:text-primary hover:bg-elevated transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-primary", className)} {...rest}>
      {children}
    </button>
  );
}
