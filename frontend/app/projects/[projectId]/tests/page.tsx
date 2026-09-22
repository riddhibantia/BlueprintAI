"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { listTests, getTraceability } from "../../../../lib/api/endpoints";
import { Card } from "../../../../components/ui/card";
import { StatusBadge } from "../../../../components/ui/badge";
import { DataTable } from "../../../../components/ui/data";
import { LoadingState, ErrorState, EmptyState } from "../../../../components/ui/feedback";
import { ArtifactLink } from "../../../../components/ui/activity";
import { siblings } from "../../../../lib/query/links";

/** Test workspace (§25): every case names its requirement; siblings show the full chain. */
export default function Tests() {
  const { projectId: pid } = useParams() as { projectId: string };
  const [tests, setTests] = useState<any[]>([]);
  const [links, setLinks] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([listTests(pid), getTraceability(pid)])
      .then(([t, tr]) => { setTests(t); setLinks(tr.links || []); setLoaded(true); })
      .catch((e) => setErr(e.message));
  }, [pid]);

  if (err && !loaded) return <ErrorState message={err} />;
  if (!loaded) return <LoadingState stage="Loading test plan" />;

  const kinds: Record<string, any[]> = {};
  tests.forEach((t) => { (kinds[t.kind || "acceptance"] = kinds[t.kind || "acceptance"] || []).push(t); });

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-[24px] font-bold tracking-tight">Tests</h1>
        <p className="text-[13px] text-secondary">{tests.length} cases · coverage is computed from links, never claimed</p>
      </div>
      {err && <div className="mb-3"><ErrorState message={err} /></div>}
      {tests.length === 0 ? (
        <EmptyState title="No tests yet" hint="Generate the test plan from the Blueprint pipeline." />
      ) : Object.entries(kinds).map(([kind, list]) => (
        <Card key={kind} className="mb-3.5 !p-0 overflow-hidden">
          <p className="border-b border-border px-4 py-2.5 text-[14px] font-semibold capitalize">{kind} ({list.length})</p>
          <DataTable label={`${kind} tests`} head={<><th>ID</th><th>Title</th><th>Req</th><th>Chain</th><th>Steps</th></>}>
            {list.map((t) => (
              <tr key={t.code}>
                <td className="font-mono text-[12.5px]">{t.code}</td>
                <td>{t.title}<br /><StatusBadge value={t.kind} /></td>
                <td><ArtifactLink code={t.req} href={`/projects/${pid}/requirements`} /></td>
                <td>{siblings(links, t.req, `test:${t.code}`).slice(0, 4).map((l, i) => <span key={i} className="mr-1"><ArtifactLink code={l.to} /></span>)}</td>
                <td>
                  <details>
                    <summary className="cursor-pointer font-semibold text-accent">steps</summary>
                    <p className="mt-1">{t.steps}</p>
                    <p className="mt-1 text-secondary">Expected: {t.expected}</p>
                  </details>
                </td>
              </tr>
            ))}
          </DataTable>
        </Card>
      ))}
    </div>
  );
}
