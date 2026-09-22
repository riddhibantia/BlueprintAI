"use client";
import { createContext, useContext, useCallback, useState } from "react";
import { api } from "../../lib/api/client";

export type Project = { id: string; name: string; description?: string; idea?: string; metrics?: any; created_at?: string; updated_at?: string };

type Shell = {
  pid: string;
  project: Project | null;
  activity: any[];
  selection: string;
  setSelection: (v: string) => void;
  reload: () => Promise<void>;
  copilotOpen: boolean;
  setCopilotOpen: (v: boolean) => void;
};

const Ctx = createContext<Shell>({ pid: "", project: null, activity: [], selection: "", setSelection: () => {}, reload: async () => {}, copilotOpen: false, setCopilotOpen: () => {} });

export const useShell = () => useContext(Ctx);

/** Shell data provider: project detail + activity shared by sidebar, topbar, palette (§8/§9). */
export function ShellProvider({ pid, children }: { pid: string; children: React.ReactNode }) {
  const [project, setProject] = useState<Project | null>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [selection, setSelection] = useState("");
  const [copilotOpen, setCopilotOpen] = useState(false);
  const reload = useCallback(async () => {
    try { setProject(await api(`/projects/${pid}`)); } catch { /* pages surface their own errors */ }
    try { setActivity((await api(`/projects/${pid}/activity`)).events || []); } catch { /* activity is supplementary */ }
  }, [pid]);
  return <Ctx.Provider value={{ pid, project, activity, selection, setSelection, reload, copilotOpen, setCopilotOpen }}>{children}</Ctx.Provider>;
}
