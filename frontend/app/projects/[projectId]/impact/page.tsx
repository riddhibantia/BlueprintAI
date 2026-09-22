"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { analyzeImpact } from "../../../../lib/api/endpoints";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { ErrorState, EmptyState } from "../../../../components/ui/feedback";
import { ArtifactLink } from "../../../../components/ui/activity";

/** Impact analysis workspace (§28): deterministic traversal, interactive affected cards. */
export default function Impact() {
  const { projectId: pid } = useParams() as { projectId: string };
  const [code, setCode] = useState("REQ-001");
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const analyze = async () => {
    setBusy(true); setErr("");
    try { setResult(await analyzeImpact(pid, code)); }
    catch (e: any) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div>
      <h1 className="text-[24px] font-bold tracking-tight">Impact Analysis</h1>
      <p className="mb-5 text-[13.5px] text-secondary">Change a requirement → every affected artifact, traced deterministically.</p>
      {err && <div className="mb-3"><ErrorState message={err} /></div>}
      <Card className="mb-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="REQ-001"
            aria-label="Requirement code" className="w-40 rounded-lg border border-border bg-canvas px-3 py-2 text-[13px]" />
          <Button loading={busy} onClick={analyze}>Analyze impact</Button>
        </div>
      </Card>
      {!result ? (
        <EmptyState title="No analysis yet" hint="Enter a requirement code above — the traversal follows stored relationships." />
      ) : (
        <>
          <Card className="mb-3.5">
            <h3 className="mb-1 text-[15px] font-semibold">{result.affected.length} potentially affected artifacts</h3>
            <p className="text-[13px] text-secondary">{result.explanation}</p>
          </Card>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {result.affected.map((a: string) => (
              <Card key={a}>
                <ArtifactLink code={a} />
                <p className="mt-1.5 text-[12.5px] text-secondary">Reached via stored traceability links from {result.requirement}.</p>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
