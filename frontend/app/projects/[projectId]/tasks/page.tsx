"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { LayoutGrid, Table2 } from "lucide-react";
import { listTasks } from "../../../../lib/api/endpoints";
import { api } from "../../../../lib/api/client";
import { Card } from "../../../../components/ui/card";
import { StatusBadge } from "../../../../components/ui/badge";
import { DataTable } from "../../../../components/ui/data";
import { LoadingState, ErrorState, EmptyState } from "../../../../components/ui/feedback";
import { ArtifactLink } from "../../../../components/ui/activity";

/** Delivery workspace (§24): table or status board — both from the same real data. */
const COLS = ["todo", "doing", "done"] as const;
const NEXT: Record<string, string> = { todo: "doing", doing: "done", done: "todo" };

export default function Tasks() {
  const { projectId: pid } = useParams() as { projectId: string };
  const [tasks, setTasks] = useState<any[]>([]);
  const [view, setView] = useState<"table" | "board">("board");
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = () => listTasks(pid).then((r) => { setTasks(r); setLoaded(true); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [pid]);

  const advance = async (t: any) => {
    await api(`/projects/${pid}/tasks/${t.id}`, { method: "PATCH", body: JSON.stringify({ status: NEXT[t.status] || "todo" }) });
    await load();
  };

  if (err && !loaded) return <ErrorState message={err} onRetry={load} />;
  if (!loaded) return <LoadingState stage="Loading implementation plan" />;

  const done = tasks.filter((t) => t.status === "done").length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight">Tasks</h1>
          <p className="text-[13px] text-secondary">{tasks.length} tasks · {done} done · epics group the work</p>
        </div>
        <div className="flex gap-1 rounded-full border border-border bg-surface p-1" role="tablist" aria-label="View">
          <button role="tab" aria-selected={view === "board"} onClick={() => setView("board")}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium ${view === "board" ? "bg-elevated text-primary" : "text-secondary"}`}>
            <LayoutGrid size={13} />Board</button>
          <button role="tab" aria-selected={view === "table"} onClick={() => setView("table")}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium ${view === "table" ? "bg-elevated text-primary" : "text-secondary"}`}>
            <Table2 size={13} />Table</button>
        </div>
      </div>
      {err && <div className="mb-3"><ErrorState message={err} /></div>}
      {tasks.length === 0 ? (
        <EmptyState title="No tasks yet" hint="Generate the plan from the Blueprint pipeline." />
      ) : view === "board" ? (
        <div className="grid gap-3 md:grid-cols-3">
          {COLS.map((col) => (
            <div key={col} className="rounded-2xl border border-border bg-canvas/50 p-2.5">
              <p className="px-1.5 py-1 text-[12px] font-bold uppercase tracking-[0.07em] text-secondary">{col} ({tasks.filter((t) => t.status === col).length})</p>
              <div className="grid gap-2">
                {tasks.filter((t) => t.status === col).map((t) => (
                  <Card key={t.id} className="!p-3">
                    <p className="font-mono text-[11.5px] text-accent">{t.code} · {t.epic}</p>
                    <p className="mt-0.5 text-[13px] font-medium">{t.title}</p>
                    <p className="mt-1.5 flex items-center justify-between">
                      <ArtifactLink code={t.req} href={`/projects/${pid}/requirements`} />
                      <button onClick={() => advance(t)} className="text-[12px] font-semibold text-accent hover:underline">→ {NEXT[t.status]}</button>
                    </p>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <DataTable label="Tasks" head={<><th>ID</th><th>Title</th><th>Epic</th><th>Req</th><th>Priority</th><th>Status</th><th></th></>}>
          {tasks.map((t) => (
            <tr key={t.id}>
              <td className="font-mono text-[12.5px]">{t.code}</td>
              <td>{t.title}</td>
              <td className="text-secondary">{t.epic}</td>
              <td><ArtifactLink code={t.req} href={`/projects/${pid}/requirements`} /></td>
              <td className="text-secondary">{t.priority}</td>
              <td><StatusBadge value={t.status} /></td>
              <td><button onClick={() => advance(t)} className="text-[12.5px] font-semibold text-accent hover:underline">→ {NEXT[t.status] || "todo"}</button></td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}
