"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, apiForm } from "../../../../lib/api";
import { Loading, ErrorBox, Empty } from "../../../../components/ui";

export default function Knowledge() {
  const { projectId: pid } = useParams() as { projectId: string };
  const [docs, setDocs] = useState<any[]>([]);
  const [q, setQ] = useState("What authentication is required for APIs?");
  const [hits, setHits] = useState<any[]>([]);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => api(`/projects/${pid}/documents`).then(setDocs).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const upload = async (f: File) => {
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", f);
      await apiForm(`/projects/${pid}/documents`, form);
      await load();
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };
  const query = async () => {
    const r = await api(`/projects/${pid}/knowledge/query`, { method: "POST", body: JSON.stringify({ query: q, k: 5 }) });
    setHits(r.hits || []);
    setNote(r.note || "");
  };

  return (
    <div>
      <h1>Knowledge</h1>
      <p className="sub">Upload engineering standards — generations ground in them and cite evidence. No evidence? The app says so.</p>
      {err && <ErrorBox message={err} />}
      <div className="card">
        <h3>Upload standard (PDF / text, ≤15MB)</h3>
        <input type="file" accept=".pdf,.txt,.md" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} aria-label="Upload document" />
        {busy && <Loading stage="Parsing, chunking and embedding document" />}
        {docs.length === 0 && !busy
          ? <Empty title="No documents yet" hint="Upload API, database, security or architecture standards." />
          : docs.map((d) => <p key={d.id}>📄 <b>{d.name}</b> <span className="muted">· {d.chunks} chunks</span></p>)}
      </div>
      <div className="card">
        <h3>Query evidence</h3>
        <div className="row">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask the knowledge base…" aria-label="Knowledge query" />
          <button onClick={query}>Search</button>
        </div>
        {note && <p className="muted">{note}</p>}
        {hits.map((h, i) => (
          <div key={i} className="card"><code>{h.source} · {h.section} · score {h.score}</code><p>{h.content}</p></div>
        ))}
      </div>
    </div>
  );
}
