"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "../../../../lib/api";
import { Status, Loading, ErrorBox, Empty } from "../../../../components/ui";

export default function Consistency() {
  const { projectId: pid } = useParams() as { projectId: string };
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

  const decide = async (id: string, status: string) => {
    await api(`/projects/${pid}/consistency/issues/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    await load();
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
            <div className="spread"><span className="row"><Status value={i.severity} /><Status value={i.status} /></span><code>{i.check}</code></div>
            <p>{i.description}</p>
            <p className="muted">Affected: {(i.affected || []).join(", ") || "—"}</p>
            <p className="muted">Suggestion: {i.suggestion}</p>
            {i.status === "open" && (
              <div className="row">
                <button className="ghost" onClick={() => decide(i.id, "accepted")}>Accept</button>
                <button className="ghost" onClick={() => decide(i.id, "rejected")}>Reject</button>
                <button className="ghost" onClick={() => decide(i.id, "resolved")}>Resolve</button>
              </div>
            )}
          </div>
        ))}
      {busy && <Loading stage="Comparing architecture, APIs, database and tests" />}
    </div>
  );
}
