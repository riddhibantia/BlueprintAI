"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "../../../../lib/api/client";
import { Status, Loading, ErrorBox, Empty } from "../../../../components/ui";

/** User stories with acceptance criteria, each linked to its source requirement (§7). */
export default function Stories() {
  const { projectId: pid } = useParams() as { projectId: string };
  const [stories, setStories] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = () => api(`/projects/${pid}/stories`).then((r) => { setStories(r); setLoaded(true); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  if (err && !loaded) return <ErrorBox message={err} onRetry={load} />;
  if (!loaded) return <Loading stage="Loading user stories" />;

  return (
    <div>
      <h1>User Stories</h1>
      <p className="sub">Generated from approved requirements — <span className="mono">US-001</span> links back to its <span className="mono">REQ</span>.</p>
      {err && <ErrorBox message={err} />}
      {stories.length === 0 ? (
        <Empty title="No stories yet" hint="Generate them from the Overview pipeline once requirements are approved." />
      ) : stories.map((s) => (
        <div className="card" key={s.code}>
          <div className="spread">
            <b className="mono">{s.code}</b>
            <span className="row"><code>{s.req}</code><Status value={s.status} /></span>
          </div>
          <p><b>{s.title}</b></p>
          <p className="muted">{s.story}</p>
          <b>Acceptance criteria</b>
          <ul>{(s.acceptance || []).map((a: string, i: number) => <li key={i}>{a}</li>)}</ul>
        </div>
      ))}
    </div>
  );
}
