"use client";
import { useParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { useStories, useTraceability, useWrite } from "../../../../lib/query/useArtifacts";
import { siblings } from "../../../../lib/query/links";
import { Card } from "../../../../components/ui/card";
import { StatusBadge } from "../../../../components/ui/badge";
import { LoadingState, ErrorState, EmptyState } from "../../../../components/ui/feedback";
import { ArtifactLink } from "../../../../components/ui/activity";

/** User stories (§19): structured narrative + AC + real linked artifacts. */
export default function Stories() {
  const { projectId: pid } = useParams() as { projectId: string };
  const storiesQ = useStories(pid);
  const traceQ = useTraceability(pid);
  const approve = useWrite(pid, ["stories", "activity", "runs"]);

  if (storiesQ.isLoading) return <LoadingState stage="Loading user stories" />;
  if (storiesQ.isError) return <ErrorState message={(storiesQ.error as Error)?.message} onRetry={() => storiesQ.refetch()} />;
  const stories = storiesQ.data || [];
  const links = traceQ.data?.links || [];

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-[24px] font-bold tracking-tight">User Stories</h1>
        <p className="text-[13px] text-secondary">{stories.length} stories · each linked to its source requirement and siblings</p>
      </div>
      {approve.isError && <div className="mb-3"><ErrorState message={(approve.error as Error)?.message} /></div>}
      {stories.length === 0 ? (
        <EmptyState title="No stories yet" hint="Generate them from the Blueprint pipeline once requirements are approved." />
      ) : (
        <div className="grid gap-3.5 lg:grid-cols-2">
          {stories.map((s: any) => {
            const rel = siblings(links, s.req, `story:${s.code}`);
            return (
              <Card key={s.code}>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <code className="font-mono text-[13px] font-bold text-accent">{s.code}</code>
                  <span className="flex items-center gap-2">
                    <StatusBadge value={s.status} />
                    {s.status !== "approved" && (
                      <button disabled={approve.isPending}
                        onClick={() => approve.mutate({ path: `/projects/${pid}/stories/${s.code}/approve`, init: { method: "POST" } })}
                        className="rounded-full border border-border px-2.5 py-1 text-[12px] font-semibold text-accent hover:border-accent disabled:opacity-50">
                        Approve
                      </button>
                    )}
                  </span>
                </div>
                <p className="text-[13.5px] italic leading-relaxed">“{s.story}”</p>
                <p className="mt-2 text-[12px] font-bold uppercase tracking-[0.06em] text-muted">Acceptance criteria</p>
                <ul className="mt-1 grid gap-1">
                  {(s.acceptance || []).map((a: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-[13px]">
                      <CheckCircle2 size={14} className="mt-0.5 flex-none text-success" aria-hidden />{a}
                    </li>
                  ))}
                </ul>
                <p className="mt-2.5 border-t border-border pt-2 text-[12.5px] text-secondary">Linked:</p>
                <p className="mt-1 flex flex-wrap gap-1.5">
                  <ArtifactLink code={s.req} href={`/projects/${pid}/requirements`} />
                  {rel.map((l, i) => <ArtifactLink key={i} code={l.to} />)}
                </p>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
