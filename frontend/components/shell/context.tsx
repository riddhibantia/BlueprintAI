"use client";
import { createContext, useContext, useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useProject, useActivity } from "../../lib/query/useArtifacts";
import type { ProjectDetail } from "../../lib/api/types";

export type ActivityEvent = { label: string; detail: string; at: string; kind: string };

type Shell = {
  pid: string;
  project: ProjectDetail | null;
  activity: ActivityEvent[];
  selection: string;
  setSelection: (v: string) => void;
  reload: () => Promise<void>;
  copilotOpen: boolean;
  setCopilotOpen: (v: boolean) => void;
  copilotMode: "dock" | "drawer";
  setCopilotMode: (mode: "dock" | "drawer") => void;
};

const Ctx = createContext<Shell>({
  pid: "",
  project: null,
  activity: [],
  selection: "",
  setSelection: () => {},
  reload: async () => {},
  copilotOpen: false,
  setCopilotOpen: () => {},
  copilotMode: "dock",
  setCopilotMode: () => {},
});

export const useShell = () => useContext(Ctx);

/** Shell data provider: thin UI-state shell over the shared query cache (V3). */
export function ShellProvider({ pid, children }: { pid: string; children: React.ReactNode }) {
  const qc = useQueryClient();
  const { data: project } = useProject(pid);
  const { data: activity } = useActivity(pid);
  const [selection, setSelection] = useState("");
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotMode, setCopilotModeState] = useState<"dock" | "drawer">(() => {
    try {
      const saved = localStorage.getItem("dbp-copilot-mode");
      return saved === "drawer" ? "drawer" : "dock";
    } catch {
      return "dock";
    }
  });

  const setCopilotMode = (mode: "dock" | "drawer") => {
    setCopilotModeState(mode);
    try {
      localStorage.setItem("dbp-copilot-mode", mode);
    } catch {}
  };

  const reload = async () => {
    await qc.invalidateQueries({ queryKey: ["p", pid] });
  };

  return (
    <Ctx.Provider
      value={{
        pid,
        project: project || null,
        activity: activity || [],
        selection,
        setSelection,
        reload,
        copilotOpen,
        setCopilotOpen,
        copilotMode,
        setCopilotMode,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
