"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { Pencil } from "lucide-react";
import { usePrd, useWrite } from "../../../../lib/query/useArtifacts";
import { fmtDate } from "../../../../lib/utils/time";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { StatusBadge } from "../../../../components/ui/badge";
import { LoadingState, ErrorState, EmptyState } from "../../../../components/ui/feedback";
import { ApprovalBanner } from "../../../../components/ui/activity";

/** PRD document workspace (§18): outline + document + context, versioned and approved. */
export default function Prd() {
  const { projectId: pid } = useParams() as { projectId: string };
  const prdQ = usePrd(pid);
  const write = useWrite(pid, ["prd", "activity", "runs"]);
  const [draft, setDraft] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [section, setSection] = useState("");

  if (prdQ.isLoading) return <LoadingState stage="Loading PRD" />;
  if (prdQ.isError) return <ErrorState message={(prdQ.error as Error)?.message} onRetry={() => prdQ.refetch()} />;
  const prd = prdQ.data || {};
  if (!prd.content || Object.keys(prd.content).length === 0)
    return <EmptyState title="No PRD yet" hint="Generate it from the Blueprint pipeline after approving requirements." />;
  if (!editing && !draft) { setDraft(prd.content); setSection(Object.keys(prd.content)[0] || ""); }

  const save = (status?: string) => write.mutate(
    { path: `/projects/${pid}/prd`, init: { method: "PUT", body: JSON.stringify({ content: draft, ...(status ? { status } : {}) }) } },
    { onSuccess: () => setEditing(false) });

  const keys = Object.keys(editing ? draft || {} : prd.content);
  const shown = section || keys[0];
  const val = (editing ? draft || {} : prd.content)[shown];

  const setSectionText = (text: string) => {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    setDraft({ ...draft, [shown]: Array.isArray(draft[shown]) ? lines : text });
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight">Product Spec</h1>
          <p className="text-[12.5px] text-secondary"><StatusBadge value={prd.status || "draft"} /> · Updated {fmtDate(prd.updated_at)}</p>
        </div>
        <div className="flex gap-2">
          {!editing
            ? <><Button variant="ghost" onClick={() => { setDraft(prd.content); setEditing(true); }}><Pencil size={14} />Edit</Button>
              {prd.status !== "approved" && <Button loading={write.isPending} onClick={() => save("approved")}>Approve</Button>}</>
            : <><Button loading={write.isPending} onClick={() => save(prd.status)}>Save</Button>
              <Button variant="ghost" onClick={() => { setEditing(false); setDraft(prd.content); }}>Cancel</Button></>}
        </div>
      </div>
      {write.isError && <div className="mb-3"><ErrorState message={(write.error as Error)?.message} /></div>}
      <ApprovalBanner status={prd.status || "draft"} onApprove={() => save("approved")} onEdit={() => { setDraft(prd.content); setEditing(true); }} />

      <div className="grid gap-3.5 lg:grid-cols-[220px_minmax(0,1fr)_260px]">
        <Card className="!p-2">
          <p className="px-2 py-1 text-[11px] font-bold uppercase tracking-[0.07em] text-muted">Outline</p>
          {keys.map((k) => (
            <button key={k} onClick={() => setSection(k)}
              className={`block w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] capitalize ${k === shown ? "bg-elevated font-semibold text-primary" : "text-secondary hover:text-primary"}`}>
              {k.replace(/_/g, " ")}
            </button>
          ))}
        </Card>
        <Card>
          <h3 className="mb-2 text-[17px] font-semibold capitalize">{shown.replace(/_/g, " ")}</h3>
          {editing ? (
            <textarea rows={Math.max(6, (Array.isArray(val) ? val.length : 3) + 2)}
              value={Array.isArray(val) ? val.join("\n") : String(val ?? "")}
              onChange={(e) => setSectionText(e.target.value)} aria-label={shown}
              className="w-full rounded-xl border border-border bg-canvas p-3 text-[14px] leading-relaxed" />
          ) : Array.isArray(val) ? (
            <ul className="grid gap-1.5">{val.map((v: string, i: number) => <li key={i} className="text-[14px] leading-relaxed">• {v}</li>)}</ul>
          ) : <p className="text-[14px] leading-relaxed">{String(val ?? "")}</p>}
        </Card>
        <Card>
          <h3 className="mb-2 text-[14px] font-semibold">Context</h3>
          <p className="text-[12.5px] text-secondary">Sections draw from approved requirements. Edit a section, save, then approve — approved state is authoritative.</p>
          <p className="mt-3 text-[12px] uppercase tracking-wide text-muted">Actions</p>
          <div className="mt-1 grid gap-1.5">
            <a href={`/projects/${pid}/requirements`} className="text-[13px] text-accent hover:underline">Source requirements →</a>
            <a href={`/projects/${pid}/stories`} className="text-[13px] text-accent hover:underline">Derived stories →</a>
            <a href={`/projects/${pid}/traceability`} className="text-[13px] text-accent hover:underline">Coverage →</a>
          </div>
        </Card>
      </div>
    </div>
  );
}
