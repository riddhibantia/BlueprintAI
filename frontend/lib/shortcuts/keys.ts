"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Global shortcuts (§11): ⌘K palette, G-sequences. Never hijacks typing or browser keys. */
export function useShortcuts(pid: string, onPalette: () => void) {
  const router = useRouter();
  useEffect(() => {
    let g = false;
    let timer: any = null;
    const arm = () => { g = true; clearTimeout(timer); timer = setTimeout(() => (g = false), 800); };
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onPalette();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      const base = `/projects/${pid}`;
      if (e.key.toLowerCase() === "g") { arm(); return; }
      if (g) {
        g = false;
        const map: Record<string, string> = { r: "requirements", p: "prd", a: "architecture", t: "traceability" };
        const slug = map[e.key.toLowerCase()];
        if (slug) router.push(`${base}/${slug}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); clearTimeout(timer); };
  }, [pid, onPalette, router]);
}
