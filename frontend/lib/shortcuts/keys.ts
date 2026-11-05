"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Global shortcuts: Ctrl/⌘K palette, Ctrl+J copilot, `?` shortcuts cheat sheet, G-sequences. */
export function useShortcuts(
  pid: string,
  onPalette: () => void,
  onCopilot?: () => void,
  onShortcutsHelp?: () => void
) {
  const router = useRouter();
  useEffect(() => {
    let g = false;
    let timer: any = null;
    const arm = () => {
      g = true;
      clearTimeout(timer);
      timer = setTimeout(() => (g = false), 1000);
    };

    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing =
        el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onPalette();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        onCopilot?.();
        return;
      }

      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "?") {
        e.preventDefault();
        onShortcutsHelp?.();
        return;
      }

      const base = `/projects/${pid}`;
      if (e.key.toLowerCase() === "g") {
        arm();
        return;
      }
      if (g) {
        g = false;
        const map: Record<string, string> = {
          o: "",
          b: "blueprint",
          r: "requirements",
          p: "prd",
          s: "stories",
          a: "architecture",
          d: "database",
          e: "apis",
          t: "tasks",
          v: "tests",
          c: "consistency",
          k: "knowledge",
        };
        const slug = map[e.key.toLowerCase()];
        if (slug !== undefined) {
          router.push(slug ? `${base}/${slug}` : base);
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(timer);
    };
  }, [pid, onPalette, onCopilot, onShortcutsHelp, router]);
}
