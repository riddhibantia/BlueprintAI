"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { listStories, getTraceability } from "../../../../lib/api/endpoints";
import { siblings } from "../../../../lib/query/links";
import { Card } from "../../../../components/ui/card";
import { StatusBadge } from "../../../../components/ui/badge";
import { LoadingState, ErrorState, EmptyState } from "../../../../components/ui/feedback";
import { ArtifactLink } from "../../../../components/ui/activity";

/** User stories (§19): structured narrative + AC + real linked artifacts. */
export default function Stories() {
  const { projectId: pid } = useParams() as { projectId: string };
  const [stories, setStories] = useState<any[]>([]);
  const [links, setLinks] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([listStories(pid), getTraceability(pid)])
      .then(([s, t]) => { setStories(s); setLinks(t.links || []); setLoaded(true); })
      .catch((e) => setErr(e.message));
  }, [pid]);

  if (err && !loaded) return <ErrorState message={err} />;
  if (!loaded) return <LoadingState stage="Loading user stories" />;

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-[24px] font-bold tracking-tight">User Stories</h1>
        <p className="text-[13px] text-secondary">{stories.length} stories · each linked to its source requirement and siblings</p>
      </div>
      {err && <div className="mb-3"><ErrorState message={err} /></div>}
      {stories.length === 0 ? (
        <EmptyState title="No stories yet" hint="Generate them from the Blueprint pipeline once requirements are approved." />
      ) : (
        <div className="grid gap-3.5 lg:grid-cols-2">
          {stories.map((s) => {
            const rel = siblings(links, s.req, `story:${s.code}`);
            return (
              <Card key={s.code}>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <code className="font-mono text-[13px] font-bold text-accent">{s.code}</code>
                  <StatusBadge value={s.status} />
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
