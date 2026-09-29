"use client";
// Shared TanStack Query hooks — one cache per project artifact (V3 data layer).
// Pages consume these instead of fetching in useEffect: no duplicate requests,
// instant invalidation after mutations. All values stay server-computed.
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type {
  ProjectDetail, Requirement, Prd, Story, Architecture, Database, ApiEndpoint,
  SecurityControl, Task, TestCase, Traceability, Issue, DocEntry, AgentRun,
} from "../api/types";

const K = (pid: string, name: string) => ["p", pid, name] as const;

function useArtifact<T>(pid: string, name: string, path: string) {
  return useQuery({
    queryKey: K(pid, name),
    queryFn: () => api<T>(path),
    staleTime: 30_000,
  });
}

export function useProject(pid: string) {
  return useArtifact<ProjectDetail>(pid, "project", `/projects/${pid}`);
}
export function useActivity(pid: string) {
  const q = useArtifact<{ events: { label: string; detail: string; at: string; kind: string }[] }>(pid, "activity", `/projects/${pid}/activity`);
  return { ...q, data: q.data?.events || [] };
}
export function useRequirements(pid: string) {
  return useArtifact<Requirement[]>(pid, "requirements", `/projects/${pid}/requirements`);
}
export function usePrd(pid: string) {
  return useArtifact<Prd>(pid, "prd", `/projects/${pid}/prd`);
}
export function useStories(pid: string) {
  return useArtifact<Story[]>(pid, "stories", `/projects/${pid}/stories`);
}
export function useArchitecture(pid: string) {
  return useArtifact<Architecture>(pid, "architecture", `/projects/${pid}/architecture`);
}
export function useDatabase(pid: string) {
  return useArtifact<Database>(pid, "database", `/projects/${pid}/database`);
}
export function useApis(pid: string) {
  return useArtifact<ApiEndpoint[]>(pid, "apis", `/projects/${pid}/apis`);
}
export function useSecurity(pid: string) {
  return useArtifact<SecurityControl[]>(pid, "security", `/projects/${pid}/security`);
}
export function useTasks(pid: string) {
  return useArtifact<Task[]>(pid, "tasks", `/projects/${pid}/tasks`);
}
export function useTests(pid: string) {
  return useArtifact<TestCase[]>(pid, "tests", `/projects/${pid}/tests`);
}
export function useTraceability(pid: string) {
  return useArtifact<Traceability>(pid, "traceability", `/projects/${pid}/traceability`);
}
export function useIssues(pid: string) {
  return useArtifact<Issue[]>(pid, "issues", `/projects/${pid}/consistency/issues`);
}
export function useDocuments(pid: string) {
  return useArtifact<DocEntry[]>(pid, "documents", `/projects/${pid}/documents`);
}
export function useRuns(pid: string) {
  return useArtifact<AgentRun[]>(pid, "runs", `/projects/${pid}/runs`);
}

/** Mutation helper: run a write, then invalidate the given artifact caches. */
export function useWrite(pid: string, names: string[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ path, init }: { path: string; init?: { method?: string; body?: string } }) =>
      api(path, { method: init?.method, body: init?.body ? JSON.parse(init.body) : undefined }),
    onSuccess: () => {
      for (const n of names) qc.invalidateQueries({ queryKey: K(pid, n) });
      qc.invalidateQueries({ queryKey: K(pid, "activity") });
    },
  });
}
