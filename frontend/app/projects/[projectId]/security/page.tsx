"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { listSecurity, listIssues, getTraceability } from "../../../../lib/api/endpoints";
import { Card } from "../../../../components/ui/card";
import { StatusBadge } from "../../../../components/ui/badge";
import { LoadingState, ErrorState, EmptyState } from "../../../../components/ui/feedback";
import { ArtifactLink } from "../../../../components/ui/activity";
import { touching } from "../../../../lib/query/links";

/** Category rollup: a category is healthy when controls exist AND no open issue touches it. */
const CATS: { label: string; keys: string[] }[] = [
  { label: "Authentication", keys: ["auth", "jwt", "login"] },
  { label: "Authorization", keys: ["rbac", "role", "permission", "access"] },
  { label: "Data Protection", keys: ["encrypt", "data", "protect", "pii"] },
  { label: "Secrets", keys: ["secret", "vault", "key"] },
  { label: "Audit Logging", keys: ["audit", "log"] },
];

function inCat(text: string, keys: string[]): boolean {
  const t = text.toLowerCase();
  return keys.some((k) => t.includes(k));
}

/** Security workspace (§23): real controls, real issues, real links. */
export default function Security() {
  const { projectId: pid } = useParams() as { projectId: string };
  const [controls, setControls] = useState<any[]>([]);
  const [issues, setIssues] = useState<any[]>([]);
  const [links, setLinks] = useState<any[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([listSecurity(pid), listIssues(pid), getTraceability(pid)])
      .then(([c, i, t]) => { setControls(c); setIssues(i.filter((x: any) => x.status === "open")); setLinks(t.links || []); setLoaded(true); })
      .catch((e) => setErr(e.message));
  }, [pid]);

  if (err && !loaded) return <ErrorState message={err} />;
  if (!loaded) return <LoadingState stage="Loading security controls" />;

  const selected = sel ? controls.find((c) => c.code === sel) : null;
  const selLinks = selected ? touching(links, selected.code) : [];

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-[24px] font-bold tracking-tight">Security</h1>
        <p className="text-[13px] text-secondary">{controls.length} controls · {issues.length} open issues</p>
      </div>
      {err && <div className="mb-3"><ErrorState message={err} /></div>}
      {controls.length === 0 ? (
        <EmptyState title="No controls yet" hint="Run security analysis from the Blueprint pipeline." />
      ) : (
        <>
          <div className="mb-3.5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
            {CATS.map((cat) => {
              const has = controls.filter((c) => inCat(`${c.title} ${c.description}`, cat.keys));
              const flagged = issues.filter((i) => inCat(`${i.description} ${i.check}`, cat.keys));
              const ok = has.length > 0 && flagged.length === 0;
              return (
                <Card key={cat.label}>
                  <p className="flex items-center gap-1.5 text-[13.5px] font-semibold">
                    {ok ? <CheckCircle2 size={15} className="text-success" aria-hidden /> : <AlertTriangle size={15} className="text-warning" aria-hidden />}
                    {cat.label}
                  </p>
                  <p className="mt-1 text-[12px] text-secondary">{has.length} controls{flagged.length > 0 && ` · ${flagged.length} open issues`}</p>
                </Card>
              );
            })}
          </div>
          <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="grid gap-2.5">
              {controls.map((s) => (
                <button key={s.code} onClick={() => setSel(s.code)}
                  className={`rounded-2xl border p-4 text-left transition-colors ${sel === s.code ? "border-accent bg-elevated" : "border-border bg-surface hover:border-accent"}`}>
                  <p className="flex items-center justify-between gap-2">
                    <code className="font-mono text-[12.5px] font-bold text-accent">{s.code}</code>
                    <StatusBadge value={s.scope} />
                  </p>
                  <p className="mt-1 text-[13.5px] font-semibold">{s.title}</p>
                  <p className="mt-0.5 text-[12.5px] text-secondary">{s.description}</p>
                </button>
              ))}
            </div>
            <div>
              {selected ? (
                <Card>
                  <p className="font-mono text-[12.5px] font-bold">{selected.code}</p>
                  <p className="mt-1 text-[14px] font-semibold">{selected.title}</p>
                  <p className="mt-1 text-[13px] text-secondary">{selected.description}</p>
                  <p className="mt-3 text-[12px] font-bold uppercase tracking-[0.06em] text-muted">Linked artifacts</p>
                  <p className="mt-1 flex flex-wrap gap-1.5">
                    {selLinks.length === 0 ? <span className="text-[12.5px] text-secondary">No links yet — confirm in Traceability.</span>
                      : selLinks.map((l, i) => <ArtifactLink key={i} code={l.from.startsWith("security:") ? l.to : l.from} />)}
                  </p>
                </Card>
              ) : (
                <EmptyState title="No control selected" hint="Click a control to inspect its links." />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
