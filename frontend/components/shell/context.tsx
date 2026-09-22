"use client";
import { createContext, useContext, useCallback, useState } from "react";
import { api } from "../../lib/api/client";

export type Project = { id: string; name: string; description?: string; idea?: string; metrics?: any; created_at?: string; updated_at?: string };

type Shell = {
  pid: string;
  project: Project | null;
  reload: () => Promise<void>;
  copilotOpen: boolean;
  setCopilotOpen: (v: boolean) => void;
};

const Ctx = createContext<Shell>({ pid: "", project: null, reload: async () => {}, copilotOpen: false, setCopilotOpen: () => {} });

export const useShell = () => useContext(Ctx);

/** Shell data provider: project detail shared by sidebar, topbar, palette (§8/§9). */
export function ShellProvider({ pid, children }: { pid: string; children: React.ReactNode }) {
  const [project, setProject] = useState<Project | null>(null);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const reload = useCallback(async () => {
    try { setProject(await api(`/projects/${pid}`)); } catch { /* pages surface their own errors */ }
  }, [pid]);
  return <Ctx.Provider value={{ pid, project, reload, copilotOpen, setCopilotOpen }}>{children}</Ctx.Provider>;
}
