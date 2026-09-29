"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FolderKanban, LogOut, Plus } from "lucide-react";
import { api, me, logout } from "../../lib/api/client";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { StatusBadge } from "../../components/ui/badge";
import { LoadingState, ErrorState, EmptyState } from "../../components/ui/feedback";

type Project = { id: string; name: string; idea?: string; status?: string };

/** Workspace dashboard: session gate, project creation, project list (no diagnostics here §9). */
export default function Dashboard() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [idea, setIdea] = useState("Build an employee expense management platform.");
  const [state, setState] = useState<"idle" | "loading" | "busy">("loading");
  const [fatal, setFatal] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [authError, setAuthError] = useState("");
  const [createError, setCreateError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await me();
        if (cancelled) return;
        if (user) {
          setAuthed(true);
          setProjects(await api<Project[]>("/projects"));
        }
        setState("idle");
      } catch {
        if (cancelled) return;
        // Initial load failure (API down) is the only fatal case — validation
        // and auth errors stay inline so the form is never unmounted.
        setFatal("Can't reach the API. Start it with: uvicorn app.main:app --app-dir backend --port 8000");
        setState("idle");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const auth = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setFieldError("Enter a valid email address."); return; }
    if (password.length < 8) { setFieldError("Password must be at least 8 characters."); return; }
    setFieldError("");
    setAuthError("");
    setState("busy");
    try {
      await api(mode === "login" ? "/auth/login" : "/auth/register", {
        method: "POST", body: { email: email.trim(), password, name: name.trim() },
      });
      setAuthed(true);
      setProjects(await api<Project[]>("/projects"));
      setState("idle");
    } catch (err) { setAuthError(err instanceof Error ? err.message : "Authentication failed."); setState("idle"); }
  };

  const create = async () => {
    const trimmed = idea.trim();
    if (!trimmed) { setCreateError("Describe your product idea first."); return; }
    setCreateError("");
    setState("busy");
    try {
      const p = await api<{ id: string }>("/projects", {
        method: "POST",
        body: { name: trimmed.slice(0, 60), product_idea: trimmed },
      });
      router.push(`/projects/${p.id}`);
    } catch (e) { setCreateError(e instanceof Error ? e.message : "Could not create project."); setState("idle"); }
  };

  if (state === "loading") return <div className="mx-auto max-w-[720px] px-5 py-10"><LoadingState stage="Connecting to workspace backend" /></div>;
  if (fatal && !authed)
    return <div className="mx-auto max-w-[720px] px-5 py-10"><ErrorState message={fatal} onRetry={() => window.location.reload()} /></div>;

  if (!authed)
    return (
      <div className="mx-auto max-w-[720px] px-5 py-10">
        <p className="mb-1 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.08em] text-accent">
          <FolderKanban size={14} />BlueprintAI
        </p>
        <h1 className="text-[30px] font-bold tracking-tight">Engineering blueprints,<br />kept honest.</h1>
        <p className="mt-2 text-[14.5px] text-secondary">Idea → requirements → artifacts → relationships → validation → impact → approval.</p>
        <Card className="mt-6 max-w-[420px]">
          <div className="mb-3 flex gap-2" role="tablist" aria-label="Auth mode">
            <button role="tab" aria-selected={mode === "login"} onClick={() => { setMode("login"); setFieldError(""); setAuthError(""); }}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium ${mode === "login" ? "bg-elevated font-semibold text-primary" : "text-secondary hover:text-primary"}`}>Log in</button>
            <button role="tab" aria-selected={mode === "register"} onClick={() => { setMode("register"); setFieldError(""); setAuthError(""); }}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium ${mode === "register" ? "bg-elevated font-semibold text-primary" : "text-secondary hover:text-primary"}`}>Sign up</button>
          </div>
          <form onSubmit={auth} noValidate>
            <label className="block text-[13px]">Email
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@team.com" autoComplete="email"
                aria-invalid={!!fieldError} aria-describedby={fieldError ? "auth-field-error" : undefined}
                className="mt-1 w-full rounded-xl border border-border bg-canvas px-3 py-2 placeholder:text-muted focus:border-accent focus:outline-none" /></label>
            <label className="mt-2 block text-[13px]">Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="•••••••• (min 8)"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                aria-invalid={!!fieldError} aria-describedby={fieldError ? "auth-field-error" : undefined}
                className="mt-1 w-full rounded-xl border border-border bg-canvas px-3 py-2 placeholder:text-muted focus:border-accent focus:outline-none" /></label>
            {mode === "register" && (
              <label className="mt-2 block text-[13px]">Name
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada" autoComplete="name"
                  className="mt-1 w-full rounded-xl border border-border bg-canvas px-3 py-2 placeholder:text-muted focus:border-accent focus:outline-none" /></label>
            )}
            <div className="mt-3">
              <Button type="submit" loading={state === "busy"}>{mode === "login" ? "Log in" : "Create account"}</Button>
            </div>
            {fieldError && <p id="auth-field-error" className="mt-2 text-[13px] text-danger" role="alert">{fieldError}</p>}
            {authError && <p className="mt-2 text-[13px] text-danger" role="alert">{authError}</p>}
          </form>
        </Card>
        <p className="mt-4 text-[12.5px] text-muted"><Link href="/" className="text-accent hover:underline">← What is BlueprintAI?</Link></p>
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
        <h2 className="mb-1 text-[15px] font-semibold">New project</h2>
        <label className="sr-only" htmlFor="new-idea">Product idea</label>
        <textarea id="new-idea" rows={2} value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="Describe the product to blueprint…"
          className="w-full rounded-xl border border-border bg-canvas p-2.5 text-[13.5px] placeholder:text-muted" />
        <div className="mt-2 flex items-center gap-2">
          <Button onClick={create} loading={state === "busy"}><Plus size={14} />Create project</Button>
          {createError && <p className="text-[13px] text-danger" role="alert">{createError}</p>}
        </div>
      </Card>
      {projects.length === 0 ? (
        <EmptyState title="No projects yet" hint="Describe your product idea above to get started." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} prefetch
              className="rounded-2xl border border-border bg-surface p-4 transition-colors duration-150 hover:border-accent focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2">
              <p className="flex items-center justify-between gap-2"><b className="truncate text-[14.5px]">{p.name}</b>{p.status && <StatusBadge value={p.status} />}</p>
              {p.idea && <p className="mt-1 line-clamp-2 text-[13px] text-secondary">{p.idea}</p>}
              <p className="mt-2 text-[12.5px] font-semibold text-accent">Open workspace →</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
