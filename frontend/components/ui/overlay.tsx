"use client";
import { ReactNode, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/utils/cn";

/** Right-side drawer (requirement detail, node detail, Copilot on tablet) (§7/§40). */
export function Drawer({ open, onClose, title, children, label }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={label}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <div ref={ref} className="absolute right-0 top-0 h-full w-full max-w-[420px] overflow-auto border-l border-border bg-surface p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="text-[16px] font-semibold">{title}</div>
          <button onClick={onClose} aria-label="Close panel" className="rounded-lg p-1.5 text-secondary hover:bg-elevated hover:text-primary">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Modal dialog with focus close on Escape (§40). */
export function Dialog({ open, onClose, title, children, label }: { open: boolean; onClose: () => void; title: string; children: ReactNode; label?: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={label || title}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-[520px] rounded-2xl border border-border bg-surface p-5 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="text-[16px] font-semibold">{title}</div>
          <button onClick={onClose} aria-label="Close dialog" className="rounded-lg p-1.5 text-secondary hover:bg-elevated hover:text-primary">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Minimal CSS tooltip (title-backed, keyboard-visible via focus). */
export function Tooltip({ tip, children }: { tip: string; children: ReactNode }) {
  return (
    <span title={tip} aria-label={tip} className="inline-flex">{children}</span>
  );
}

/** Simple dropdown menu (button + Escape/outside handling). */
export function Dropdown({ label, items }: { label: ReactNode; items: { label: string; onSelect: () => void }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e instanceof MouseEvent && ref.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", close); };
  }, [open ]);
  return (
    <div ref={ref} className="relative inline-block">
      <button onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] font-medium hover:border-accent">
        {label}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 min-w-[200px] rounded-xl border border-border bg-elevated p-1 shadow-xl">
          {items.map((it) => (
            <button key={it.label} role="menuitem" onClick={() => { setOpen(false); it.onSelect(); }}
              className="block w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-surface">
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
