"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Code2 } from "lucide-react";
import { getDatabase, getTraceability } from "../../../../lib/api/endpoints";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { LoadingState, ErrorState, EmptyState } from "../../../../components/ui/feedback";
import { Dialog } from "../../../../components/ui/overlay";
import { ArtifactLink } from "../../../../components/ui/activity";
import { touching } from "../../../../lib/query/links";

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

/** Data-model workspace (§21): ERD-style entities, client-rendered SQL, requirement tracing. */
export default function Database() {
  const { projectId: pid } = useParams() as { projectId: string };
  const [data, setData] = useState<any>(null);
  const [links, setLinks] = useState<any[]>([]);
  const [sqlOpen, setSqlOpen] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    Promise.all([getDatabase(pid), getTraceability(pid)])
      .then(([d, t]) => { setData(d); setLinks(t.links || []); })
      .catch((e) => setErr(e.message));
  }, [pid]);

  if (err && !data) return <ErrorState message={err} />;
  if (!data) return <LoadingState stage="Loading data model" />;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight">Data Model</h1>
          <p className="text-[13px] text-secondary">{(data.entities || []).length} entities · keys and references explicit</p>
        </div>
        {(data.entities || []).length > 0 && <Button variant="ghost" onClick={() => setSqlOpen(true)}><Code2 size={14} />View SQL</Button>}
      </div>
      {err && <div className="mb-3"><ErrorState message={err} /></div>}
      {(data.entities || []).length === 0 ? (
        <EmptyState title="No schema yet" hint="Generate it from the Blueprint pipeline." />
      ) : (
        <div className="grid gap-3.5 md:grid-cols-2">
          {(data.entities || []).map((e: any) => {
            const rel = touching(links, e.code || e.name);
            return (
              <Card key={e.code}>
                <p className="flex items-center justify-between gap-2">
                  <b className="font-mono text-[14px]">{e.name}</b>
                  <code className="font-mono text-[12px] text-accent">{e.code}</code>
                </p>
                <div className="mt-2 divide-y divide-border rounded-xl border border-border">
                  {(e.fields || []).map((f: any, i: number) => (
                    <p key={i} className="flex items-center gap-2 px-3 py-1.5 font-mono text-[12.5px]">
                      <span className={`w-7 flex-none text-[10.5px] font-bold ${f.pk ? "text-info" : f.fk ? "text-warning" : "text-muted"}`}>
                        {f.pk ? "PK" : f.fk ? "FK" : ""}
                      </span>
                      <span>{f.name}</span>
                      <span className="ml-auto text-secondary">{f.dtype}{f.references ? ` → ${f.references}` : ""}</span>
                    </p>
                  ))}
                </div>
                {rel.length > 0 && (
                  <p className="mt-2 flex flex-wrap gap-1.5">
                    {rel.slice(0, 5).map((l, i) => <ArtifactLink key={i} code={l.from.startsWith("db:") ? l.to : l.from} />)}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}
      <Dialog open={sqlOpen} onClose={() => setSqlOpen(false)} title="Generated SQL (client-rendered)">
        <pre className="max-h-[50vh] overflow-auto rounded-xl bg-canvas p-3 font-mono text-[12px]">{toSQL(data?.entities || [])}</pre>
      </Dialog>
    </div>
  );
}
