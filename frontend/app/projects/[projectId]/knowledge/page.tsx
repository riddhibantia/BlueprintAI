"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { FileUp, Search, Trash2, Database, Cpu, Layers, Sparkles, CheckCircle2 } from "lucide-react";
import { useDocuments } from "../../../../lib/query/useArtifacts";
import { queryKnowledge, uploadDocument, deleteDocument, getKnowledgeStats, seedStandards } from "../../../../lib/api/endpoints";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { Badge } from "../../../../components/ui/badge";
import { LoadingState, ErrorState, EmptyState } from "../../../../components/ui/feedback";

/** Knowledge workspace (§29): vector database, dense embeddings, multi-format upload, hybrid retrieval. */
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

interface KnowledgeStats {
  document_count: number;
  chunk_count: number;
  embedding_provider: string;
  embedding_model?: string;
  embedding_dim?: number;
  vector_db?: string;
  storage_mode?: string;
}

export default function Knowledge() {
  const { projectId: pid } = useParams() as { projectId: string };
  const docsQ = useDocuments(pid);
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [uploading, setUploading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<any[]>([]);
  const [note, setNote] = useState("");
  const [querying, setQuerying] = useState(false);
  const [err, setErr] = useState("");
  const [fileKey, setFileKey] = useState(0);

  const fetchStats = async () => {
    try {
      const res = await getKnowledgeStats(pid);
      setStats(res as KnowledgeStats);
    } catch {
      // Best effort stats inspection
    }
  };

  useEffect(() => {
    fetchStats();
  }, [pid]);

  const docs = docsQ.data || [];
  const chunks = docs.reduce((acc: number, d: any) => acc + (d.chunks || 0), 0);

  const doUpload = async (f: File) => {
    if (f.size > MAX_UPLOAD_BYTES) {
      setErr(`"${f.name}" is ${(f.size / 1024 / 1024).toFixed(1)}MB. Max upload is 15MB.`);
      return;
    }
    setUploading(true);
    setErr("");
    try {
      await uploadDocument(pid, f);
      await docsQ.refetch();
      await fetchStats();
      setFileKey((k) => k + 1);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const seedDefaults = async () => {
    setSeeding(true);
    setErr("");
    try {
      await seedStandards(pid);
      await docsQ.refetch();
      await fetchStats();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not install the default standards.");
    } finally {
      setSeeding(false);
    }
  };

  const doDelete = async (did: string) => {
    if (deletingId) return;
    setDeletingId(did);
    setErr("");
    try {
      await deleteDocument(pid, did);
      await docsQ.refetch();
      await fetchStats();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setDeletingId(null);
    }
  };

  const query = async () => {
    if (!q.trim() || querying) return;
    setQuerying(true);
    setNote("");
    try {
      const r = await queryKnowledge(pid, q);
      setHits(r.hits || []);
      setNote(r.hits?.length ? `Top ${r.hits.length} relevant chunks for "${q}"` : `No matching evidence found for "${q}"`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Query failed.");
    } finally {
      setQuerying(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight">Knowledge & Vector Database</h1>
          <p className="text-[13px] text-secondary">
            {docs.length} documents · {chunks} chunks indexed · grounded in hybrid semantic search
          </p>
        </div>
        {stats && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1 text-[11.5px] font-medium text-secondary">
              <Database size={13} className="text-primary" />
              {stats.vector_db === "pgvector" ? "pgvector (Postgres)" : "Vector Store (SQLite / Memory)"}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1 text-[11.5px] font-medium text-secondary">
              <Cpu size={13} className="text-accent" />
              {stats.embedding_provider}
            </span>
          </div>
        )}
      </div>

      {err && <div className="mb-3"><ErrorState message={err} /></div>}

      <div className="grid gap-3.5 lg:grid-cols-2">
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-[15px] font-semibold"><FileUp size={15} />Corpus & Collections</h3>
            <span className="text-[11.5px] text-secondary">{chunks} total vectors</span>
          </div>
          <label className="block text-[13px]">Upload specification (PDF, Word DOCX, TXT, Markdown ≤15MB)
            <input key={fileKey} type="file" accept=".pdf,.docx,.txt,.md" onChange={(e) => e.target.files?.[0] && doUpload(e.target.files[0])}
              aria-label="Upload document"
              className="mt-1.5 block w-full text-[13px] text-secondary file:mr-3 file:rounded-lg file:border file:border-border-strong file:bg-surface file:px-3.5 file:py-2 file:text-[13px] file:font-medium file:text-primary hover:file:bg-elevated cursor-pointer" />
          </label>

          {uploading && (
            <div className="mt-2.5">
              <LoadingState stage="Parsing document, chunking boundaries, and computing vector embeddings" />
            </div>
          )}

          <div className="mt-3 grid gap-2">
            {docs.length === 0 && !uploading && (
              <EmptyState
                title="No engineering documents yet"
                hint="Install the built-in API, security, testing and data standards, or upload your own."
                action={<Button size="sm" onClick={seedDefaults} loading={seeding}>Load default standards</Button>}
              />
            )}
            {docs.map((d: any) => (
              <div key={d.id} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-canvas px-3.5 py-2.5 text-[13px] hover:border-border-strong transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-primary">{d.name}</span>
                    <span className="shrink-0 rounded-md bg-subtle px-1.5 py-0.5 text-[11px] font-mono text-secondary">
                      {d.chunks} chunks
                    </span>
                    {d.source === "default-pack" && (
                      <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                        built-in
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                    <span>SHA: {d.checksum}</span>
                    <span>·</span>
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 size={11} /> Vector Indexed
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => doDelete(d.id)}
                  disabled={deletingId === d.id}
                  title="Delete document"
                  aria-label={`Delete ${d.name}`}
                  className="rounded-lg p-1.5 text-secondary transition-colors hover:bg-elevated hover:text-danger disabled:opacity-50"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="mb-2 flex items-center gap-2 text-[15px] font-semibold"><Search size={15} />Semantic Evidence Search</h3>
          <p className="mb-2 text-[12.5px] text-secondary">Test how agents retrieve context from your engineering standards corpus.</p>
          <div className="flex gap-2">
            <input type="text" value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && query()}
              placeholder="e.g. rate limits, token auth, password hashing"
              className="h-10 flex-1 rounded-md border border-border bg-canvas px-3 py-1.5 text-[13px] focus:border-primary focus:outline-none" />
            <Button size="sm" onClick={query} loading={querying}>Search</Button>
          </div>
          {note && <p className="mt-2 text-[12px] text-secondary">{note}</p>}
          <div className="mt-2.5 max-h-[380px] space-y-2 overflow-y-auto">
            {hits.map((h, i) => (
              <div key={i} className="rounded-lg border border-border bg-canvas p-2.5 text-[12px]">
                <div className="mb-1 flex items-center justify-between text-muted">
                  <span className="font-semibold text-primary">{h.source || "doc"} · {h.section || "Excerpt"}</span>
                  <span className="font-mono text-[11px] text-accent">Score: {(h.score ?? 0).toFixed(3)}</span>
                </div>
                <p className="text-secondary leading-relaxed line-clamp-4">{h.content}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
