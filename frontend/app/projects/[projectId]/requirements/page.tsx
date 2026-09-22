"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "../../../../lib/api/client";
import { Status, Loading, ErrorBox, Empty } from "../../../../components/ui";

export default function Requirements() {
  const { projectId: pid } = useParams() as { projectId: string };
  const [reqs, setReqs] = useState<any[]>([]);
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => api(`/projects/${pid}/requirements`).then(setReqs).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const clarify = async () => {
    const q = await api(`/projects/${pid}/clarify`, { method: "POST" });
    setQuestions(q.questions);
  };
  const generate = async () => {
    setBusy(true);
    try { await api(`/projects/${pid}/requirements/generate`, { method: "POST", body: JSON.stringify({ answers }) }); await load(); }
    catch (e: any) { setErr(e.message); }
    setBusy(false);
  };
  const approve = async (id: string) => {
    await api(`/requirements/${id}/approve`, { method: "POST" });
    await load();
  };

  return (
    <div>
      <h1>Requirements</h1>
      <p className="sub">Stable IDs (<span className="mono">REQ-001</span>). Approved requirements are the source of truth for every downstream artifact.</p>
      {err && <ErrorBox message={err} />}
      <div className="card">
        <div className="row">
          <button className="ghost" onClick={clarify}>1 · Clarify idea</button>
          <button onClick={generate} disabled={busy}>{busy ? "Generating…" : "2 · Generate requirements"}</button>
        </div>
        {questions.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <b>Clarification questions</b>
            <ul className="muted">{questions.map((q) => <li key={q}>{q}</li>)}</ul>
            <label>Your answers<textarea rows={2} value={answers} onChange={(e) => setAnswers(e.target.value)} placeholder="Managers approve; email+password auth; receipts required…" /></label>
          </div>
        )}
      </div>
      {reqs.length === 0 ? (
        <Empty title="No requirements yet" hint="Clarify the idea, answer the questions, then generate." />
      ) : (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table>
            <thead><tr><th>ID</th><th>Title</th><th>Type</th><th>Priority</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {reqs.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.code}</td>
                  <td>{r.title}</td>
                  <td><Status value={r.type} /></td>
                  <td>{r.priority}</td>
                  <td><Status value={r.status} /></td>
                  <td>{r.status !== "approved" && <button className="ghost" onClick={() => approve(r.id)}>Approve</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {busy && <Loading stage="Drafting requirements from product idea" />}
    </div>
  );
}
