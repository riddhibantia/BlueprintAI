"use client";
// Shared TanStack Query hooks — one cache per project artifact (V3 data layer).
// Pages consume these instead of fetching in useEffect: no duplicate requests,
// instant invalidation after mutations. All values stay server-computed.
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

const K = (pid: string, name: string) => ["p", pid, name] as const;

function useArtifact<T>(pid: string, name: string, path: string) {
  return useQuery({
    queryKey: K(pid, name),
    queryFn: () => api(path) as Promise<T>,
    staleTime: 30_000,
  });
}

export function useProject(pid: string) {
  return useArtifact<any>(pid, "project", `/projects/${pid}`);
}
export function useActivity(pid: string) {
  const q = useArtifact<{ events: any[] }>(pid, "activity", `/projects/${pid}/activity`);
  return { ...q, data: q.data?.events || [] };
}
export function useRequirements(pid: string) {
  return useArtifact<any[]>(pid, "requirements", `/projects/${pid}/requirements`);
}
export function usePrd(pid: string) {
  return useArtifact<any>(pid, "prd", `/projects/${pid}/prd`);
}
export function useStories(pid: string) {
  return useArtifact<any[]>(pid, "stories", `/projects/${pid}/stories`);
}
export function useArchitecture(pid: string) {
  return useArtifact<any>(pid, "architecture", `/projects/${pid}/architecture`);
}
export function useDatabase(pid: string) {
  return useArtifact<any>(pid, "database", `/projects/${pid}/database`);
}
export function useApis(pid: string) {
  return useArtifact<any[]>(pid, "apis", `/projects/${pid}/apis`);
}
export function useSecurity(pid: string) {
  return useArtifact<any[]>(pid, "security", `/projects/${pid}/security`);
}
export function useTasks(pid: string) {
  return useArtifact<any[]>(pid, "tasks", `/projects/${pid}/tasks`);
}
export function useTests(pid: string) {
  return useArtifact<any[]>(pid, "tests", `/projects/${pid}/tests`);
}
export function useTraceability(pid: string) {
  return useArtifact<{ coverage: any; links: any[] }>(pid, "traceability", `/projects/${pid}/traceability`);
}
export function useIssues(pid: string) {
  return useArtifact<any[]>(pid, "issues", `/projects/${pid}/consistency/issues`);
}
export function useDocuments(pid: string) {
  return useArtifact<any[]>(pid, "documents", `/projects/${pid}/documents`);
}
export function useRuns(pid: string) {
  return useArtifact<any[]>(pid, "runs", `/projects/${pid}/runs`);
}

/** Mutation helper: run a write, then invalidate the given artifact caches. */
export function useWrite(pid: string, names: string[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ path, init }: { path: string; init?: RequestInit }) => api(path, init as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["p", pid] });
      for (const n of names) qc.invalidateQueries({ queryKey: K(pid, n) });
    },
  });
}

/** Invalidate the whole project cache (e.g. after pipeline runs). */
export function useInvalidateProject(pid: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["p", pid] });
}
