"use client";
import { ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../../lib/utils/cn";

type Variant = "primary" | "ghost" | "danger" | "subtle";
type Size = "xs" | "sm" | "md" | "icon";

const variants: Record<Variant, string> = {
  primary:
    "bg-primary text-on-accent border border-transparent shadow-[0_1px_2px_0_rgba(0,0,0,0.08),inset_0_1px_0_0_rgba(255,255,255,0.14)] dark:border-white/10 hover:bg-primary-active hover:shadow-[0_2px_4px_0_rgba(0,0,0,0.12)] active:scale-[0.97]",
  ghost:
    "bg-surface/80 text-primary border border-border/80 shadow-[0_1px_2px_0_rgba(0,0,0,0.02)] hover:bg-elevated hover:border-border-strong hover:text-primary active:scale-[0.98]",
  danger:
    "bg-danger/[0.08] text-danger border border-danger/25 hover:bg-danger/[0.16] hover:border-danger/40 active:scale-[0.98]",
  subtle:
    "bg-transparent text-secondary hover:text-primary hover:bg-elevated active:scale-[0.98]",
};

/* Sizes keep their compact VISUAL height, but each carries an invisible
   ::after hit area that expands the touch target to >=44px. A 28px pill stays
   28px on screen while still being tappable on a phone. */
const sizes: Record<Size, string> = {
  xs: "h-7 px-2.5 py-0.5 text-[11.5px] rounded-full after:absolute after:left-0 after:right-0 after:-top-2 after:-bottom-2 after:content-['']",
  sm: "h-8 px-3.5 py-1 text-[12.5px] rounded-full after:absolute after:left-0 after:right-0 after:-top-1.5 after:-bottom-1.5 after:content-['']",
  md: "h-9.5 px-4.5 py-1.5 text-[13.5px] rounded-full after:absolute after:left-0 after:right-0 after:-top-1 after:-bottom-1 after:content-['']",
  icon: "h-8.5 w-8.5 p-0 rounded-lg after:absolute after:-inset-1.5 after:content-['']",
};

/** Primary action button — tactile ink pill with specular highlights, micro-press feedback, and loading spinners. */
export function Button({
  variant = "primary",
  size = "md",
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button
      className={cn(
        "relative inline-flex items-center justify-center gap-1.5 font-medium transition-all duration-150 select-none",
        "disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100",
        "focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2",
        variants[variant],
        sizes[size],
        className
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Loader2 size={13} className="animate-spin text-current" aria-hidden />}
      {children}
    </button>
  );
}

/** Icon-only button with accessible label and subtle tactile hover. */
export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        "relative inline-grid h-8.5 w-8.5 place-items-center rounded-lg text-secondary transition-all duration-150",
        /* 34px visual, 44px+ hit area. */
        "after:absolute after:-inset-1.5 after:content-['']",
        "hover:bg-elevated hover:text-primary active:scale-[0.95]",
        "focus-visible:outline-2 focus-visible:outline-primary",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
