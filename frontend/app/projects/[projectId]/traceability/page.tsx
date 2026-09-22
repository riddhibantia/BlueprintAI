"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "../../../../lib/api";
import { Bar, Loading, ErrorBox, Empty } from "../../../../components/ui";

export default function Traceability() {
  const { projectId: pid } = useParams() as { projectId: string };
  const [data, setData] = useState<any>(null);
  const [code, setCode] = useState("REQ-001");
  const [trace, setTrace] = useState<any>(null);
  const [err, setErr] = useState("");

  const load = () => api(`/projects/${pid}/traceability`).then(setData).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const lookup = () => api(`/projects/${pid}/traceability/${code}`).then(setTrace).catch((e) => setErr(e.message));

  if (err && !data) return <ErrorBox message={err} onRetry={load} />;
  if (!data) return <Loading stage="Computing traceability coverage" />;

  return (
    <div>
      <h1>Traceability</h1>
      <p className="sub">Forward + backward links, orphan detection, coverage — computed from stored relationships.</p>
      <div className="card">
        <b>Coverage: {data.coverage.covered}/{data.coverage.total} ({data.coverage.coverage_pct}%)</b>
        <Bar pct={data.coverage.coverage_pct} />
        {data.coverage.orphans.length > 0 ? (
          <p>▲ Orphaned: {data.coverage.orphans.map((o: string) => <code key={o}>{o} </code>)}</p>
        ) : <p className="muted">✓ No orphans — every requirement links downstream.</p>}
      </div>
      <div className="card">
        <h3>Trace a requirement</h3>
        <div className="row">
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="REQ-001" style={{ maxWidth: 160 }} aria-label="Requirement code" />
          <button onClick={lookup}>Trace forward</button>
        </div>
        {trace && (trace.forward.length === 0
          ? <Empty title="No downstream links" hint={`${code} is orphaned — generate stories/APIs/tasks first.`} />
          : <ul>{trace.forward.map((l: any, i: number) => <li key={i}><code>{l.from}</code> → <code>{l.to}</code> <span className="muted">({l.rel})</span></li>)}</ul>)}
      </div>
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table>
          <thead><tr><th>From</th><th>To</th><th>Relationship</th></tr></thead>
          <tbody>{data.links.map((l: any, i: number) => <tr key={i}><td className="mono">{l.from}</td><td className="mono">{l.to}</td><td>{l.rel}</td></tr>)}</tbody>
        </table>
      </div>
      {data.links.length === 0 && <Empty title="No links yet" hint="Run the pipeline — generation auto-links requirements to stories, APIs, tasks and tests." />}
    </div>
  );
}
