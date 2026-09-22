"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "../../../../lib/api";
import { Status, Loading, ErrorBox, Empty } from "../../../../components/ui";

/** Implementation plan (§12): epics → tasks with requirement links and live status. */
const NEXT: Record<string, string> = { todo: "doing", doing: "done", done: "todo" };

export default function Tasks() {
  const { projectId: pid } = useParams() as { projectId: string };
  const [tasks, setTasks] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = () => api(`/projects/${pid}/tasks`).then((r) => { setTasks(r); setLoaded(true); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const advance = async (t: any) => {
    await api(`/projects/${pid}/tasks/${t.id}`, { method: "PATCH", body: JSON.stringify({ status: NEXT[t.status] || "todo" }) });
    await load();
  };

  if (err && !loaded) return <ErrorBox message={err} onRetry={load} />;
  if (!loaded) return <Loading stage="Loading implementation plan" />;

  const epics: Record<string, any[]> = {};
  tasks.forEach((t) => { (epics[t.epic || "MVP"] = epics[t.epic || "MVP"] || []).push(t); });

  return (
    <div>
      <h1>Tasks</h1>
      <p className="sub">Epics → tasks → requirements. Status is yours to advance.</p>
      {err && <ErrorBox message={err} />}
      {tasks.length === 0 ? (
        <Empty title="No tasks yet" hint="Generate the plan from the Overview pipeline." />
      ) : Object.entries(epics).map(([epic, list]) => (
        <div className="card" key={epic}>
          <h3>{epic}</h3>
          <table>
            <thead><tr><th>ID</th><th>Title</th><th>Req</th><th>Priority</th><th>Status</th><th></th></tr></thead>
            <tbody>{list.map((t) => (
              <tr key={t.id}>
                <td className="mono">{t.code}</td>
                <td>{t.title}</td>
                <td className="mono">{t.req}</td>
                <td>{t.priority}</td>
                <td><Status value={t.status} /></td>
                <td><button className="ghost" onClick={() => advance(t)}>→ {NEXT[t.status] || "todo"}</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
