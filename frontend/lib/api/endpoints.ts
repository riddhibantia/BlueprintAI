// Typed endpoint helpers over the raw client (§42: lib/api). All values stay server-computed.
import { api, apiForm } from "./client";

export const getProject = (pid: string) => api(`/projects/${pid}`);
export const listProjects = () => api(`/projects`);
export const getHealth = () => api(`/health`);

export const clarify = (pid: string) => api(`/projects/${pid}/clarify`, { method: "POST" });
export const genRequirements = (pid: string, answers = "") =>
  api(`/projects/${pid}/requirements/generate`, { method: "POST", body: JSON.stringify({ answers }) });
export const listRequirements = (pid: string) => api(`/projects/${pid}/requirements`);
export const approveRequirement = (id: string) => api(`/requirements/${id}/approve`, { method: "POST" });

export const genPrd = (pid: string) => api(`/projects/${pid}/prd/generate`, { method: "POST" });
export const getPrd = (pid: string) => api(`/projects/${pid}/prd`);
export const putPrd = (pid: string, body: any) => api(`/projects/${pid}/prd`, { method: "PUT", body: JSON.stringify(body) });
export const genStories = (pid: string) => api(`/projects/${pid}/stories/generate`, { method: "POST" });
export const listStories = (pid: string) => api(`/projects/${pid}/stories`);

export const genArchitecture = (pid: string) => api(`/projects/${pid}/architecture/generate`, { method: "POST" });
export const getArchitecture = (pid: string) => api(`/projects/${pid}/architecture`);
export const genDatabase = (pid: string) => api(`/projects/${pid}/database/generate`, { method: "POST" });
export const getDatabase = (pid: string) => api(`/projects/${pid}/database`);
export const genApis = (pid: string) => api(`/projects/${pid}/apis/generate`, { method: "POST" });
export const listApis = (pid: string) => api(`/projects/${pid}/apis`);
export const analyzeSecurity = (pid: string) => api(`/projects/${pid}/security/analyze`, { method: "POST" });
export const listSecurity = (pid: string) => api(`/projects/${pid}/security`);
export const genTasks = (pid: string) => api(`/projects/${pid}/tasks/generate`, { method: "POST" });
export const listTasks = (pid: string) => api(`/projects/${pid}/tasks`);
export const genTests = (pid: string) => api(`/projects/${pid}/tests/generate`, { method: "POST" });
export const listTests = (pid: string) => api(`/projects/${pid}/tests`);

export const getTraceability = (pid: string) => api(`/projects/${pid}/traceability`);
export const traceArtifact = (pid: string, code: string) => api(`/projects/${pid}/traceability/${code}`);
export const suggestLinks = (pid: string) => api(`/projects/${pid}/traceability/suggest`, { method: "POST" });
export const checkConsistency = (pid: string) => api(`/projects/${pid}/consistency/check`, { method: "POST" });
export const listIssues = (pid: string) => api(`/projects/${pid}/consistency/issues`);
export const analyzeImpact = (pid: string, requirement_code: string) =>
  api(`/projects/${pid}/impact/analyze`, { method: "POST", body: JSON.stringify({ requirement_code }) });

export const listDocuments = (pid: string) => api(`/projects/${pid}/documents`);
export const queryKnowledge = (pid: string, query: string, k = 5) =>
  api(`/projects/${pid}/knowledge/query`, { method: "POST", body: JSON.stringify({ query, k }) });
export const uploadDocument = (pid: string, file: File) => {
  const form = new FormData();
  form.append("file", file);
  return apiForm(`/projects/${pid}/documents`, form);
};

export const listRuns = (pid: string) => api(`/projects/${pid}/runs`);
export const runWorkflow = (pid: string) => api(`/projects/${pid}/workflow/run`, { method: "POST" });
