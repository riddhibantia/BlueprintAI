"use client";
import { useEffect, useState } from "react";
import { FolderKanban, LogOut, Plus } from "lucide-react";
import { api, me, logout } from "../../lib/api/client";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { StatusBadge } from "../../components/ui/badge";
import { LoadingState, ErrorState, EmptyState } from "../../components/ui/feedback";

/** Workspace dashboard: session gate, project creation, project list (no diagnostics here §9). */
export default function Dashboard() {
  const [authed, setAuthed] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [projects, setProjects] = useState<any[]>([]);
  const [idea, setIdea] = useState("Build an employee expense management platform.");
  const [state, setState] = useState<"idle" | "loading" | "error">("loading");
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const user = await me();
        if (user) {
          setAuthed(true);
          setProjects(await api("/projects"));
        }
        setState("idle");
      } catch (e: any) {
        setErr(e.message || "Backend unreachable. Start FastAPI on :8000.");
        setState("error");
      }
    })();
  }, []);

  const auth = async () => {
    try {
      await api(mode === "login" ? "/auth/login" : "/auth/register", {
        method: "POST", body: JSON.stringify({ email, password, name }),
      });
      setAuthed(true);
      setProjects(await api("/projects"));
      setState("idle");
    } catch (e: any) { setErr(e.message); setState("error"); }
  };

  const create = async () => {
    const p = await api("/projects", {
      method: "POST",
      body: JSON.stringify({ name: idea.slice(0, 60), product_idea: idea }),
    });
    window.location.href = `/projects/${p.id}`;
  };

  if (state === "loading") return <div className="mx-auto max-w-[720px] px-5 py-10"><LoadingState stage="Connecting to workspace backend" /></div>;
  if (state === "error" && !authed)
    return <div className="mx-auto max-w-[720px] px-5 py-10"><ErrorState message={err} onRetry={() => window.location.reload()} /></div>;

  if (!authed)
    return (
      <div className="mx-auto max-w-[720px] px-5 py-10">
        <p className="mb-1 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.08em] text-accent">
          <FolderKanban size={14} />DevBlueprint
        </p>
        <h1 className="text-[30px] font-bold tracking-tight">Engineering blueprints,<br />kept honest.</h1>
        <p className="mt-2 text-[14.5px] text-secondary">Idea → requirements → artifacts → relationships → validation → impact → approval.</p>
        <Card className="mt-6 max-w-[420px]">
          <div className="mb-3 flex gap-2" role="tablist" aria-label="Auth mode">
            <button role="tab" aria-selected={mode === "login"} onClick={() => setMode("login")}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium ${mode === "login" ? "bg-elevated text-primary" : "text-secondary"}`}>Log in</button>
            <button role="tab" aria-selected={mode === "register"} onClick={() => setMode("register")}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium ${mode === "register" ? "bg-elevated text-primary" : "text-secondary"}`}>Sign up</button>
          </div>
          <label className="block text-[13px]">Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@team.com" autoComplete="email"
              className="mt-1 w-full rounded-xl border border-border bg-canvas px-3 py-2" /></label>
          <label className="mt-2 block text-[13px]">Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="•••••••• (min 8)"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className="mt-1 w-full rounded-xl border border-border bg-canvas px-3 py-2" /></label>
          {mode === "register" && (
            <label className="mt-2 block text-[13px]">Name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada"
                className="mt-1 w-full rounded-xl border border-border bg-canvas px-3 py-2" /></label>
          )}
          <div className="mt-3"><Button onClick={auth}>{mode === "login" ? "Log in" : "Create account"}</Button></div>
          {state === "error" && err && <p className="mt-2 text-[13px] text-danger">{err}</p>}
        </Card>
      </div>
    );

  return (
    <div className="mx-auto max-w-[960px] px-5 py-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight">Projects</h1>
          <p className="text-[13.5px] text-secondary">Select a workspace — or describe a new product idea.</p>
        </div>
        <Button variant="ghost" onClick={logout}><LogOut size={14} />Log out</Button>
      </div>
      <Card className="mb-4">
        <h3 className="mb-1 text-[15px] font-semibold">New project</h3>
        <textarea rows={2} value={idea} onChange={(e) => setIdea(e.target.value)} aria-label="Product idea"
          className="w-full rounded-xl border border-border bg-canvas p-2.5 text-[13.5px]" />
        <div className="mt-2"><Button onClick={create}><Plus size={14} />Create project</Button></div>
      </Card>
      {projects.length === 0 ? (
        <EmptyState title="No projects yet" hint="Describe your product idea above to get started." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {projects.map((p) => (
            <a key={p.id} href={`/projects/${p.id}`}
              className="rounded-2xl border border-border bg-surface p-4 transition-all duration-150 hover:-translate-y-0.5 hover:border-accent">
              <p className="flex items-center justify-between gap-2"><b className="text-[14.5px]">{p.name}</b><StatusBadge value={p.status || "draft"} /></p>
              <p className="mt-1 line-clamp-2 text-[13px] text-secondary">{p.idea}</p>
              <p className="mt-2 text-[12.5px] font-semibold text-accent">Open workspace →</p>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
