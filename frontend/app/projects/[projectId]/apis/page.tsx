"use client";
import { useMemo, useState, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useApis, useArchitecture, useTraceability, useWrite } from "../../../../lib/query/useArtifacts";
import { Card } from "../../../../components/ui/card";
import { HttpMethodBadge, StatusBadge } from "../../../../components/ui/badge";
import { DataTable } from "../../../../components/ui/data";
import CodeBlock from "../../../../components/ui/code-block";
import { ErrorState, EmptyState, TableSkeleton } from "../../../../components/ui/feedback";
import { ArtifactLink } from "../../../../components/ui/activity";
import { PrereqBanner, StageEmpty } from "../../../../components/ui/stage";
import { touching } from "../../../../lib/query/links";
import { Check, Copy, Download, FileJson, Play, Search, Terminal, Zap } from "lucide-react";
import { Button } from "../../../../components/ui/button";
import { useToast } from "../../../../components/ui/toast";
import { copyText } from "../../../../lib/clipboard";

/** API explorer (§22): method badges, search & filter tabs, cURL copy, schemas, linked artifacts, and interactive try-it-out playground. */
export default function Apis() {
  const { projectId: pid } = useParams() as { projectId: string };
  const searchParams = useSearchParams();
  const toast = useToast();
  const apisQ = useApis(pid);
  const archQ = useArchitecture(pid);
  const traceQ = useTraceability(pid);
  const write = useWrite(pid, ["apis", "activity", "runs", "traceability"]);
  const [sel, setSel] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState<string>("ALL");
  const [curlCopied, setCurlCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"schemas" | "console">("schemas");
  const [customBody, setCustomBody] = useState("");
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<{ status: number; latency: number; body: any } | null>(null);
  const [simCopied, setSimCopied] = useState(false);

  // Hooks run before the loading guard — see note in stories/page.tsx.
  const apis = apisQ.data || [];
  const methods = ["ALL", "GET", "POST", "PUT", "PATCH", "DELETE"];

  // Auto-select from URL query param ?sel=API-xxx
  const selParam = searchParams.get("sel");
  useEffect(() => {
    if (selParam) {
      setSel(selParam);
    }
  }, [selParam]);

  const filteredApis = useMemo(() => {
    return apis.filter((a: any) => {
      const matchesSearch =
        (a.path || "").toLowerCase().includes(search.toLowerCase()) ||
        (a.code || "").toLowerCase().includes(search.toLowerCase()) ||
        (a.method || "").toLowerCase().includes(search.toLowerCase());
      const matchesMethod = methodFilter === "ALL" || (a.method || "").toUpperCase() === methodFilter;
      return matchesSearch && matchesMethod;
    });
  }, [apis, search, methodFilter]);

  const current = (sel ? apis.find((a: any) => a.code === sel) : null) || filteredApis[0] || apis[0];

  useEffect(() => {
    if (current?.request_schema && Object.keys(current.request_schema).length > 0) {
      setCustomBody(JSON.stringify(current.request_schema, null, 2));
    } else {
      setCustomBody("{}");
    }
    setSimResult(null);
  }, [current?.code]);

  if (apisQ.isLoading || archQ.isLoading) return <TableSkeleton rows={6} cols={4} />;
  if (apisQ.isError) return <ErrorState message={(apisQ.error as Error)?.message} onRetry={() => apisQ.refetch()} />;
  const hasArch = (archQ.data?.components?.length || 0) > 0;
  const links = traceQ.data?.links || [];
  const linked = current ? touching(links, current.code) : [];

  const downloadJson = async (endpoint: string, filename: string) => {
    try {
      const res = await fetch(`/api/proxy/projects/${pid}/export/${endpoint}`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${filename}`);
    } catch {
      toast.error("Export error");
    }
  };

  const copyCurl = async () => {
    if (!current) return;
    const method = (current.method || "GET").toUpperCase();
    let cmd = `curl -X ${method} "http://localhost:8000${current.path}"`;
    if (current.auth && current.auth !== "none") {
      cmd += ` \\\n  -H "Authorization: Bearer <YOUR_TOKEN>"`;
    }
    if (["POST", "PUT", "PATCH"].includes(method) && current.request_schema && Object.keys(current.request_schema).length > 0) {
      cmd += ` \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(current.request_schema)}'`;
    }
    if (!(await copyText(cmd))) {
      toast.error("Couldn't copy — your browser blocked clipboard access.");
      return;
    }
    setCurlCopied(true);
    toast.success("Copied cURL command to clipboard!");
    setTimeout(() => setCurlCopied(false), 2000);
  };

  const runSimulation = () => {
    if (!current || simulating) return;
    setSimulating(true);
    setSimResult(null);

    setTimeout(() => {
      try {
        if (customBody.trim()) {
          JSON.parse(customBody);
        }
        const statusCode = (current.status_codes && current.status_codes[0]) || (current.method === "POST" ? 201 : 200);
        setSimResult({
          status: statusCode,
          latency: Math.floor(Math.random() * 25) + 12,
          body: current.response_schema && Object.keys(current.response_schema).length > 0
            ? current.response_schema
            : { status: "success", timestamp: new Date().toISOString() },
        });
      } catch {
        setSimResult({
          status: 400,
          latency: 8,
          body: { error: "Bad Request", message: "Malformed JSON payload syntax." },
        });
      } finally {
        setSimulating(false);
      }
    }, 280);
  };

  const copySimResponse = async () => {
    if (!simResult) return;
    if (await copyText(JSON.stringify(simResult.body, null, 2))) {
      setSimCopied(true);
      toast.success("Copied response payload!");
      setTimeout(() => setSimCopied(false), 1800);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight">APIs</h1>
          <p className="text-[13px] text-secondary">{apis.length} endpoints · OpenAPI 3.0 & Postman Collection v2.1</p>
        </div>
        {apis.length > 0 && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => downloadJson("openapi", `openapi-${pid.slice(0, 8)}.json`)}>
              <FileJson size={14} />OpenAPI 3.0
            </Button>
            <Button variant="ghost" size="sm" onClick={() => downloadJson("postman", `postman-collection-${pid.slice(0, 8)}.json`)}>
              <Download size={14} />Postman v2.1
            </Button>
          </div>
        )}
      </div>

      {apis.length === 0 ? (
        <div>
          {!hasArch && (
            <PrereqBanner text="Endpoints are derived from the architecture — generate components first."
              href={`/projects/${pid}/architecture`} action="Go to Architecture" />
          )}
          <StageEmpty pageTitle="APIs" title="No endpoints yet" hint="Generate the REST surface with auth and schemas from the architecture."
            actionLabel="Generate APIs" generating={write.isPending}
            disabledReason={!hasArch ? "Waiting on architecture components." : undefined}
            onGenerate={() => write.mutate({ path: `/projects/${pid}/apis/generate`, init: { method: "POST" } })} />
          {write.isError && <div className="mt-3"><ErrorState message={(write.error as Error)?.message} /></div>}
        </div>
      ) : (
        <div className="space-y-3.5">
          {/* Search & Method Filter Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-subtle p-2">
            <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5">
              <Search size={14} className="text-muted" aria-hidden />
              <label htmlFor="api-filter" className="sr-only">Filter APIs by path, ID, or method</label>
              <input
                id="api-filter"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by path, ID, or method..."
                className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {methods.map((m) => {
                const count = m === "ALL" ? apis.length : apis.filter((a: any) => (a.method || "").toUpperCase() === m).length;
                if (m !== "ALL" && count === 0) return null;
                const active = methodFilter === m;
                return (
                  <button
                    key={m}
                    onClick={() => setMethodFilter(m)}
                    className={`rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors ${
                      active ? "bg-elevated font-semibold text-primary shadow-xs" : "text-secondary hover:text-primary"
                    }`}
                  >
                    {m} <span className="font-mono text-[11px] text-muted">({count})</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_420px]">
            {filteredApis.length === 0 ? (
              <EmptyState title="No matching endpoints" hint={`No APIs match "${search}" with method filter ${methodFilter}.`} />
            ) : (
              <DataTable label="API endpoints" head={<><th>ID</th><th>Method</th><th>Path</th><th>Auth</th></>}>
                {filteredApis.map((a: any) => {
                  const isSelected = current?.code === a.code;
                  return (
                    <tr
                      key={a.code}
                      onClick={() => setSel(a.code)}
                      tabIndex={0}
                      style={{ cursor: "pointer" }}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSel(a.code); } }}
                      className={isSelected ? "[&_td]:bg-elevated" : "hover:[&_td]:bg-elevated/50"}
                      aria-label={`Inspect ${a.code}`}
                    >
                      <td className="font-mono text-[12px] font-semibold text-secondary">{a.code}</td>
                      <td><HttpMethodBadge method={a.method} /></td>
                      <td className="font-mono text-[12.5px] font-medium">{a.path}</td>
                      <td><StatusBadge value={a.auth || "none"} /></td>
                    </tr>
                  );
                })}
              </DataTable>
            )}

            {current && (
              <Card className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2 border-b border-border pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <HttpMethodBadge method={current.method} />
                      <span className="font-mono text-[13px] font-bold text-primary">{current.path}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="font-mono text-[11px] text-muted">{current.code}</span>
                      <span className="text-muted">·</span>
                      <StatusBadge value={current.auth || "none"} />
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={copyCurl} title="Copy as cURL command">
                    {curlCopied ? <Check size={13} className="text-success" /> : <Terminal size={13} />}
                    {curlCopied ? "Copied" : "cURL"}
                  </Button>
                </div>

                {/* Tab switcher: Schemas vs Try It Out */}
                <div className="flex gap-1 rounded-xl border border-border bg-subtle p-1" role="tablist">
                  <button
                    role="tab"
                    aria-selected={activeTab === "schemas"}
                    onClick={() => setActiveTab("schemas")}
                    className={`flex-1 rounded-lg py-1.5 text-[12px] font-medium transition-colors ${
                      activeTab === "schemas" ? "bg-surface font-semibold text-primary shadow-xs" : "text-secondary hover:text-primary"
                    }`}
                  >
                    Schemas & Spec
                  </button>
                  <button
                    role="tab"
                    aria-selected={activeTab === "console"}
                    onClick={() => setActiveTab("console")}
                    className={`flex items-center justify-center gap-1.5 flex-1 rounded-lg py-1.5 text-[12px] font-medium transition-colors ${
                      activeTab === "console" ? "bg-surface font-semibold text-primary shadow-xs" : "text-secondary hover:text-primary"
                    }`}
                  >
                    <Play size={11} className="text-accent" />
                    Try It Out / Console
                  </button>
                </div>

                {activeTab === "schemas" ? (
                  <>
                    <div>
                      <p className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-muted">Request Schema</p>
                      <CodeBlock
                        code={JSON.stringify(current.request_schema || {}, null, 2)}
                        language="json"
                        filename="request.json"
                        showLineNumbers
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <p className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-muted">
                        Response Schema · {(current.status_codes || [200]).join(", ")}
                      </p>
                      <CodeBlock
                        code={JSON.stringify(current.response_schema || {}, null, 2)}
                        language="json"
                        filename="response.json"
                        showLineNumbers
                        className="mt-1"
                      />
                    </div>
                  </>
                ) : (
                  <div className="space-y-3 text-[13px]">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-muted">Request Payload</span>
                        <span className="text-[11px] font-mono text-muted">application/json</span>
                      </div>
                      <textarea
                        rows={5}
                        value={customBody}
                        onChange={(e) => setCustomBody(e.target.value)}
                        placeholder="{}"
                        className="w-full rounded-xl border border-border bg-canvas p-2.5 font-mono text-[12px] leading-relaxed outline-none focus:border-primary"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[11.5px] text-muted">
                        Auth: {current.auth && current.auth !== "none" ? "Bearer Token included" : "None"}
                      </span>
                      <Button size="sm" loading={simulating} onClick={runSimulation}>
                        <Zap size={13} />Send Request
                      </Button>
                    </div>

                    {simResult && (
                      <div className="rounded-xl border border-border bg-subtle p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`rounded-md px-2 py-0.5 font-mono text-[11.5px] font-bold ${
                              simResult.status < 300
                                ? "bg-success/10 text-success border border-success/30"
                                : "bg-danger/10 text-danger border border-danger/30"
                            }`}>
                              {simResult.status} {simResult.status === 200 ? "OK" : simResult.status === 201 ? "Created" : "Error"}
                            </span>
                            <span className="font-mono text-[11px] text-muted">{simResult.latency}ms</span>
                          </div>
                          <button
                            type="button"
                            onClick={copySimResponse}
                            className="flex items-center gap-1 text-[11.5px] text-secondary hover:text-primary"
                          >
                            {simCopied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
                            {simCopied ? "Copied" : "Copy"}
                          </button>
                        </div>
                        <CodeBlock
                          code={JSON.stringify(simResult.body, null, 2)}
                          language="json"
                          showLineNumbers
                        />
                      </div>
                    )}
                  </div>
                )}

                <div className="border-t border-border pt-2.5">
                  <p className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-muted">Linked Artifacts</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {linked.length === 0 ? (
                      <span className="text-[12px] text-secondary">No linked upstream artifacts yet.</span>
                    ) : (
                      linked.map((l, i) => (
                        <ArtifactLink key={i} code={l.from === `api:${current.code}` ? l.to : l.from} />
                      ))
                    )}
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
