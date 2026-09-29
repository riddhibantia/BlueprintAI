"use client";
import { useParams } from "next/navigation";
import { useTests, useRequirements, useTraceability, useWrite } from "../../../../lib/query/useArtifacts";
import { Card } from "../../../../components/ui/card";
import { StatusBadge } from "../../../../components/ui/badge";
import { DataTable } from "../../../../components/ui/data";
import { LoadingState, ErrorState } from "../../../../components/ui/feedback";
import { ArtifactLink } from "../../../../components/ui/activity";
import { PrereqBanner, StageEmpty } from "../../../../components/ui/stage";
import { siblings } from "../../../../lib/query/links";

/** Test workspace (§25): every case names its requirement; siblings show the full chain. */
export default function Tests() {
  const { projectId: pid } = useParams() as { projectId: string };
  const testsQ = useTests(pid);
  const reqsQ = useRequirements(pid);
  const traceQ = useTraceability(pid);
  const write = useWrite(pid, ["tests", "activity", "runs", "traceability"]);

  if (testsQ.isLoading || reqsQ.isLoading) return <LoadingState stage="Loading test plan" />;
  if (testsQ.isError) return <ErrorState message={(testsQ.error as Error)?.message} onRetry={() => testsQ.refetch()} />;
  const tests = testsQ.data || [];
  const hasReqs = (reqsQ.data || []).length > 0;
  const links = traceQ.data?.links || [];
  const kinds: Record<string, any[]> = {};
  tests.forEach((t: any) => { (kinds[t.kind || "acceptance"] = kinds[t.kind || "acceptance"] || []).push(t); });

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-[24px] font-bold tracking-tight">Tests</h1>
        <p className="text-[13px] text-secondary">{tests.length} cases · coverage is computed from links, never claimed</p>
      </div>
      {tests.length === 0 ? (
        <div>
          {!hasReqs && (
            <PrereqBanner text="Test cases validate requirements — generate them first."
              href={`/projects/${pid}/requirements`} action="Go to Requirements" />
          )}
          <StageEmpty title="No tests yet" hint="Generate acceptance, API, and security cases linked to requirements."
            actionLabel="Generate tests" generating={write.isPending}
            disabledReason={!hasReqs ? "Waiting on requirements." : undefined}
            onGenerate={() => write.mutate({ path: `/projects/${pid}/tests/generate`, init: { method: "POST" } })} />
          {write.isError && <div className="mt-3"><ErrorState message={(write.error as Error)?.message} /></div>}
        </div>
      ) : Object.entries(kinds).map(([kind, list]) => (
        <Card key={kind} className="mb-3.5 !p-0 overflow-hidden">
          <p className="border-b border-border px-4 py-2.5 text-[14px] font-semibold capitalize">{kind} ({list.length})</p>
          <DataTable label={`${kind} tests`} head={<><th>ID</th><th>Title</th><th>Req</th><th>Chain</th><th>Steps</th></>}>
            {list.map((t: any) => (
              <tr key={t.code}>
                <td className="font-mono text-[12.5px]">{t.code}</td>
                <td>{t.title}<br /><StatusBadge value={t.kind} /></td>
                <td><ArtifactLink code={t.req} href={`/projects/${pid}/requirements`} /></td>
                <td>{siblings(links, t.req, `test:${t.code}`).slice(0, 4).map((l, i) => <span key={i} className="mr-1"><ArtifactLink code={l.to} /></span>)}</td>
                <td>
                  <details>
                    <summary className="cursor-pointer font-semibold text-accent">steps</summary>
                    <p className="mt-1">{t.steps}</p>
                    <p className="mt-1 text-secondary">Expected: {t.expected}</p>
                  </details>
                </td>
              </tr>
            ))}
          </DataTable>
        </Card>
      ))}
    </div>
  );
}
