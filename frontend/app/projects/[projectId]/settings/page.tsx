"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { Activity, Cpu, Database, Moon, Sun, Trash2 } from "lucide-react";
import { api, me, logout } from "../../../../lib/api/client";
import { getHealth, changePassword } from "../../../../lib/api/endpoints";
import { useShell } from "../../../../components/shell/context";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { LoadingState, ErrorState, EmptyState } from "../../../../components/ui/feedback";
import { ThemeToggle } from "../../../../components/ui/theme-toggle";

interface Health {
  status: string;
  db: string;
  llm_provider: string;
  embedding_provider?: string;
}

interface SessionUser {
  id: string;
  email: string;
  name?: string;
}

export default function Settings() {
  const { projectId: pid } = useParams() as { projectId: string };
  const { project, reload } = useShell();
  const router = useRouter();

  const [health, setHealth] = useState<Health | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [err, setErr] = useState("");
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  const [projName, setProjName] = useState("");
  const [projDesc, setProjDesc] = useState("");
  const [editingProj, setEditingProj] = useState(false);
  const [savingProj, setSavingProj] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    getHealth().then(setHealth).catch((e) => setErr(e.message));
    me().then((u) => setUser((u as unknown as SessionUser) || null)).catch(() => {});
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

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (pwNew.length < 8) { setPwMsg("New password must be at least 8 characters."); return; }
    setPwBusy(true);
    setPwMsg("");
    try {
      const r = await changePassword(pwCurrent, pwNew);
      setPwMsg(r.message || "Password updated.");
      setPwCurrent("");
      setPwNew("");
    } catch (error) {
      setPwMsg(error instanceof Error ? error.message : "Could not update password.");
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <div>
      <h1 className="text-[24px] font-bold tracking-tight">Settings</h1>
      <p className="mb-5 text-[13.5px] text-secondary">Session, password, project configuration, appearance, and diagnostics.</p>

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
            <div className="grid gap-1 text-[13px]">
              <p>Signed in as <b>{user.email}</b></p>
              {user.name && <p className="text-secondary">{user.name}</p>}
            </div>
          ) : <EmptyState title="No session" hint="Log in from the dashboard." />}
          <div className="mt-3"><Button variant="ghost" onClick={logout}>Log out</Button></div>
        </Card>

        <Card>
          <h3 className="mb-2 text-[15px] font-semibold">Change password</h3>
          {user ? (
            <form onSubmit={savePassword} className="grid gap-2">
              <label className="block text-[13px]">Current password
                <input type="password" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)}
                  autoComplete="current-password" required
                  className="mt-1 h-10 w-full rounded-md border border-border bg-canvas px-3 text-[13px] focus:border-primary focus:outline-none" />
              </label>
              <label className="block text-[13px]">New password
                <input type="password" value={pwNew} onChange={(e) => setPwNew(e.target.value)}
                  autoComplete="new-password" minLength={8} required
                  placeholder="At least 8 characters"
                  className="mt-1 h-10 w-full rounded-md border border-border bg-canvas px-3 text-[13px] placeholder:text-muted focus:border-primary focus:outline-none" />
              </label>
              <div><Button type="submit" size="sm" loading={pwBusy}>Update password</Button></div>
              {pwMsg && <p className="text-[12.5px] text-secondary" role="status">{pwMsg}</p>}
            </form>
          ) : <EmptyState title="No session" hint="Log in from the dashboard to change your password." />}
        </Card>

        <Card>
          <h3 className="mb-3 flex items-center gap-2 text-[15px] font-semibold"><Activity size={15} />System status</h3>
          <div className="grid gap-2 text-[13px]">
            <p className="flex items-center justify-between border-b border-border pb-1">
              <span className="text-secondary">Health:</span>
              <span className="font-mono text-success">{health?.status || "—"}</span>
            </p>
            <p className="flex items-center justify-between border-b border-border pb-1">
              <span className="text-secondary">Database:</span>
              <span className="font-mono">{health?.db || "—"}</span>
            </p>
            <p className="flex items-center justify-between">
              <span className="text-secondary">LLM Provider:</span>
              <span className="font-mono text-accent">{health?.llm_provider || "—"}</span>
            </p>
          </div>
        </Card>

        <Card className="border-danger/30">
          <h3 className="mb-2 flex items-center gap-2 text-[15px] font-semibold text-danger"><Trash2 size={15} />Danger Zone</h3>
          <p className="text-[13px] text-secondary">Permanently delete this project, all generated artifacts, documents, and trace links.</p>
          {!deleteOpen ? (
            <div className="mt-3">
              <Button size="sm" variant="danger" onClick={() => setDeleteOpen(true)}>Delete Project</Button>
            </div>
          ) : (
            <div className="mt-3 rounded-lg border border-danger/40 bg-danger/5 p-3">
              <p className="text-[13px] font-medium text-danger">Are you absolutely sure?</p>
              <p className="mt-1 text-[12px] text-secondary">This action cannot be undone.</p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="danger" loading={deleting} onClick={deleteProject}>Yes, Delete</Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
