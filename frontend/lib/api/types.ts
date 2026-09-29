// Shared API contract types (mirrors backend/app/schemas + route shapes).
// One canonical place: pages and hooks import from here, never redeclare.

export type ProjectDetail = {
  id: string;
  name: string;
  description?: string;
  idea?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  metrics?: {
    requirements?: number;
    traceability_coverage?: number;
    consistency_open?: number;
    tests?: number;
    stories?: number;
    apis?: number;
    test_coverage?: number;
    blueprint_status?: string;
  };
};

export type Requirement = {
  id: string;
  code: string;
  title: string;
  description?: string;
  type: string;
  priority: string;
  status: string;
  version: number;
  updated_at?: string;
};

export type Prd = {
  content: Record<string, string[] | string>;
  status: string;
  updated_at?: string;
};

export type Story = {
  code: string;
  title: string;
  story?: string;
  req?: string;
  requirement_code?: string;
  acceptance?: string[];
  status: string;
};

export type ArchComponent = { id?: string; name: string; kind: string; description?: string; boundary?: string };
export type ArchRel = { source: string; target: string; label?: string };
export type Architecture = { components: ArchComponent[]; relationships: ArchRel[] };

export type DbField = { name: string; dtype: string; pk?: boolean; fk?: boolean; references?: string; nullable?: boolean };
export type DbEntity = { code: string; name: string; fields?: DbField[] };
export type Database = { entities: DbEntity[] };

export type ApiEndpoint = {
  code: string; method: string; path: string; auth?: string;
  request_schema?: unknown; response_schema?: unknown; status_codes?: number[];
};

export type SecurityControl = { code: string; title: string; description?: string; scope?: string };

export type Task = { id: string; code: string; epic?: string; title: string; req?: string; priority?: string; status: string };

export type TestCase = { code: string; title: string; kind?: string; req?: string; steps?: string; expected?: string };

export type TraceLink = { from: string; to: string; rel: string };
export type Traceability = {
  coverage: { coverage_pct: number; orphans: string[]; total?: number; covered?: number };
  links: TraceLink[];
};

export type Issue = {
  id: string; check: string; severity: string; description: string;
  affected?: string[]; suggestion?: string; status: string;
};

export type DocEntry = { id: string; name: string; chunks: number; checksum: string };
export type AgentRun = { agent: string; output_summary?: string; created_at?: string };
