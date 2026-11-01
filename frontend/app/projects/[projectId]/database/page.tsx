"use client";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useDatabase, useArchitecture, useTraceability, useWrite } from "../../../../lib/query/useArtifacts";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { LoadingState, ErrorState, EmptyState } from "../../../../components/ui/feedback";
import { Dialog } from "../../../../components/ui/overlay";
import { ArtifactLink } from "../../../../components/ui/activity";
import { PrereqBanner, StageEmpty } from "../../../../components/ui/stage";
import { touching } from "../../../../lib/query/links";
import { Code2, Copy, Check, Search, Database as DbIcon, KeyRound, Layers } from "lucide-react";
import { useToast } from "../../../../components/ui/toast";
import CodeBlock from "../../../../components/ui/code-block";
import { copyText } from "../../../../lib/clipboard";

/** Render DDL client-side from structured field data (§21: no backend endpoint for SQL). */
export function toSQL(entities: any[]): string {
  return entities.map((e) => {
    const cols = (e.fields || []).map((f: any) => {
      let line = `  ${f.name} ${f.dtype || "text"}`;
      if (f.pk) line += " PRIMARY KEY";
      if (!f.nullable && !f.pk) line += " NOT NULL";
      if (f.fk && f.references) line += ` REFERENCES ${f.references}`;
      return line;
    });
    return `CREATE TABLE ${e.name} (\n${cols.join(",\n")}\n);`;
  }).join("\n\n");
}

export function entityToSQL(e: any): string {
  const cols = (e.fields || []).map((f: any) => {
    let line = `  ${f.name} ${f.dtype || "text"}`;
    if (f.pk) line += " PRIMARY KEY";
    if (!f.nullable && !f.pk) line += " NOT NULL";
    if (f.fk && f.references) line += ` REFERENCES ${f.references}`;
    return line;
  });
  return `CREATE TABLE ${e.name} (\n${cols.join(",\n")}\n);`;
}

/** Data-model workspace (§21): ERD-style entities, instant search, client-rendered SQL, requirement tracing. */
export default function Database() {
  const { projectId: pid } = useParams() as { projectId: string };
  const toast = useToast();
  const dbQ = useDatabase(pid);
  const archQ = useArchitecture(pid);
  const traceQ = useTraceability(pid);
  const write = useWrite(pid, ["database", "activity", "runs", "traceability"]);
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [target, setTarget] = useState<"postgres" | "prisma" | "typescript" | "sqlalchemy">("postgres");
  const [code, setCode] = useState("");
  const [loadingCode, setLoadingCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [search, setSearch] = useState("");
  const [copiedEntity, setCopiedEntity] = useState<string | null>(null);

  const loadSchema = async (selectedTarget: string) => {
    setLoadingCode(true);
    try {
      const res = await fetch(`/api/proxy/projects/${pid}/export/schema?target=${selectedTarget}`, { credentials: "include" });
      if (res.ok) {
        setCode(await res.text());
      } else {
        setCode(toSQL(dbQ.data?.entities || []));
      }
    } catch {
      setCode(toSQL(dbQ.data?.entities || []));
    } finally {
      setLoadingCode(false);
    }
  };

  const openExporter = () => {
    setSchemaOpen(true);
    loadSchema(target);
  };

  const changeTarget = (newTarget: "postgres" | "prisma" | "typescript" | "sqlalchemy") => {
    setTarget(newTarget);
    loadSchema(newTarget);
  };

  const copyCode = async () => {
    if (!code) return;
    if (!(await copyText(code))) {
      toast.error("Couldn't copy — your browser blocked clipboard access.");
      return;
    }
    setCopied(true);
    toast.success("Copied schema to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const copyTableSql = async (entity: any) => {
    const sql = entityToSQL(entity);
    if (!(await copyText(sql))) {
      toast.error("Couldn't copy — your browser blocked clipboard access.");
      return;
    }
    setCopiedEntity(entity.name);
    toast.success(`Copied SQL for table ${entity.name}`);
    setTimeout(() => setCopiedEntity(null), 2000);
  };

  // Hooks run before the loading guard — see note in stories/page.tsx.
  const data = dbQ.data || { entities: [] };
  const entities = data.entities || [];

  const totalFields = useMemo(() => {
    return entities.reduce((acc: number, e: any) => acc + (e.fields?.length || 0), 0);
  }, [entities]);

  const totalFks = useMemo(() => {
    return entities.reduce((acc: number, e: any) => acc + (e.fields?.filter((f: any) => f.fk)?.length || 0), 0);
  }, [entities]);

  const filteredEntities = useMemo(() => {
    if (!search.trim()) return entities;
    const q = search.toLowerCase();
    return entities.filter((e: any) => {
      const nameMatch = (e.name || "").toLowerCase().includes(q);
      const codeMatch = (e.code || "").toLowerCase().includes(q);
      const fieldMatch = (e.fields || []).some((f: any) => (f.name || "").toLowerCase().includes(q));
      return nameMatch || codeMatch || fieldMatch;
    });
  }, [entities, search]);

  if (dbQ.isLoading || archQ.isLoading) return <LoadingState stage="Loading data model" />;
  if (dbQ.isError) return <ErrorState message={(dbQ.error as Error)?.message} onRetry={() => dbQ.refetch()} />;
  const hasArch = (archQ.data?.components?.length || 0) > 0;
  const links = traceQ.data?.links || [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight">Data Model</h1>
          <p className="text-[13px] text-secondary">
            {entities.length} entities · {totalFields} columns · {totalFks} relationships
          </p>
        </div>
        {entities.length > 0 && (
          <Button variant="ghost" size="sm" onClick={openExporter}>
            <Code2 size={14} />Export Schema DDL
          </Button>
        )}
      </div>

      {entities.length === 0 ? (
        <div>
          {!hasArch && (
            <PrereqBanner text="The schema is derived from the architecture — generate components first."
              href={`/projects/${pid}/architecture`} action="Go to Architecture" />
          )}
          <StageEmpty pageTitle="Data Model" title="No schema yet" hint="Generate entities, fields, keys, and references from the architecture."
            actionLabel="Generate schema" generating={write.isPending}
            disabledReason={!hasArch ? "Waiting on architecture components." : undefined}
            onGenerate={() => write.mutate({ path: `/projects/${pid}/database/generate`, init: { method: "POST" } })} />
          {write.isError && <div className="mt-3"><ErrorState message={(write.error as Error)?.message} /></div>}
        </div>
      ) : (
        <div className="space-y-3.5">
          {/* Search bar & quick stats */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-subtle p-2">
            <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5">
              <Search size={14} className="text-muted" aria-hidden />
              <label htmlFor="schema-search" className="sr-only">Search tables or columns</label>
              <input
                id="schema-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tables or columns..."
                className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted"
              />
            </div>
            <div className="flex items-center gap-3 px-2 font-mono text-[12px] text-muted">
              <span className="flex items-center gap-1.5"><DbIcon size={13} className="text-accent" />{entities.length} tables</span>
              <span>·</span>
              <span className="flex items-center gap-1.5"><Layers size={13} />{totalFields} cols</span>
              <span>·</span>
              <span className="flex items-center gap-1.5"><KeyRound size={13} className="text-warning" />{totalFks} FKs</span>
            </div>
          </div>

          {filteredEntities.length === 0 ? (
            <EmptyState title="No matching tables" hint={`No entity or field matches "${search}".`} />
          ) : (
            <div className="grid gap-3.5 md:grid-cols-2">
              {filteredEntities.map((e: any) => {
                const rel = touching(links, e.code || e.name);
                const pkCount = (e.fields || []).filter((f: any) => f.pk).length;
                const fkCount = (e.fields || []).filter((f: any) => f.fk).length;
                const isCopied = copiedEntity === e.name;
                return (
                  <Card key={e.code || e.name} className="flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-2 border-b border-border pb-2.5">
                        <div className="flex items-center gap-2">
                          <b className="font-mono text-[14px] text-primary">{e.name}</b>
                          <code className="rounded bg-elevated px-1.5 py-0.5 font-mono text-[11px] text-accent">{e.code}</code>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[11px] text-muted">{e.fields?.length || 0} cols</span>
                          <button
                            onClick={() => copyTableSql(e)}
                            className="rounded p-1 text-muted transition-colors hover:bg-elevated hover:text-primary"
                            title="Copy CREATE TABLE SQL"
                          >
                            {isCopied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                          </button>
                        </div>
                      </div>

                      <div className="mt-2.5 divide-y divide-border/60 rounded-xl border border-border/80 bg-canvas/50">
                        {(e.fields || []).map((f: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 px-3 py-1.5 font-mono text-[12px]">
                            <span className="w-8 flex-none text-[10px] font-bold">
                              {f.pk ? (
                                <span className="rounded bg-tone-sky/10 px-1 py-0.5 text-tone-sky">PK</span>
                              ) : f.fk ? (
                                <span className="rounded bg-warning/10 px-1 py-0.5 text-warning">FK</span>
                              ) : (
                                <span className="text-muted/40">—</span>
                              )}
                            </span>
                            <span className="font-medium text-primary">{f.name}</span>
                            <div className="ml-auto flex items-center gap-1.5 text-secondary">
                              <span className="text-[11px]">{f.dtype || "text"}</span>
                              {f.references && (
                                <span className="rounded bg-elevated px-1 text-[10.5px] text-warning" title={`Foreign key references ${f.references}`}>
                                  → {f.references}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {rel.length > 0 && (
                      <div className="mt-3 border-t border-border/60 pt-2">
                        <p className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-muted">Traces to</p>
                        <div className="flex flex-wrap gap-1">
                          {rel.slice(0, 6).map((l, i) => (
                            <ArtifactLink key={i} code={l.from.startsWith("db:") ? l.to : l.from} />
                          ))}
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      <Dialog open={schemaOpen} onClose={() => setSchemaOpen(false)} title="Export Schema & ORM Models">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1 rounded-full border border-border bg-surface p-1">
              {(["postgres", "prisma", "typescript", "sqlalchemy"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => changeTarget(t)}
                  className={`rounded-full px-3 py-1 text-[12px] font-medium capitalize transition-colors ${
                    target === t ? "bg-elevated font-semibold text-primary shadow-sm" : "text-secondary hover:text-primary"
                  }`}
                >
                  {t === "postgres" ? "PostgreSQL DDL" : t === "prisma" ? "Prisma Schema" : t === "typescript" ? "TypeScript Types" : "SQLAlchemy ORM"}
                </button>
              ))}
            </div>
            <Button size="sm" variant="ghost" onClick={copyCode} disabled={loadingCode || !code}>
              {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
              {copied ? "Copied" : "Copy All"}
            </Button>
          </div>
          <CodeBlock
            code={loadingCode ? "// Generating schema..." : code}
            language={target === "postgres" ? "sql" : target === "prisma" ? "prisma" : target === "typescript" ? "typescript" : "python"}
            filename={`schema.${target === "postgres" ? "sql" : target === "prisma" ? "prisma" : target === "typescript" ? "ts" : "py"}`}
            showLineNumbers
          />
        </div>
      </Dialog>
    </div>
  );
}
