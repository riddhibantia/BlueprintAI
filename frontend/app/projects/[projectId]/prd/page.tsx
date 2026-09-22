"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "../../../../lib/api";
import { Status, Loading, ErrorBox, Empty } from "../../../../components/ui";

/** PRD viewer + editor (§6.4: the PRD remains editable, approval is explicit). */
export default function Prd() {
  const { projectId: pid } = useParams() as { projectId: string };
  const [prd, setPrd] = useState<any>(null);
  const [draft, setDraft] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState("");

  const load = () => api(`/projects/${pid}/prd`).then((r) => { setPrd(r); setDraft(r.content || {}); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const save = async (status?: string) => {
    try {
      await api(`/projects/${pid}/prd`, { method: "PUT", body: JSON.stringify({ content: draft, status }) });
      setEditing(false);
      await load();
    } catch (e: any) { setErr(e.message); }
  };

  if (err && !prd) return <ErrorBox message={err} onRetry={load} />;
  if (!prd) return <Loading stage="Loading PRD" />;
  if (!prd.content || Object.keys(prd.content).length === 0)
    return <Empty title="No PRD yet" hint="Generate it from the Overview pipeline after approving requirements." />;

  const setSection = (key: string, text: string) => {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    setDraft({ ...draft, [key]: Array.isArray(draft[key]) ? lines : text });
  };

  return (
    <div>
      <div className="spread">
        <div><h1>PRD</h1><p className="sub">Structured product requirements — generated, then yours to edit.</p></div>
        <Status value={prd.status || "draft"} />
      </div>
      {err && <ErrorBox message={err} />}
      <div className="card">
        <div className="row">
          {!editing
            ? <><button className="ghost" onClick={() => setEditing(true)}>Edit</button>
                {prd.status !== "approved" && <button onClick={() => save("approved")}>Approve PRD</button>}</>
            : <><button onClick={() => save(prd.status)}>Save</button>
                <button className="ghost" onClick={() => { setEditing(false); setDraft(prd.content); }}>Cancel</button></>}
        </div>
      </div>
      {Object.entries(prd.content && editing ? draft : prd.content).map(([key, val]: [string, any]) => (
        <div className="card" key={key}>
          <h3 style={{ textTransform: "capitalize" }}>{key.replace(/_/g, " ")}</h3>
          {editing ? (
            <textarea rows={Array.isArray(val) ? Math.max(3, val.length + 1) : 3}
              value={Array.isArray(val) ? val.join("\n") : String(val ?? "")}
              onChange={(e) => setSection(key, e.target.value)} aria-label={key} />
          ) : Array.isArray(val) ? (
            <ul>{val.map((v: string, i: number) => <li key={i}>{v}</li>)}</ul>
          ) : <p>{String(val ?? "")}</p>}
        </div>
      ))}
    </div>
  );
}
