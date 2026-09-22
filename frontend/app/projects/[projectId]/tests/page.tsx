"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "../../../../lib/api";
import { Status, Loading, ErrorBox, Empty } from "../../../../components/ui";

/** Test plan (§13): every major requirement carries a linked validation artifact. */
export default function Tests() {
  const { projectId: pid } = useParams() as { projectId: string };
  const [tests, setTests] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = () => api(`/projects/${pid}/tests`).then((r) => { setTests(r); setLoaded(true); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  if (err && !loaded) return <ErrorBox message={err} onRetry={load} />;
  if (!loaded) return <Loading stage="Loading test plan" />;

  const kinds: Record<string, any[]> = {};
  tests.forEach((t) => { (kinds[t.kind || "acceptance"] = kinds[t.kind || "acceptance"] || []).push(t); });

  return (
    <div>
      <h1>Tests</h1>
      <p className="sub">Unit, integration, API, security, acceptance — each one names its requirement.</p>
      {err && <ErrorBox message={err} />}
      {tests.length === 0 ? (
        <Empty title="No tests yet" hint="Generate the test plan from the Overview pipeline." />
      ) : Object.entries(kinds).map(([kind, list]) => (
        <div className="card" key={kind}>
          <h3 style={{ textTransform: "capitalize" }}>{kind} ({list.length})</h3>
          <table>
            <thead><tr><th>ID</th><th>Title</th><th>Req</th><th>Steps / expected</th></tr></thead>
            <tbody>{list.map((t) => (
              <tr key={t.code}>
                <td className="mono">{t.code}</td>
                <td>{t.title}<br /><span className="muted"><Status value={t.kind} /></span></td>
                <td className="mono">{t.req}</td>
                <td>
                  <details>
                    <summary>steps</summary>
                    <p>{t.steps}</p>
                    <p className="muted">Expected: {t.expected}</p>
                  </details>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
