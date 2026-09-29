"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Pencil } from "lucide-react";
import { usePrd, useRequirements, useWrite } from "../../../../lib/query/useArtifacts";
import { fmtDate } from "../../../../lib/utils/time";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { StatusBadge } from "../../../../components/ui/badge";
import { LoadingState, ErrorState } from "../../../../components/ui/feedback";
import { ApprovalBanner } from "../../../../components/ui/activity";
import { PrereqBanner, StageEmpty } from "../../../../components/ui/stage";

/** PRD document workspace (§18): outline + document + context, versioned and approved. */
export default function Prd() {
  const { projectId: pid } = useParams() as { projectId: string };
  const prdQ = usePrd(pid);
  const reqsQ = useRequirements(pid);
  const write = useWrite(pid, ["prd", "activity", "runs"]);
  const [draft, setDraft] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [section, setSection] = useState("");

  // Hydrate the editable draft once the PRD loads (never during render).
  const loaded = prdQ.data;
  useEffect(() => {
    if (!editing && loaded?.content && Object.keys(loaded.content).length > 0) {
      setDraft((d: Record<string, unknown> | null) => d ?? loaded.content);
      setSection((s: string) => s || Object.keys(loaded.content)[0] || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);
  if (prdQ.isLoading || reqsQ.isLoading) return <LoadingState stage="Loading PRD" />;
  if (prdQ.isError) return <ErrorState message={(prdQ.error as Error)?.message} onRetry={() => prdQ.refetch()} />;
  const prd = prdQ.data ?? { content: {}, status: "draft" };
  const approved = (reqsQ.data || []).filter((r: any) => r.status === "approved").length;
  if (!prd.content || Object.keys(prd.content).length === 0)
    return (
      <div>
        {approved === 0 && (
          <PrereqBanner text="PRD generation needs at least one approved requirement — approvals are the gate."
            href={`/projects/${pid}/requirements`} action="Approve requirements" />
        )}
        <StageEmpty title="No PRD yet" hint="Generate the spec from your approved requirements."
          actionLabel="Generate PRD" generating={write.isPending}
          disabledReason={approved === 0 ? `Waiting on approvals (0 approved) — the button unlocks at 1.` : undefined}
          onGenerate={() => write.mutate({ path: `/projects/${pid}/prd/generate`, init: { method: "POST" } })} />
        {write.isError && <div className="mt-3"><ErrorState message={(write.error as Error)?.message} /></div>}
      </div>
    );

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

      <div className="grid gap-3.5 lg:grid-cols-[220px_minmax(0,1fr)] lg:justify-center">
        <Card className="!p-2">
          <p className="px-2 py-1 text-[11px] font-bold uppercase tracking-[0.07em] text-muted">Outline</p>
          {keys.map((k) => (
            <button key={k} onClick={() => setSection(k)}
              className={`block w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] capitalize ${k === shown ? "bg-elevated font-semibold text-primary" : "text-secondary hover:text-primary"}`}>
              {k.replace(/_/g, " ")}
            </button>
          ))}
        </Card>
        <Card className="mx-auto w-full max-w-[720px]">
          <h3 className="mb-2 text-[17px] font-semibold capitalize">{shown.replace(/_/g, " ")}</h3>
          {editing ? (
            <textarea rows={Math.max(6, (Array.isArray(val) ? val.length : 3) + 2)}
              value={Array.isArray(val) ? val.join("\n") : String(val ?? "")}
              onChange={(e) => setSectionText(e.target.value)} aria-label={shown}
              className="w-full rounded-xl border border-border bg-canvas p-3 text-[14px] leading-relaxed" />
          ) : Array.isArray(val) ? (
            <ul className="grid gap-1.5">{val.map((v: string, i: number) => <li key={i} className="text-[14px] leading-relaxed">• {v}</li>)}</ul>
          ) : <p className="text-[15px] leading-relaxed">{String(val ?? "")}</p>}
        </Card>
      </div>
      <details className="mx-auto mt-3.5 w-full max-w-[720px]">
        <summary className="cursor-pointer text-[13px] font-medium text-secondary hover:text-primary">About this document</summary>
        <div className="mt-2 rounded-2xl border border-border bg-surface p-4">
          <p className="text-[12.5px] text-secondary">Sections draw from approved requirements. Edit a section, save, then approve — approved state is authoritative.</p>
          <div className="mt-2 flex flex-wrap gap-3">
            <Link href={`/projects/${pid}/requirements`} prefetch className="text-[13px] text-accent hover:underline">Source requirements →</Link>
            <Link href={`/projects/${pid}/stories`} prefetch className="text-[13px] text-accent hover:underline">Derived stories →</Link>
            <Link href={`/projects/${pid}/traceability`} prefetch className="text-[13px] text-accent hover:underline">Coverage →</Link>
          </div>
        </div>
      </details>
    </div>
  );
}
