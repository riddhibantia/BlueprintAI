"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "../../../../lib/api/client";
import { Status, Loading, ErrorBox, Empty } from "../../../../components/ui";

/** Security controls (§11): auth, RBAC, validation — traceable to APIs. */
export default function Security() {
  const { projectId: pid } = useParams() as { projectId: string };
  const [controls, setControls] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = () => api(`/projects/${pid}/security`).then((r) => { setControls(r); setLoaded(true); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  if (err && !loaded) return <ErrorBox message={err} onRetry={load} />;
  if (!loaded) return <Loading stage="Loading security controls" />;

  return (
    <div>
      <h1>Security</h1>
      <p className="sub">Controls with scope — each one links to the API it protects (see Traceability).</p>
      {err && <ErrorBox message={err} />}
      {controls.length === 0 ? (
        <Empty title="No controls yet" hint="Run security analysis from the Overview pipeline." />
      ) : controls.map((s) => (
        <div className="card" key={s.code}>
          <div className="spread"><b className="mono">{s.code}</b><Status value={s.scope} /></div>
          <p><b>{s.title}</b></p>
          <p className="muted">{s.description}</p>
        </div>
      ))}
    </div>
  );
}
