"use client";
import React, { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "../../lib/utils/cn";

export type ToastType = "success" | "error" | "info" | "warning";

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType, duration?: number) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [paused, setPaused] = useState(false);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) { clearTimeout(t); timers.current.delete(id); }
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const addToast = useCallback((message: string, type: ToastType = "info", duration = 4000) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type, duration }]);
  }, []);

  // Timers live outside render so hover/focus can genuinely stop them — a toast
  // that disappears mid-sentence fails WCAG 2.2.1 (Timing Adjustable).
  useEffect(() => {
    if (paused) {
      timers.current.forEach((t) => clearTimeout(t));
      timers.current.clear();
      return;
    }
    toasts.forEach((t) => {
      if (timers.current.has(t.id) || !t.duration || t.duration <= 0) return;
      timers.current.set(t.id, setTimeout(() => removeToast(t.id), t.duration));
    });
  }, [toasts, paused, removeToast]);

  useEffect(() => () => { timers.current.forEach((t) => clearTimeout(t)); }, []);

  const value: ToastContextValue = {
    toast: addToast,
    success: (msg) => addToast(msg, "success"),
    error: (msg) => addToast(msg, "error", 5000),
    info: (msg) => addToast(msg, "info"),
    warning: (msg) => addToast(msg, "warning", 5000),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Exactly one polite live region. The children deliberately do NOT carry
          role="alert" — that is assertive and would create a second competing
          live region whose behaviour differs across screen readers. */}
      <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-full max-w-sm flex-col gap-2" role="region" aria-label="Notifications">
        <div
          aria-live="polite"
          aria-atomic="false"
          className="flex flex-col gap-2"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocusCapture={() => setPaused(true)}
          onBlurCapture={() => setPaused(false)}
        >
          {toasts.map((t) => {
            const Icon =
              t.type === "success"
                ? CheckCircle2
                : t.type === "error" || t.type === "warning"
                ? AlertTriangle
                : Info;
            const border =
              t.type === "success"
                ? "border-success/40"
                : t.type === "error"
                ? "border-danger/40"
                : t.type === "warning"
                ? "border-warning/40"
                : "border-border";
            const iconColor =
              t.type === "success"
                ? "text-success"
                : t.type === "error"
                ? "text-danger"
                : t.type === "warning"
                ? "text-warning"
                : "text-accent";

            return (
              <div
                key={t.id}
                className={cn(
                  "pointer-events-auto flex items-start gap-2.5 rounded-xl border bg-surface p-3.5 shadow-lg backdrop-blur transition-all",
                  border
                )}
              >
                <Icon size={16} className={cn("mt-0.5 shrink-0", iconColor)} aria-hidden />
                {/* Message stays ink; only the icon carries the state colour, so
                    text contrast holds in both themes and colour is never the
                    sole indicator. */}
                <p className="flex-1 text-[13px] leading-tight text-primary">{t.message}</p>
                <button
                  onClick={() => removeToast(t.id)}
                  className="-m-1.5 rounded-lg p-1.5 text-secondary transition-colors hover:text-primary"
                  aria-label={`Dismiss notification: ${t.message}`}
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback if rendered outside provider
    return {
      toast: (msg) => console.log(`[Toast] ${msg}`),
      success: (msg) => console.log(`[Success] ${msg}`),
      error: (msg) => console.error(`[Error] ${msg}`),
      info: (msg) => console.log(`[Info] ${msg}`),
      warning: (msg) => console.warn(`[Warning] ${msg}`),
    };
  }
  return ctx;
}
