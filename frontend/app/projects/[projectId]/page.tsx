"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, apiDownload } from "../../../lib/api";
import { Metric, Bar, Loading, ErrorBox, Empty, Status } from "../../../components/ui";

const STAGES: [string, string][] = [
  ["Clarify idea", "clarify"],
  ["Generate requirements", "requirements"],
  ["PRD + user stories", "prd"],
  ["Architecture", "architecture"],
  ["Database + APIs + security", "data"],
  ["Tasks + tests", "tests"],
  ["Consistency check", "consistency"],
];

export default function Overview() {
  const { projectId: pid } = useParams() as { projectId: string };
  const [data, setData] = useState<any>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [questions, setQuestions] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [done, setDone] = useState<string[]>([]);

  const load = () => {
    api(`/projects/${pid}`).then(setData).catch((e) => setErr(e.message));
    api(`/projects/${pid}/runs`).then(setRuns).catch(() => {});
  };

  /** Authenticated download — the session cookie travels with credentials. */
  const download = async (kind: "markdown" | "pdf" | "openapi" | "json") => {
    setErr("");
    try {
      const ext = kind === "markdown" ? "md" : kind === "pdf" ? "pdf" : "json";
      await apiDownload(`/projects/${pid}/export/${kind}`,
        `blueprint-${String(pid).slice(0, 8)}.${ext}`, kind === "openapi" || kind === "json");
    } catch (e: any) { setErr(e.message); }
  };
  useEffect(() => { load(); }, []);

  const run = async (stage: string) => {
    setBusy(stage); setErr("");
    try {
      if (stage === "clarify") {
        const q = await api(`/projects/${pid}/clarify`, { method: "POST" });
        setQuestions(q.questions || []);
      } else if (stage === "requirements") {
        await api(`/projects/${pid}/requirements/generate`, { method: "POST", body: JSON.stringify({ answers: "" }) });
      } else if (stage === "prd") {
        await api(`/projects/${pid}/prd/generate`, { method: "POST" });
        await api(`/projects/${pid}/stories/generate`, { method: "POST" });
      } else if (stage === "architecture") {
        await api(`/projects/${pid}/architecture/generate`, { method: "POST" });
      } else if (stage === "data") {
        await api(`/projects/${pid}/database/generate`, { method: "POST" });
        await api(`/projects/${pid}/apis/generate`, { method: "POST" });
        await api(`/projects/${pid}/security/analyze`, { method: "POST" });
      } else if (stage === "tests") {
        await api(`/projects/${pid}/tasks/generate`, { method: "POST" });
        await api(`/projects/${pid}/tests/generate`, { method: "POST" });
      } else if (stage === "consistency") {
        await api(`/projects/${pid}/consistency/check`, { method: "POST" });
      }
      setDone((d) => [...new Set([...d, stage])]);
      await load();
    } catch (e: any) { setErr(e.message); }
    setBusy("");
  };

  if (err && !data) return <ErrorBox message={err} onRetry={load} />;
  if (!data) return <Loading stage="Loading project health metrics" />;

  const m = data.metrics;
  return (
    <div>
      <div className="spread">
        <div><h1>{data.name}</h1><p className="sub">{data.idea}</p></div>
        <Status value={m.blueprint_status} />
      </div>
      {err && <ErrorBox message={err} />}
      <div className="grid m4">
        <Metric label="Requirements" value={m.requirements} />
        <Metric label="Traceability coverage" value={`${m.traceability_coverage}%`} hint="DB-computed, never estimated" />
        <Metric label="Open consistency issues" value={m.consistency_open} />
        <Metric label="Test coverage" value={`${m.test_coverage}%`} hint={`${m.tests} tests · ${m.stories} stories · ${m.apis} APIs`} />
      </div>
      <div className="card"><b>Traceability coverage</b><Bar pct={m.traceability_coverage} /></div>
      <div className="card">
        <h3>Blueprint pipeline</h3>
        <p className="muted">Each stage needs your review before the next — AI generates, you approve.</p>
        {STAGES.map(([label, key], i) => (
          <div className="step" key={key}>
            <span className="n">{String(i + 1).padStart(2, "0")}</span>
            <div style={{ flex: 1 }}><b>{label}</b>{done.includes(key) && <span className="muted"> — done</span>}</div>
            <button onClick={() => run(key)} disabled={!!busy}>{busy === key ? "Running…" : "Run"}</button>
          </div>
        ))}
        {busy && <Loading stage={`Running ${busy} (retrieving evidence, generating)`} />}
      </div>
      {questions.length > 0 && (
        <div className="card">
          <h3>Clarification questions</h3>
          <p className="muted">Answer these on the Requirements page before generating.</p>
          <ul>{questions.map((q) => <li key={q}>{q}</li>)}</ul>
        </div>
      )}
      <div className="card">
        <h3>Export</h3>
        <div className="row">
          <button className="ghost" onClick={() => download("markdown")}>Markdown</button>
          <button className="ghost" onClick={() => download("pdf")}>PDF</button>
          <button className="ghost" onClick={() => download("openapi")}>OpenAPI JSON</button>
          <button className="ghost" onClick={() => download("json")}>Full JSON</button>
        </div>
      </div>
      <div className="card">
        <h3>Agent activity</h3>
        {runs.length === 0 ? (
          <p className="muted">No agent runs yet — every generation, check and ingestion is recorded here.</p>
        ) : (
          <table>
            <thead><tr><th>Agent</th><th>Output</th><th>Latency</th><th>Tokens</th></tr></thead>
            <tbody>{runs.slice(0, 8).map((r, i) => (
              <tr key={i}>
                <td><Status value={r.agent} /></td>
                <td>{r.output}</td>
                <td className="mono">{r.latency_ms}ms</td>
                <td className="mono">{r.tokens}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
      {m.requirements === 0 && <Empty title="Pipeline not started" hint="Run stage 01 + 02 above to generate the first requirements." />}
    </div>
  );
}
