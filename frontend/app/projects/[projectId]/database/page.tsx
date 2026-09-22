"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "../../../../lib/api/client";
import { Loading, ErrorBox, Empty } from "../../../../components/ui";

/** Database design (§9): entities, keys, references — linked to requirements via Traceability. */
export default function Database() {
  const { projectId: pid } = useParams() as { projectId: string };
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");

  const load = () => api(`/projects/${pid}/database`).then(setData).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  if (err && !data) return <ErrorBox message={err} onRetry={load} />;
  if (!data) return <Loading stage="Loading database design" />;

  return (
    <div>
      <h1>Database</h1>
      <p className="sub">Entities with primary/foreign keys — receipt binaries belong in S3, keys in the DB (§16).</p>
      {err && <ErrorBox message={err} />}
      {(data.entities || []).length === 0 ? (
        <Empty title="No schema yet" hint="Generate it from the Overview pipeline." />
      ) : (data.entities || []).map((e: any) => (
        <div className="card" key={e.code}>
          <div className="spread"><b>{e.name}</b><code>{e.code}</code></div>
          <table>
            <thead><tr><th>Field</th><th>Type</th><th>Key</th><th>References</th><th>Nullable</th></tr></thead>
            <tbody>{(e.fields || []).map((f: any, i: number) => (
              <tr key={i}>
                <td className="mono">{f.name}</td>
                <td className="mono">{f.dtype}</td>
                <td>{f.pk ? <span className="badge b-info">PK</span> : f.fk ? <span className="badge b-warn">FK</span> : <span className="muted">—</span>}</td>
                <td className="mono">{f.references || "—"}</td>
                <td>{f.nullable ? "yes" : "no"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
