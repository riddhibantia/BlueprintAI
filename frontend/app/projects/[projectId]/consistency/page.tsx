"use client";
import { useEffect, useState } from "react";
import { api } from "../../../../lib/api";
import { Status, Loading, ErrorBox, Empty } from "../../../../components/ui";

export default function Consistency({ params }: { params: { projectId: string } }) {
  const pid = params.projectId;
  const [issues, setIssues] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = () => api(`/projects/${pid}/consistency/issues`).then((r) => { setIssues(r); setLoaded(true); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const check = async () => {
    setBusy(true);
    try { await api(`/projects/${pid}/consistency/check`, { method: "POST" }); await load(); }
    catch (e: any) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div>
      <h1>Consistency</h1>
      <p className="sub">Deterministic cross-artifact checks (Req↔API, API↔DB, Sec↔API, Req↔Test). AI explains — you decide.</p>
      {err && <ErrorBox message={err} />}
      <div className="card"><button onClick={check} disabled={busy}>{busy ? "Checking…" : "Run consistency check"}</button></div>
      {!loaded ? <Loading stage="Loading open issues" /> :
        issues.length === 0 ? <Empty title="No issues recorded" hint="Run a consistency check after generating the blueprint." /> :
        issues.map((i) => (
          <div className="card" key={i.id}>
            <div className="spread"><Status value={i.severity} /><code>{i.check}</code></div>
            <p>{i.description}</p>
            <p className="muted">Affected: {(i.affected || []).join(", ") || "—"}</p>
            <p className="muted">Suggestion: {i.suggestion}</p>
          </div>
        ))}
      {busy && <Loading stage="Comparing architecture, APIs, database and tests" />}
    </div>
  );
}
