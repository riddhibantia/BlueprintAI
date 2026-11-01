"use client";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Visibility test for focus candidacy.
 *
 * Deliberately NOT `offsetParent !== null`: `offsetParent` is always null for
 * `position: fixed` elements, and both overlays here are fixed — so that check
 * discards real controls and can collapse the trap to one element. `checkVisibility`
 * is the correct API where available (Chrome 105+, Firefox 125+, Safari 17.4+),
 * falling back to a rect/display test.
 */
function isVisible(el: HTMLElement): boolean {
  const anyEl = el as HTMLElement & { checkVisibility?: (opts?: object) => boolean };
  if (typeof anyEl.checkVisibility === "function") {
    return anyEl.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  }
  if (el.hidden) return false;
  const rects = el.getClientRects();
  if (rects.length === 0) return false;
  return getComputedStyle(el).visibility !== "hidden";
}

/**
 * Traps Tab focus inside `ref`, closes on Escape, and returns focus to whatever
 * was focused before the overlay opened. `aria-modal="true"` promises the rest
 * of the page is inert — without this, Tab walks straight out behind the scrim
 * and keyboard users lose their place entirely.
 *
 * Exported because the command palette is also a modal and needs the same
 * guarantee; it is not a Dialog only because its markup is bespoke.
 *
 * `initialFocus` overrides where focus lands on open (the palette focuses its
 * text input, which is not the first focusable descendant).
 *
 * Overlays stack: the nav drawer and the Copilot drawer can both be open, and
 * every instance listens on `window`. Without an ordering check each Escape
 * press would close *all* of them and the last-mounted trap would steal focus
 * back. Only the top of the stack reacts.
 */
const overlayStack: symbol[] = [];

export function useFocusTrap(
  open: boolean,
  onClose: () => void,
  initialFocus?: React.RefObject<HTMLElement | null>
) {
  const ref = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);
  const idRef = useRef<symbol>(Symbol("overlay"));

  useEffect(() => {
    if (!open) return;
    const id = idRef.current;
    overlayStack.push(id);
    restoreTo.current = document.activeElement as HTMLElement | null;
    const isTop = () => overlayStack[overlayStack.length - 1] === id;

    // Focus the first meaningful control, not the close (X) button.
    const node = ref.current;
    const preferred = initialFocus?.current;
    if (preferred) {
      preferred.focus({ preventScroll: true });
    } else if (node) {
      const first = node.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? node).focus({ preventScroll: true });
    }

    const onKey = (e: KeyboardEvent) => {
      // Ignore keystrokes aimed at an overlay stacked above this one.
      if (!isTop()) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const root = ref.current;
      if (!root) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el === document.activeElement || isVisible(el)
      );
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      // Wrap in both directions, and pull focus back if it escaped the trap.
      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !root.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      const at = overlayStack.indexOf(id);
      if (at !== -1) overlayStack.splice(at, 1);
      // Return focus to the trigger so the user resumes where they left off —
      // but only if nothing above this overlay is still open to claim it.
      if (!overlayStack.length) restoreTo.current?.focus?.({ preventScroll: true });
    };
  }, [open, onClose, initialFocus]);

  return ref;
}

/** Right-side drawer (requirement detail, node detail, Copilot on tablet) (§7/§40). */
export function Drawer({ open, onClose, title, children, label }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; label: string }) {
  const ref = useFocusTrap(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={label}>
      <div className="absolute inset-0 bg-black/45 backdrop-blur-xs transition-opacity duration-150" onClick={onClose} aria-hidden />
      <div ref={ref} tabIndex={-1} className="scroll-thin absolute right-0 top-0 h-full w-full max-w-[440px] overflow-auto border-l border-border bg-surface p-6 shadow-2xl outline-none">
        <div className="mb-4 flex items-start justify-between gap-3 border-b border-border/60 pb-3">
          <div className="text-[16px] font-semibold text-primary">{title}</div>
          <button onClick={onClose} aria-label="Close panel" className="-m-2 rounded-lg p-2 text-muted transition-colors hover:bg-elevated hover:text-primary active:scale-95">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Modal dialog with backdrop blur, trapped focus, and focus restore (§40). */
export function Dialog({ open, onClose, title, children, label }: { open: boolean; onClose: () => void; title: string; children: ReactNode; label?: string }) {
  const ref = useFocusTrap(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={label || title}>
      <div className="absolute inset-0 bg-black/45 backdrop-blur-xs transition-opacity duration-150" onClick={onClose} aria-hidden />
      <div ref={ref} tabIndex={-1} className="relative w-full max-w-[520px] rounded-2xl border border-border/90 bg-surface p-6 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.25)] outline-none">
        <div className="mb-4 flex items-start justify-between gap-3 border-b border-border/60 pb-3">
          <div className="text-[16px] font-semibold text-primary">{title}</div>
          <button onClick={onClose} aria-label="Close dialog" className="-m-2 rounded-lg p-2 text-muted transition-colors hover:bg-elevated hover:text-primary active:scale-95">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Tooltip backed by a real hover/focus tip. It deliberately does NOT set
 * `aria-label`: doing so overwrites the accessible name of whatever it wraps,
 * so a tip on a labelled button would make the button announce the tip text
 * instead of its own name.
 */
export function Tooltip({ tip, children }: { tip: string; children: ReactNode }) {
  const [shown, setShown] = useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setShown(true)}
      onMouseLeave={() => setShown(false)}
      onFocus={() => setShown(true)}
      onBlur={() => setShown(false)}
    >
      {children}
      {shown && (
        <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-surface px-2 py-1 text-[12px] text-secondary shadow-md">
          {tip}
        </span>
      )}
    </span>
  );
}

/** Dropdown menu with roving arrow-key focus, Home/End, and Escape (§40).
 *  `labelText` supplies the accessible name when `label` is icon/visual only
 *  (an inline `aria-label` on a nested span does not name the button). */
export function Dropdown({ label, labelText, items }: { label: ReactNode; labelText: string; items: { label: string; onSelect: () => void }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Outside click only; Escape is handled on the menu so it can restore focus.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  // Move focus into the menu so `role="menu"` actually behaves like one.
  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const onMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const els = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const i = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") { e.preventDefault(); els[(i + 1) % els.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); els[(i - 1 + els.length) % els.length]?.focus(); }
    else if (e.key === "Home") { e.preventDefault(); els[0]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); els[els.length - 1]?.focus(); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "Tab") { close(); }
  };

  return (
    <div ref={ref} className="relative inline-block">
      <button ref={triggerRef} onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} aria-label={labelText}
        className="inline-flex min-h-9 items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] font-medium transition-colors hover:border-border-strong hover:bg-elevated active:scale-[0.98]">
        {label}
      </button>
      {open && (
        <div ref={menuRef} role="menu" onKeyDown={onMenuKey}
          className="absolute right-0 z-40 mt-1.5 min-w-[210px] rounded-xl border border-border/80 bg-surface/95 backdrop-blur-md p-1.5 shadow-[0_10px_25px_-5px_rgba(0,0,0,0.12),0_8px_10px_-6px_rgba(0,0,0,0.06)] ring-1 ring-black/5">
          {items.map((it) => (
            <button key={it.label} role="menuitem" onClick={() => { setOpen(false); it.onSelect(); }}
              className="block min-h-9 w-full rounded-lg px-3 py-2 text-left text-[13px] font-medium text-secondary transition-colors hover:bg-elevated hover:text-primary focus:bg-elevated focus:text-primary focus:outline-none">
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
