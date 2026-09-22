"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "../../../../lib/api";
import { Status, Loading, ErrorBox, Empty } from "../../../../components/ui";

/** API specification (§10): method, auth, schemas — exportable as OpenAPI. */
export default function Apis() {
  const { projectId: pid } = useParams() as { projectId: string };
  const [apis, setApis] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = () => api(`/projects/${pid}/apis`).then((r) => { setApis(r); setLoaded(true); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  if (err && !loaded) return <ErrorBox message={err} onRetry={load} />;
  if (!loaded) return <Loading stage="Loading API specification" />;

  return (
    <div>
      <h1>APIs</h1>
      <p className="sub">Every endpoint carries auth, schemas and status codes — export the set as OpenAPI from Overview.</p>
      {err && <ErrorBox message={err} />}
      {apis.length === 0 ? (
        <Empty title="No endpoints yet" hint="Generate them from the Overview pipeline." />
      ) : (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table>
            <thead><tr><th>ID</th><th>Method</th><th>Path</th><th>Auth</th><th>Status codes</th><th>Schemas</th></tr></thead>
            <tbody>{apis.map((a) => (
              <tr key={a.code}>
                <td className="mono">{a.code}</td>
                <td><b className="mono">{a.method}</b></td>
                <td className="mono">{a.path}</td>
                <td><Status value={a.auth === "jwt" ? "approved" : a.auth} /></td>
                <td className="mono">{(a.status_codes || []).join(", ")}</td>
                <td>
                  <details>
                    <summary>request / response</summary>
                    <pre className="mono">{JSON.stringify({ request: a.request_schema, response: a.response_schema }, null, 2)}</pre>
                  </details>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
