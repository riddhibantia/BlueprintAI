"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Keyboard, X } from "lucide-react";
import { useFocusTrap } from "../ui/overlay";
import { useShell } from "./context";

interface ShortcutGroup {
  name: string;
  items: { keys: string[]; description: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    name: "Quick Navigation (Press G then...)",
    items: [
      { keys: ["G", "O"], description: "Go to Project Overview" },
      { keys: ["G", "B"], description: "Go to Blueprint Pipeline" },
      { keys: ["G", "R"], description: "Go to Requirements" },
      { keys: ["G", "P"], description: "Go to Product Spec (PRD)" },
      { keys: ["G", "S"], description: "Go to User Stories" },
      { keys: ["G", "A"], description: "Go to Architecture" },
      { keys: ["G", "D"], description: "Go to Data Model (Database)" },
      { keys: ["G", "E"], description: "Go to APIs Explorer" },
      { keys: ["G", "T"], description: "Go to Delivery Tasks" },
      { keys: ["G", "V"], description: "Go to Test Cases" },
      { keys: ["G", "C"], description: "Go to Consistency Check" },
      { keys: ["G", "K"], description: "Go to Knowledge Base" },
    ],
  },
  {
    name: "General & Controls",
    items: [
      { keys: ["Ctrl", "K"], description: "Omnibar & Entity Search" },
      { keys: ["Ctrl", "J"], description: "Toggle Blueprint Copilot" },
      { keys: ["?"], description: "Show Keyboard Shortcuts" },
      { keys: ["Esc"], description: "Close Modals & Drawers" },
    ],
  },
];

export function ShortcutsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const trapRef = useFocusTrap(open, onClose);

  if (!open) return null;

  return (
    <div
      ref={trapRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard Shortcuts"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-surface p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-elevated text-primary">
              <Keyboard size={16} />
            </span>
            <h2 className="text-[16px] font-semibold text-primary">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close shortcuts dialog"
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-elevated hover:text-primary"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.name}>
              <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted">
                {group.name}
              </h3>
              <div className="divide-y divide-border/50 rounded-xl border border-border bg-subtle/50">
                {group.items.map((item) => (
                  <div
                    key={item.description}
                    className="flex items-center justify-between px-3.5 py-2.5 text-[13px]"
                  >
                    <span className="text-secondary">{item.description}</span>
                    <div className="flex items-center gap-1">
                      {item.keys.map((k) => (
                        <kbd
                          key={k}
                          className="min-w-[22px] rounded border border-border bg-surface px-1.5 py-0.5 text-center font-mono text-[11px] font-semibold text-primary shadow-xs"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 border-t border-border pt-3 text-center text-[12px] text-muted">
          Press <kbd className="rounded bg-elevated px-1.5 py-0.5 font-mono text-[11px]">Esc</kbd> or click outside to dismiss
        </div>
      </div>
    </div>
  );
}

/** Hook for global key combos (including `?` and `g then ...` sequences) */
export function useGlobalShortcuts(onToggleShortcuts: () => void) {
  const router = useRouter();
  const { pid, setCopilotOpen } = useShell();

  useEffect(() => {
    let pendingG = false;
    let timer: NodeJS.Timeout | null = null;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (isInput) return;

      // Question mark -> toggle shortcuts modal
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        onToggleShortcuts();
        return;
      }

      // Ctrl + J -> Copilot
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setCopilotOpen(true);
        return;
      }

      // Handle G sequence
      if (e.key.toLowerCase() === "g" && !pendingG && !e.ctrlKey && !e.metaKey) {
        pendingG = true;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          pendingG = false;
        }, 1200);
        return;
      }

      if (pendingG && pid) {
        pendingG = false;
        if (timer) clearTimeout(timer);

        const key = e.key.toLowerCase();
        const base = `/projects/${pid}`;
        const routes: Record<string, string> = {
          o: base,
          b: `${base}/blueprint`,
          r: `${base}/requirements`,
          p: `${base}/prd`,
          s: `${base}/stories`,
          a: `${base}/architecture`,
          d: `${base}/database`,
          e: `${base}/apis`,
          t: `${base}/tasks`,
          v: `${base}/tests`,
          c: `${base}/consistency`,
          k: `${base}/knowledge`,
        };

        if (routes[key]) {
          e.preventDefault();
          router.push(routes[key]);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (timer) clearTimeout(timer);
    };
  }, [pid, router, setCopilotOpen, onToggleShortcuts]);
}
