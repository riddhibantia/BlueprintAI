// Lifecycle computation (§13/§16): stage states derived from live artifact data only.
// States: Complete | In Progress | Blocked | Not Started | Needs Review.

export type StageState = "Complete" | "In Progress" | "Blocked" | "Not Started" | "Needs Review";

export type Bundle = {
  reqs: any[]; prd: any; stories: any[]; arch: any; db: any; apis: any[];
  security: any[]; tasks: any[]; tests: any[]; coverage: any; openIssues: number; links: any[];
};

export type Stage = {
  key: string; label: string; state: StageState; detail: string;
  route: string; count: number;
};

const STAGE_AGENTS: Record<string, string[]> = {
  DISCOVER: ["requirement"], DEFINE: ["prd", "story"], DESIGN: ["architecture", "database", "api", "security"],
  BUILD: [], VERIFY: ["consistency"],
};

/** Last agent-run time per stage (real timestamps from agent history). */
export function stageUpdated(runs: any[], stage: string): string | null {
  const agents = STAGE_AGENTS[stage] || [];
  const hit = runs.find((r) => agents.includes(r.agent));
  return hit ? hit.at : null;
}

export function computeLifecycle(b: Bundle): Stage[] {
  const approved = b.reqs.filter((r) => r.status === "approved").length;
  const prdApproved = (b.prd?.status || "").toLowerCase() === "approved";
  const designParts = [b.arch?.components?.length || 0, b.db?.entities?.length || 0, b.apis.length, b.security.length];
  const designDone = designParts.every((n) => n > 0);
  const tasksDone = b.tasks.length > 0 && b.tasks.every((t) => t.status === "done");
  const cov = b.coverage?.coverage_pct || 0;

  const hasReqs = b.reqs.length > 0;
  const stages: Stage[] = [
    {
      key: "DISCOVER", label: "Discover", route: "requirements", count: b.reqs.length,
      state: !hasReqs ? "Not Started" : approved === b.reqs.length ? "Complete" : "In Progress",
      detail: hasReqs ? `${approved}/${b.reqs.length} approved` : "Clarify the idea, then generate",
    },
    {
      key: "DEFINE", label: "Define", route: "prd", count: b.stories.length + (b.prd?.content ? 1 : 0),
      state: !hasReqs ? "Blocked" : !b.prd?.content && b.stories.length === 0 ? "Not Started"
        : prdApproved && b.stories.length > 0 ? "Complete" : "In Progress",
      detail: b.prd?.content ? `PRD ${b.prd.status || "draft"} · ${b.stories.length} stories` : "Needs approved requirements",
    },
    {
      key: "DESIGN", label: "Design", route: "architecture", count: designParts.reduce((a, c) => a + c, 0),
      state: !hasReqs ? "Blocked" : designDone ? "Complete"
        : designParts.some((n) => n > 0) ? "In Progress" : "Not Started",
      detail: `Arch ${designParts[0]} · DB ${designParts[1]} · APIs ${designParts[2]} · Sec ${designParts[3]}`,
    },
    {
      key: "BUILD", label: "Build", route: "tasks", count: b.tasks.length,
      state: !designDone ? "Blocked" : tasksDone ? "Complete" : b.tasks.length > 0 ? "In Progress" : "Not Started",
      detail: b.tasks.length ? `${b.tasks.filter((t) => t.status === "done").length}/${b.tasks.length} done` : "Needs completed design",
    },
    {
      key: "VERIFY", label: "Verify", route: "tests", count: b.tests.length,
      state: b.tasks.length === 0 ? "Blocked" : b.openIssues > 0 ? "Needs Review"
        : b.tests.length > 0 && cov === 100 ? "Complete"
        : b.tests.length > 0 ? "In Progress" : "Not Started",
      detail: b.tests.length ? `${b.tests.length} tests · ${cov}% traced · ${b.openIssues} open issues` : "Needs tasks first",
    },
  ];
  return stages;
}

/** First incomplete stage route for "Continue Blueprint". */
export function continueRoute(stages: Stage[]): string {
  const next = stages.find((s) => s.state === "In Progress" || s.state === "Needs Review" || s.state === "Blocked")
    || stages.find((s) => s.state === "Not Started");
  return next ? next.route : "traceability";
}
