"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { FileUp, Search } from "lucide-react";
import { listDocuments, queryKnowledge, uploadDocument } from "../../../../lib/api/endpoints";
import { timeAgo } from "../../../../lib/utils/time";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { LoadingState, ErrorState, EmptyState } from "../../../../components/ui/feedback";

/** Knowledge workspace (§29): real counts, collections, indexing state, search. */
export default function Knowledge() {
  const { projectId: pid } = useParams() as { projectId: string };
  const [docs, setDocs] = useState<any[]>([]);
  const [q, setQ] = useState("What authentication is required for APIs?");
  const [hits, setHits] = useState<any[]>([]);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = () => listDocuments(pid).then((r) => { setDocs(r); setLoaded(true); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [pid]);

  const upload = async (f: File) => {
    setBusy(true);
    try { await uploadDocument(pid, f); await load(); }
    catch (e: any) { setErr(e.message); }
    setBusy(false);
  };
  const query = async () => {
    const r = await queryKnowledge(pid, q, 5);
    setHits(r.hits || []);
    setNote(r.note || "");
  };

  if (err && !loaded) return <ErrorState message={err} onRetry={load} />;
  if (!loaded) return <LoadingState stage="Loading knowledge base" />;

  const chunks = docs.reduce((a, d) => a + (d.chunks || 0), 0);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-[24px] font-bold tracking-tight">Knowledge</h1>
        <p className="text-[13px] text-secondary">{docs.length} documents · {chunks} chunks indexed · agents cite these as evidence</p>
      </div>
      {err && <div className="mb-3"><ErrorState message={err} /></div>}
      <div className="grid gap-3.5 lg:grid-cols-2">
        <Card>
          <h3 className="mb-2 flex items-center gap-2 text-[15px] font-semibold"><FileUp size={15} />Collections</h3>
          <label className="block text-[13px]">Upload standard (PDF / TXT / Markdown, ≤15MB)
            <input type="file" accept=".pdf,.txt,.md" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
              aria-label="Upload document" className="mt-1 text-[13px]" />
          </label>
          {busy && <div className="mt-2"><LoadingState stage="Parsing, chunking and embedding document" /></div>}
          <div className="mt-2 grid gap-1.5">
            {docs.length === 0 && !busy && <EmptyState title="No documents yet" hint="Upload architecture, API, security or testing standards." />}
            {docs.map((d) => (
              <p key={d.id} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-canvas px-3 py-2 text-[13px]">
                <span className="truncate"><b>{d.name}</b> <span className="text-secondary">· {d.chunks} chunks</span></span>
                <span className="font-mono text-[11px] text-muted">#{d.checksum}</span>
              </p>
            ))}
          </div>
        </Card>
        <Card>
          <h3 className="mb-2 flex items-center gap-2 text-[15px] font-semibold"><Search size={15} />Search evidence</h3>
          <div className="flex gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask the knowledge base…"
              aria-label="Knowledge query" className="min-w-0 flex-1 rounded-xl border border-border bg-canvas px-3 py-2 text-[13px]" />
            <Button onClick={query}>Search</Button>
          </div>
          {note && <p className="mt-2 text-[13px] text-secondary">{note}</p>}
          {hits.map((h, i) => (
            <div key={i} className="mt-2 rounded-xl border border-border bg-canvas p-2.5">
              <code className="font-mono text-[11.5px] text-accent">{h.source} · {h.section} · {h.score}</code>
              <p className="mt-1 text-[12.5px]">{h.content}</p>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
