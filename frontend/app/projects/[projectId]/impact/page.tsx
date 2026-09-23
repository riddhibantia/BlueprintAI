"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { ArrowDown } from "lucide-react";
import { useRequirements } from "../../../../lib/query/useArtifacts";
import { analyzeImpact } from "../../../../lib/api/endpoints";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { ErrorState, EmptyState, LoadingState } from "../../../../components/ui/feedback";
import { ArtifactLink } from "../../../../components/ui/activity";
import { SlashInput } from "../../../../components/ui/slash";

const RANK: Record<string, number> = {
  requirement: 0, story: 1, api: 2, db: 3, security: 4, task: 5, test: 6,
};

function rankOf(code: string): number {
  const t = code.split(":")[0]?.toLowerCase() || "";
  return RANK[t] ?? 99;
}

/** Impact workspace (§28): deterministic chain, interactive cards, LLM explanation as supplement. */
export default function Impact() {
  const { projectId: pid } = useParams() as { projectId: string };
  const reqsQ = useRequirements(pid);
  const [code, setCode] = useState("REQ-001");
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const analyze = async () => {
    setBusy(true); setErr(""); setResult(null);
    try { setResult(await analyzeImpact(pid, code)); }
    catch (e: any) { setErr(e.message); }
    setBusy(false);
  };

  const chain = result ? [...result.affected].sort((a: string, b: string) => rankOf(a) - rankOf(b)) : [];
  const reqCodes = (reqsQ.data || []).map((r: any) => r.code);

  return (
    <div>
      <h1 className="text-[24px] font-bold tracking-tight">Impact Analysis</h1>
      <p className="mb-5 text-[13.5px] text-secondary">Stored relationships first — the traversal below is deterministic, the explanation supplements it.</p>
      {err && <div className="mb-3"><ErrorState message={err} /></div>}
      <Card className="mb-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <SlashInput value={code} onChange={setCode} items={reqCodes} placeholder="/REQ-001" label="Requirement code" />
          <Button loading={busy} onClick={analyze}>Analyze impact</Button>
        </div>
      </Card>
      {busy && <LoadingState stage="Traversing dependent artifacts" />}
      {!result && !busy && (
        <EmptyState title="No analysis yet" hint="Pick a requirement with / — every affected artifact is traced, not guessed." />
      )}
      {result && (
        <>
          <Card className="mb-3.5">
            <p className="text-[14px]"><b>{result.requirement}</b> → <b>{result.affected.length}</b> affected artifacts</p>
            <p className="mt-1 text-[13px] text-secondary">{result.explanation}</p>
          </Card>
          <div className="mx-auto grid max-w-[560px] gap-0">
            <Card className="border-accent/50 text-center">
              <ArtifactLink code={result.requirement} />
              <p className="mt-1 text-[12px] text-secondary">changed requirement</p>
            </Card>
            {chain.map((a: string) => (
              <div key={a}>
                <ArrowDown size={16} className="mx-auto my-1 text-muted" aria-hidden />
                <Card className="text-center">
                  <ArtifactLink code={a} />
                  <p className="mt-1 text-[12px] text-secondary">reached via stored traceability links</p>
                </Card>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
