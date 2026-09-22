"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "../../../../lib/api";
import { Bar, Loading, ErrorBox, Empty } from "../../../../components/ui";

/** Traceability (§14): coverage, orphans, forward/backward trace, suggestions, impact (§17). */
export default function Traceability() {
  const { projectId: pid } = useParams() as { projectId: string };
  const [data, setData] = useState<any>(null);
  const [code, setCode] = useState("REQ-001");
  const [trace, setTrace] = useState<any>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [impact, setImpact] = useState<any>(null);
  const [impactCode, setImpactCode] = useState("REQ-001");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");

  const load = () => api(`/projects/${pid}/traceability`).then(setData).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const lookup = () => api(`/projects/${pid}/traceability/${code}`).then(setTrace).catch((e) => setErr(e.message));

  const suggest = async () => {
    setBusy("suggest");
    try { setSuggestions((await api(`/projects/${pid}/traceability/suggest`, { method: "POST" })).suggestions || []); }
    catch (e: any) { setErr(e.message); }
    setBusy("");
  };

  const confirm = async (s: any) => {
    const [tt, tid] = s.to.split(":");
    await api(`/projects/${pid}/traceability/links`, {
      method: "POST",
      body: JSON.stringify({ source_type: "requirement", source_id: s.from, target_type: tt, target_id: tid, relationship_type: s.rel }),
    });
    setSuggestions(suggestions.filter((x) => x !== s));
    await load();
  };

  const analyze = async () => {
    setBusy("impact");
    try { setImpact(await api(`/projects/${pid}/impact/analyze`, { method: "POST", body: JSON.stringify({ requirement_code: impactCode }) })); }
    catch (e: any) { setErr(e.message); }
    setBusy("");
  };

  if (err && !data) return <ErrorBox message={err} onRetry={load} />;
  if (!data) return <Loading stage="Computing traceability coverage" />;

  return (
    <div>
      <h1>Traceability</h1>
      <p className="sub">Forward + backward links, orphan detection, coverage — computed from stored relationships.</p>
      {err && <ErrorBox message={err} />}
      <div className="card">
        <b>Coverage: {data.coverage.covered}/{data.coverage.total} ({data.coverage.coverage_pct}%)</b>
        <Bar pct={data.coverage.coverage_pct} />
        {data.coverage.orphans.length > 0 ? (
          <p>▲ Orphaned: {data.coverage.orphans.map((o: string) => <code key={o}>{o} </code>)}</p>
        ) : <p className="muted">✓ No orphans — every requirement links downstream.</p>}
      </div>
      <div className="card">
        <h3>Trace an artifact</h3>
        <div className="row">
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="REQ-001 or API-001" style={{ maxWidth: 200 }} aria-label="Artifact code" />
          <button onClick={lookup}>Trace</button>
        </div>
        {trace && (
          <>
            {(trace.forward || []).length === 0 && (trace.backward || []).length === 0
              ? <Empty title="No links" hint={`${code} is orphaned — generate artifacts or confirm a suggestion below.`} />
              : <>
                {(trace.forward || []).length > 0 && <><b>Downstream</b><ul>{trace.forward.map((l: any, i: number) => <li key={i}><code>{l.from}</code> → <code>{l.to}</code> <span className="muted">({l.rel})</span></li>)}</ul></>}
                {(trace.backward || []).length > 0 && <><b>Upstream</b><ul>{trace.backward.map((l: any, i: number) => <li key={i}><code>{l.from}</code> → <code>{l.to}</code> <span className="muted">({l.rel})</span></li>)}</ul></>}
              </>}
          </>
        )}
      </div>
      <div className="card">
        <div className="spread"><h3>Suggested links</h3><button className="ghost" onClick={suggest} disabled={busy === "suggest"}>{busy === "suggest" ? "Analyzing…" : "Suggest links"}</button></div>
        {suggestions.length === 0
          ? <p className="muted">Deterministic keyword-overlap proposals — you confirm each one. Nothing is linked automatically.</p>
          : <table><thead><tr><th>From</th><th>To</th><th>Why</th><th></th></tr></thead>
            <tbody>{suggestions.map((s, i) => (
              <tr key={i}><td className="mono">{s.from}</td><td className="mono">{s.to}</td><td className="muted">{s.reason}</td>
                <td><button className="ghost" onClick={() => confirm(s)}>Confirm</button></td></tr>
            ))}</tbody></table>}
      </div>
      <div className="card">
        <h3>Impact analysis</h3>
        <p className="muted">Change a requirement → see every affected artifact, deterministically (§17).</p>
        <div className="row">
          <input value={impactCode} onChange={(e) => setImpactCode(e.target.value)} placeholder="REQ-001" style={{ maxWidth: 160 }} aria-label="Requirement code" />
          <button onClick={analyze} disabled={busy === "impact"}>{busy === "impact" ? "Analyzing…" : "Analyze impact"}</button>
        </div>
        {impact && (
          <>
            <p><b>{impact.affected.length} affected artifacts:</b> {impact.affected.map((a: string) => <code key={a}>{a} </code>)}</p>
            <p className="muted">{impact.explanation}</p>
          </>
        )}
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
