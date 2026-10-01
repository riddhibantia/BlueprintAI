"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { FileUp, Search } from "lucide-react";
import { useDocuments } from "../../../../lib/query/useArtifacts";
import { queryKnowledge, uploadDocument } from "../../../../lib/api/endpoints";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { LoadingState, ErrorState, EmptyState } from "../../../../components/ui/feedback";

/** Knowledge workspace (§29): real counts, collections, indexing state, search. */
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export default function Knowledge() {
  const { projectId: pid } = useParams() as { projectId: string };
  const docsQ = useDocuments(pid);
  const [uploading, setUploading] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<any[]>([]);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [querying, setQuerying] = useState(false);
  const [fileKey, setFileKey] = useState(0);

  if (docsQ.isLoading) return <LoadingState stage="Loading knowledge base" />;
  if (docsQ.isError) return <ErrorState message={(docsQ.error as Error)?.message} onRetry={() => docsQ.refetch()} />;
  const docs = docsQ.data || [];
  const chunks = docs.reduce((a: number, d: any) => a + (d.chunks || 0), 0);

  const doUpload = async (f: File) => {
    if (f.size > MAX_UPLOAD_BYTES) { setErr("File exceeds the 15MB limit."); return; }
    setUploading(true);
    setErr("");
    try {
      await uploadDocument(pid, f);
      await docsQ.refetch();
      setFileKey((k) => k + 1); // reset input so the same file can be re-uploaded
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };
  const query = async () => {
    if (!q.trim() || querying) return;
    setQuerying(true);
    setErr("");
    try {
      const r = await queryKnowledge(pid, q.trim(), 5);
      setHits(r.hits || []);
      setNote(r.note || "");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Search failed.");
    } finally {
      setQuerying(false);
    }
  };

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
            <input key={fileKey} type="file" accept=".pdf,.txt,.md" onChange={(e) => e.target.files?.[0] && doUpload(e.target.files[0])}
              aria-label="Upload document"
              className="mt-1.5 block w-full text-[13px] text-secondary file:mr-3 file:rounded-lg file:border file:border-border-strong file:bg-surface file:px-3.5 file:py-2 file:text-[13px] file:font-medium file:text-primary hover:file:bg-elevated" />
          </label>
          {uploading && <div className="mt-2"><LoadingState stage="Parsing, chunking and embedding document" /></div>}
          <div className="mt-2 grid gap-1.5">
            {docs.length === 0 && !uploading && <EmptyState title="No documents yet" hint="Upload architecture, API, security or testing standards." />}
            {docs.map((d: any) => (
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
            <input value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && query()}
              placeholder="e.g. What authentication is required for APIs?"
              aria-label="Knowledge query" className="min-w-0 flex-1 rounded-xl border border-border bg-canvas px-3 py-2 text-[13px] placeholder:text-muted focus:border-accent focus:outline-none" />
            <Button onClick={query} loading={querying} disabled={!q.trim()}>Search</Button>
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
