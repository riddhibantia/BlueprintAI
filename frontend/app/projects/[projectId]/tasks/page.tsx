"use client";
import { useParams } from "next/navigation";
import { LayoutGrid, Table2, ListChecks, GripVertical, CheckCircle2, Clock, CircleDot, ArrowRight, RotateCcw } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { Search } from "lucide-react";
import { useTasks, useRequirements, useWrite } from "../../../../lib/query/useArtifacts";
import { Card } from "../../../../components/ui/card";
import { StatusBadge } from "../../../../components/ui/badge";
import { DataTable, Pagination } from "../../../../components/ui/data";
import { TaskList, type Task } from "../../../../components/ui/task-list";
import { LoadingState, ErrorState } from "../../../../components/ui/feedback";
import { ArtifactLink } from "../../../../components/ui/activity";
import { PrereqBanner, StageEmpty } from "../../../../components/ui/stage";
import { useToast } from "../../../../components/ui/toast";

/** Delivery workspace (§24): drag-and-drop Kanban board, table, or checklist — one shared cache. */
const COLS = ["todo", "doing", "done"] as const;
type ColType = (typeof COLS)[number];

const NEXT: Record<string, string> = { todo: "doing", doing: "done", done: "todo" };
const ADVANCE_LABEL: Record<string, string> = { todo: "Start →", doing: "Complete ✓", done: "Reopen" };

const COL_CONFIG: Record<ColType, { label: string; icon: any; dotClass: string }> = {
  todo: { label: "To Do", icon: CircleDot, dotClass: "text-muted" },
  doing: { label: "In Progress", icon: Clock, dotClass: "text-accent animate-pulse" },
  done: { label: "Completed", icon: CheckCircle2, dotClass: "text-success" },
};

const PRIORITY_BADGES: Record<string, string> = {
  P0: "bg-danger/15 text-danger border-danger/30",
  p0: "bg-danger/15 text-danger border-danger/30",
  P1: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  p1: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  P2: "bg-primary/10 text-primary border-primary/25",
  p2: "bg-primary/10 text-primary border-primary/25",
};

export default function Tasks() {
  const { projectId: pid } = useParams() as { projectId: string };
  const toast = useToast();
  const tasksQ = useTasks(pid);
  const reqsQ = useRequirements(pid);
  const write = useWrite(pid, ["tasks", "activity", "runs", "traceability"]);
  const [view, setView] = useState<"table" | "board" | "checklist">("board");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Drag and Drop state
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<ColType | null>(null);

  // Hooks run before the loading guard — see note in stories/page.tsx.
  const tasks = tasksQ.data || [];

  const filtered = useMemo(() => {
    if (!q.trim()) return tasks;
    const lower = q.toLowerCase();
    return tasks.filter((t: any) =>
      (t.code || "").toLowerCase().includes(lower) ||
      (t.title || "").toLowerCase().includes(lower) ||
      (t.epic || "").toLowerCase().includes(lower)
    );
  }, [tasks, q]);

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [q]);

  if (tasksQ.isLoading || reqsQ.isLoading) return <LoadingState stage="Loading implementation plan" />;
  if (tasksQ.isError) return <ErrorState message={(tasksQ.error as Error)?.message} onRetry={() => tasksQ.refetch()} />;
  const hasReqs = (reqsQ.data || []).length > 0;
  const done = tasks.filter((t: any) => t.status === "done").length;

  const patch = (id: string, status: string) => write.mutate({
    path: `/projects/${pid}/tasks/${id}`, init: { method: "PATCH", body: JSON.stringify({ status }) },
  });

  const advance = (t: any) => {
    const nextStatus = NEXT[t.status] || "todo";
    patch(t.id, nextStatus);
    toast.info(`Updated ${t.code} → ${COL_CONFIG[nextStatus as ColType]?.label || nextStatus}`);
  };

  const handleDrop = (taskId: string, targetCol: ColType) => {
    const targetTask = tasks.find((t: any) => String(t.id) === String(taskId));
    if (!targetTask) return;
    if (targetTask.status === targetCol) return;
    patch(targetTask.id, targetCol);
    toast.success(`Moved ${targetTask.code} to ${COL_CONFIG[targetCol].label}`);
  };

  const checkItems: Task[] = tasks.map((t: any) => ({ id: String(t.id), label: `${t.code} · ${t.title}`, done: t.status === "done" }));
  const onCheck = (next: Task[]) => {
    const prev = new Map(checkItems.map((t) => [t.id, t.done]));
    const flipped = next.find((t) => prev.get(t.id) !== t.done);
    if (!flipped) return;
    const target = tasks.find((t: any) => String(t.id) === flipped.id);
    if (target) patch(target.id, flipped.done ? "done" : "todo");
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight">Tasks</h1>
          <p className="text-[13px] text-secondary">{tasks.length} tasks · {done} done · drag cards between columns</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <label htmlFor="task-search" className="sr-only">Search tasks or epics</label>
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <input id="task-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks or epics…"
              className="w-56 rounded-full border border-border bg-surface py-2 pl-9 pr-3 text-[13px] placeholder:text-muted focus:border-accent focus:outline-none" />
          </div>
          <div className="flex gap-1 rounded-full border border-border bg-surface p-1" role="tablist" aria-label="View">
            {([["board", LayoutGrid], ["table", Table2], ["checklist", ListChecks]] as const).map(([v, Icon]) => (
              <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium capitalize ${view === v ? "bg-elevated text-primary" : "text-secondary hover:text-primary"}`}>
                <Icon size={13} />{v}</button>
            ))}
          </div>
        </div>
      </div>
      {write.isError && <div className="mb-3"><ErrorState message={(write.error as Error)?.message} /></div>}
      {tasks.length === 0 ? (
        <div>
          {!hasReqs && (
            <PrereqBanner text="Tasks are cut from requirements — generate them first."
              href={`/projects/${pid}/requirements`} action="Go to Requirements" />
          )}
          <StageEmpty pageTitle="Tasks" title="No tasks yet" hint="Generate the implementation plan with requirement links."
            actionLabel="Generate tasks" generating={write.isPending}
            disabledReason={!hasReqs ? "Waiting on requirements." : undefined}
            onGenerate={() => write.mutate({ path: `/projects/${pid}/tasks/generate`, init: { method: "POST" } })} />
          {write.isError && <div className="mt-3"><ErrorState message={(write.error as Error)?.message} /></div>}
        </div>
      ) : view === "checklist" ? (
        <Card className="max-w-xl">
          <TaskList tasks={checkItems} onTasksChange={onCheck} accent="var(--color-accent)" aria-label="Task checklist" />
        </Card>
      ) : view === "board" ? (
        <div className="grid gap-3 md:grid-cols-3">
          {COLS.map((col) => {
            const conf = COL_CONFIG[col];
            const ColIcon = conf.icon;
            const colTasks = filtered.filter((t: any) => t.status === col);
            const isOver = dragOverCol === col;

            return (
              <div
                key={col}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragOverCol !== col) setDragOverCol(col);
                }}
                onDragLeave={(e) => {
                  if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                  setDragOverCol(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const droppedId = e.dataTransfer.getData("text/plain");
                  setDragOverCol(null);
                  setDraggingTaskId(null);
                  if (droppedId) handleDrop(droppedId, col);
                }}
                className={`flex min-h-[460px] flex-col rounded-2xl border p-2.5 transition-all duration-150 ${
                  isOver
                    ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                    : "border-border bg-canvas/60"
                }`}
              >
                <div className="mb-2.5 flex items-center justify-between px-1.5 py-1">
                  <div className="flex items-center gap-2">
                    <ColIcon size={14} className={conf.dotClass} />
                    <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-primary">{conf.label}</span>
                  </div>
                  <span className="rounded-full bg-elevated px-2 py-0.5 font-mono text-[11px] font-semibold text-secondary">
                    {colTasks.length}
                  </span>
                </div>

                <div className="flex flex-1 flex-col gap-2">
                  {colTasks.map((t: any) => {
                    const isDragging = draggingTaskId === String(t.id);
                    const priClass = PRIORITY_BADGES[t.priority] || "bg-subtle text-secondary border-border";

                    return (
                      <Card
                        key={t.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", String(t.id));
                          e.dataTransfer.effectAllowed = "move";
                          setDraggingTaskId(String(t.id));
                        }}
                        onDragEnd={() => {
                          setDraggingTaskId(null);
                          setDragOverCol(null);
                        }}
                        className={`group relative !p-3 cursor-grab active:cursor-grabbing transition-all select-none ${
                          isDragging
                            ? "opacity-30 scale-95 border-dashed border-primary"
                            : "hover:border-border-strong hover:shadow-xs"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <div className="flex items-center gap-1.5 overflow-hidden">
                            <GripVertical size={13} className="flex-none text-muted opacity-40 group-hover:opacity-100 transition-opacity" aria-hidden />
                            <span className="font-mono text-[11px] font-bold text-accent truncate">{t.code}</span>
                          </div>
                          {t.priority && (
                            <span className={`rounded border px-1.5 py-0.2 text-[10px] font-mono font-bold uppercase tracking-wider ${priClass}`}>
                              {t.priority}
                            </span>
                          )}
                        </div>

                        <p className="text-[13px] font-medium leading-snug line-clamp-3">{t.title}</p>

                        {t.epic && (
                          <div className="mt-1.5">
                            <span className="inline-block rounded bg-surface px-1.5 py-0.5 text-[10.5px] font-medium text-secondary border border-border/70 truncate max-w-full">
                              {t.epic}
                            </span>
                          </div>
                        )}

                        <div className="mt-2.5 flex items-center justify-between border-t border-border/60 pt-2 text-[11.5px]">
                          <ArtifactLink code={t.req} href={`/projects/${pid}/requirements`} />
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); advance(t); }}
                            disabled={write.isPending}
                            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold text-accent transition-colors hover:bg-elevated hover:underline disabled:opacity-50"
                          >
                            {ADVANCE_LABEL[t.status] || "→"}
                          </button>
                        </div>
                      </Card>
                    );
                  })}

                  {colTasks.length === 0 && !isOver && (
                    <div className="grid flex-1 place-items-center rounded-xl border border-dashed border-border/60 p-4 text-center">
                      <p className="text-[12px] text-muted">No {conf.label.toLowerCase()} tasks</p>
                    </div>
                  )}

                  {isOver && (
                    <div className="rounded-xl border-2 border-dashed border-primary/60 bg-primary/10 p-3 text-center text-[12px] font-semibold text-accent animate-pulse">
                      Drop into {conf.label}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <>
        <DataTable label="Tasks" head={<><th>ID</th><th>Title</th><th>Epic</th><th>Req</th><th>Priority</th><th>Status</th><th></th></>}>
          {paginated.map((t: any) => (
            <tr key={t.id}>
              <td className="font-mono text-[12.5px]">{t.code}</td>
              <td>{t.title}</td>
              <td className="text-secondary">{t.epic}</td>
              <td><ArtifactLink code={t.req} href={`/projects/${pid}/requirements`} /></td>
              <td className="text-secondary">{t.priority}</td>
              <td><StatusBadge value={t.status} /></td>
              <td><button onClick={() => advance(t)} disabled={write.isPending} className="text-[12.5px] font-semibold text-accent hover:underline disabled:opacity-50">{ADVANCE_LABEL[t.status] || "→ todo"}</button></td>
            </tr>
          ))}
        </DataTable>
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          onPageChange={setPage}
          totalItems={filtered.length}
          pageSize={pageSize}
        />
        </>
      )}
    </div>
  );
}
