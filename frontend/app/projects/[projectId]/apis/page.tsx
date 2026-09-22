"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { listApis } from "../../../../lib/api/endpoints";
import { Card } from "../../../../components/ui/card";
import { StatusBadge } from "../../../../components/ui/badge";
import { DataTable } from "../../../../components/ui/data";
import { LoadingState, ErrorState, EmptyState } from "../../../../components/ui/feedback";
import { ArtifactLink } from "../../../../components/ui/activity";
import { getTraceability } from "../../../../lib/api/endpoints";
import { touching } from "../../../../lib/query/links";

/** API explorer (§22): method, auth, schemas, errors, linked artifacts. */
export default function Apis() {
  const { projectId: pid } = useParams() as { projectId: string };
  const [apis, setApis] = useState<any[]>([]);
  const [links, setLinks] = useState<any[]>([]);
  const [sel, setSel] = useState<any>(null);
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([listApis(pid), getTraceability(pid)])
      .then(([a, t]) => { setApis(a); setLinks(t.links || []); setLoaded(true); })
      .catch((e) => setErr(e.message));
  }, [pid]);

  if (err && !loaded) return <ErrorState message={err} />;
  if (!loaded) return <LoadingState stage="Loading API specification" />;

  const current = sel ? apis.find((a) => a.code === sel) : apis[0];
  const linked = current ? touching(links, current.code) : [];

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-[24px] font-bold tracking-tight">APIs</h1>
        <p className="text-[13px] text-secondary">{apis.length} endpoints · OpenAPI export on the Overview top bar</p>
      </div>
      {err && <div className="mb-3"><ErrorState message={err} /></div>}
      {apis.length === 0 ? (
        <EmptyState title="No endpoints yet" hint="Generate them from the Blueprint pipeline." />
      ) : (
        <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <DataTable label="API endpoints" head={<><th>ID</th><th>Method</th><th>Path</th><th>Auth</th></>}>
            {apis.map((a) => (
              <tr key={a.code} onClick={() => setSel(a.code)} tabIndex={0} style={{ cursor: "pointer" }}
                onKeyDown={(e) => e.key === "Enter" && setSel(a.code)}
                className={current?.code === a.code ? "[&_td]:bg-elevated" : ""} aria-label={`Inspect ${a.code}`}>
                <td className="font-mono text-[12.5px]">{a.code}</td>
                <td><b className="font-mono text-[12.5px] text-accent">{a.method}</b></td>
                <td className="font-mono text-[12.5px]">{a.path}</td>
                <td><StatusBadge value={a.auth} /></td>
              </tr>
            ))}
          </DataTable>
          {current && (
            <Card>
              <p className="font-mono text-[13px] font-bold">{current.method} {current.path}</p>
              <p className="mt-1 flex gap-2"><StatusBadge value={current.auth} /><span className="font-mono text-[12px] text-secondary">{current.code}</span></p>
              <p className="mt-3 text-[12px] font-bold uppercase tracking-[0.06em] text-muted">Request</p>
              <pre className="mt-1 overflow-auto rounded-xl bg-canvas p-3 font-mono text-[12px]">{JSON.stringify(current.request_schema || {}, null, 2)}</pre>
              <p className="mt-3 text-[12px] font-bold uppercase tracking-[0.06em] text-muted">Response · {(current.status_codes || []).join(", ")}</p>
              <pre className="mt-1 overflow-auto rounded-xl bg-canvas p-3 font-mono text-[12px]">{JSON.stringify(current.response_schema || {}, null, 2)}</pre>
              <p className="mt-3 text-[12px] font-bold uppercase tracking-[0.06em] text-muted">Linked</p>
              <p className="mt-1 flex flex-wrap gap-1.5">
                {linked.length === 0 ? <span className="text-[12.5px] text-secondary">No links yet.</span>
                  : linked.map((l, i) => <ArtifactLink key={i} code={l.from === `api:${current.code}` ? l.to : l.from} />)}
              </p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
