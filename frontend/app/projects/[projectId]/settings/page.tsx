"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Activity, Cpu, Database, Moon, Sun, Trash2 } from "lucide-react";
import { api, me, logout } from "../../../../lib/api/client";
import { getHealth } from "../../../../lib/api/endpoints";
import { useShell } from "../../../../components/shell/context";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { LoadingState, ErrorState, EmptyState } from "../../../../components/ui/feedback";
import { StatusBadge } from "../../../../components/ui/badge";
import { Dialog } from "../../../../components/ui/overlay";
import { ThemeToggle } from "../../../../components/ui/theme-toggle";

/** Settings: session, system diagnostics, theme, and project management. */
type SessionUser = { name?: string; email?: string };
type Health = { status: string; db?: string; llm?: string; env?: string };

export default function Settings() {
  const { projectId: pid } = useParams() as { projectId: string };
  const router = useRouter();
  const { project, reload } = useShell();
  const [health, setHealth] = useState<Health | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [err, setErr] = useState("");

  const [projName, setProjName] = useState("");
  const [projDesc, setProjDesc] = useState("");
  const [editingProj, setEditingProj] = useState(false);
  const [savingProj, setSavingProj] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    getHealth().then(setHealth).catch((e) => setErr(e.message));
    me().then((u) => setUser((u as SessionUser) || null)).catch(() => {});
  }, []);

  useEffect(() => {
    if (project) {
      setProjName(project.name || "");
      setProjDesc(project.description || "");
    }
  }, [project]);

  const saveProject = async () => {
    if (!projName.trim()) return;
    setSavingProj(true);
    try {
      await api(`/projects/${pid}`, {
        method: "PATCH",
        body: { name: projName.trim(), description: projDesc.trim() },
      });
      await reload();
      setEditingProj(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to update project.");
    } finally {
      setSavingProj(false);
    }
  };

  const deleteProject = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await api(`/projects/${pid}`, { method: "DELETE" });
      router.push("/dashboard");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to delete project.");
      setDeleting(false);
    }
  };

  if (err && !health) return <ErrorState message={err} />;
  if (!health) return <LoadingState stage="Loading system status" />;

  return (
    <div>
      <h1 className="text-[24px] font-bold tracking-tight">Settings</h1>
      <p className="mb-5 text-[13.5px] text-secondary">Session, appearance, project configuration, and diagnostics.</p>
      
      {err && <div className="mb-3"><ErrorState message={err} /></div>}

      <div className="grid gap-3.5 md:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-semibold">Project details</h3>
            {!editingProj ? (
              <Button size="sm" variant="ghost" onClick={() => setEditingProj(true)}>Edit</Button>
            ) : (
              <div className="flex gap-1.5">
                <Button size="sm" loading={savingProj} onClick={saveProject}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => {
                  setProjName(project?.name || "");
                  setProjDesc(project?.description || "");
                  setEditingProj(false);
                }}>Cancel</Button>
              </div>
            )}
          </div>
          {editingProj ? (
            <div className="mt-3 grid gap-2.5">
              <label className="block text-[13px] font-medium text-secondary">
                Project Name
                <input value={projName} onChange={(e) => setProjName(e.target.value)}
                  className="mt-1 h-10 w-full rounded-md border border-border bg-canvas px-3 text-[13.5px] focus:border-primary focus:outline-none" />
              </label>
              <label className="block text-[13px] font-medium text-secondary">
                Description
                <textarea rows={2} value={projDesc} onChange={(e) => setProjDesc(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-canvas p-2.5 text-[13px] focus:border-primary focus:outline-none" />
              </label>
            </div>
          ) : (
            <div className="mt-3">
              <p className="text-[14.5px] font-semibold text-primary">{project?.name || "Untitled Project"}</p>
              <p className="mt-1 text-[13px] text-secondary">{project?.description || "No description set."}</p>
              <p className="mt-2 font-mono text-[11.5px] text-muted">ID: {pid}</p>
            </div>
          )}
        </Card>

        <Card>
          <h3 className="mb-2 text-[15px] font-semibold">Appearance</h3>
          <p className="text-[13px] text-secondary">Toggle between editorial light canvas and high-fidelity dark mode.</p>
          <div className="mt-3 flex items-center gap-3">
            <ThemeToggle />
            <span className="text-[13px] font-medium text-primary">Switch theme</span>
          </div>
        </Card>

        <Card>
          <h3 className="mb-2 text-[15px] font-semibold">Session</h3>
          {user ? (
            <><p className="text-[13.5px]"><b>{user.name || user.email}</b></p>
            <p className="font-mono text-[12px] text-secondary">{user.email}</p></>
          ) : <EmptyState title="No session" hint="Log in from the dashboard." />}
          <div className="mt-3"><Button variant="ghost" onClick={logout}>Log out</Button></div>
        </Card>

        <Card>
          <h3 className="mb-3 flex items-center gap-2 text-[15px] font-semibold"><Activity size={15} />System status</h3>
          <div className="grid gap-2 text-[13px]">
            <p className="flex items-center justify-between">API <StatusBadge value={health.status === "ok" ? "approved" : health.status} /></p>
            <p className="flex items-center justify-between"><span className="flex items-center gap-1.5"><Database size={13} />Database</span><code className="font-mono text-[12px]">{health.db}</code></p>
            <p className="flex items-center justify-between"><span className="flex items-center gap-1.5"><Cpu size={13} />LLM provider</span><code className="font-mono text-[12px]">{health.llm}</code></p>
            <p className="flex items-center justify-between">Environment<code className="font-mono text-[12px]">{health.env}</code></p>
          </div>
        </Card>

        <Card className="border-danger/30 md:col-span-2">
          <h3 className="mb-1 text-[15px] font-semibold text-danger">Danger Zone</h3>
          <p className="text-[13px] text-secondary">Deleting this project will permanently erase all requirements, architecture, schemas, tasks, and test plans.</p>
          <div className="mt-3">
            <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
              <Trash2 size={14} />Delete this project
            </Button>
          </div>
        </Card>
      </div>

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Permanently delete project?">
        <p className="text-[13.5px] text-secondary">
          Are you sure you want to delete <b>{project?.name || "this project"}</b>? All blueprints, traceability records, and specifications will be destroyed. This cannot be undone.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button variant="danger" loading={deleting} onClick={deleteProject}>Permanently delete</Button>
        </div>
      </Dialog>
    </div>
  );
}

