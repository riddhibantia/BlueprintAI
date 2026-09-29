"use client";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Eye, EyeOff, FolderKanban, GitBranch, LogOut, Plus, Scale } from "lucide-react";
import { api, me, logout } from "../../lib/api/client";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { StatusBadge } from "../../components/ui/badge";
import { LoadingState, ErrorState, EmptyState } from "../../components/ui/feedback";

type Project = { id: string; name: string; idea?: string; status?: string };

const STOP = new Set("a,an,the,to,for,of,and,or,with,app,application,my,our,new,do,does,did,make,build,create".split(","));

/** Short title-case project name from a raw idea (B7: never use the raw sentence). */
export function shortName(idea: string): string {
  const words = idea.replace(/[^a-zA-Z0-9\s]/g, " ").split(/\s+/).filter(Boolean)
    .filter((w) => !STOP.has(w.toLowerCase()));
  const picked = words.slice(0, 4);
  const title = (picked.length > 0 ? picked : words.slice(0, 4))
    .map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
  return (title || "Untitled project").slice(0, 48);
}

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
  const [showPw, setShowPw] = useState(false);
  const pwStrength = password.length === 0 ? "" : password.length < 8 ? "Too short (min 8)" : password.length < 12 ? "OK" : "Strong";

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
        body: { name: shortName(trimmed), product_idea: trimmed },
      });
      router.push(`/projects/${p.id}`);
    } catch (e) { setCreateError(e instanceof Error ? e.message : "Could not create project."); setState("idle"); }
  };

  if (state === "loading") return <div className="mx-auto max-w-[720px] px-5 py-10"><LoadingState stage="Connecting to workspace backend" /></div>;
  if (fatal && !authed)
    return <div className="mx-auto max-w-[720px] px-5 py-10"><ErrorState message={fatal} onRetry={() => window.location.reload()} /></div>;

  if (!authed)
    return (
      <div className="mx-auto grid max-w-[960px] items-stretch gap-6 px-5 py-10 md:grid-cols-2 md:py-16">
        <div className="flex flex-col justify-between rounded-2xl bg-[#1a3a3a] p-8 text-[#faf5e8]">
          <div>
            <p className="flex items-center gap-2.5">
              <Image src="/logo.svg" alt="BlueprintAI logo" width={36} height={36} className="rounded-xl" />
              <b className="text-[16px] font-semibold">Blueprint AI</b>
            </p>
            <h1 className="mt-8 text-[32px] font-medium leading-[1.1] md:text-[40px]">Engineering blueprints, kept honest.</h1>
            <p className="mt-3 max-w-[38ch] text-[14.5px] leading-relaxed text-[#faf5e8]/80">Idea → requirements → artifacts → relationships → validation → impact → approval.</p>
          </div>
          <ul className="mt-8 grid gap-2.5 text-[13.5px] text-[#faf5e8]/90">
            <li className="flex items-start gap-2.5"><FolderKanban size={16} className="mt-0.5 flex-none" aria-hidden />RAG-grounded drafts that cite your standards docs.</li>
            <li className="flex items-start gap-2.5"><GitBranch size={16} className="mt-0.5 flex-none" aria-hidden />100% traceability — every link stored, none invented.</li>
            <li className="flex items-start gap-2.5"><Scale size={16} className="mt-0.5 flex-none" aria-hidden />Consistency checks with human approve / reject.</li>
          </ul>
        </div>
        <Card className="w-full self-center">
          <div className="mb-3 flex gap-2" role="tablist" aria-label="Auth mode">
            <button role="tab" aria-selected={mode === "login"} onClick={() => { setMode("login"); setFieldError(""); setAuthError(""); }}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium ${mode === "login" ? "bg-elevated font-semibold text-primary" : "text-secondary hover:text-primary"}`}>Log in</button>
            <button role="tab" aria-selected={mode === "register"} onClick={() => { setMode("register"); setFieldError(""); setAuthError(""); }}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium ${mode === "register" ? "bg-elevated font-semibold text-primary" : "text-secondary hover:text-primary"}`}>Sign up</button>
          </div>
          <form onSubmit={auth} noValidate>
            {mode === "register" && (
              <label className="block text-[13px]">Name
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada" autoComplete="name"
                  className="mt-1 h-11 w-full rounded-xl border border-border bg-canvas px-3.5 py-2 placeholder:text-muted focus:border-primary focus:outline-none" /></label>
            )}
            <label className={`${mode === "register" ? "mt-2 " : ""}block text-[13px]`}>Email
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@team.com" autoComplete="email"
                aria-invalid={!!fieldError} aria-describedby={fieldError ? "auth-field-error" : undefined}
                className="mt-1 h-11 w-full rounded-xl border border-border bg-canvas px-3.5 py-2 placeholder:text-muted focus:border-primary focus:outline-none" /></label>
            <label className="mt-2 block text-[13px]">Password
              <span className="relative mt-1 block">
                <input type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="•••••••• (min 8)"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  aria-invalid={!!fieldError} aria-describedby={fieldError ? "auth-field-error" : undefined}
                  className="h-11 w-full rounded-xl border border-border bg-canvas px-3.5 py-2 pr-10 placeholder:text-muted focus:border-primary focus:outline-none" />
                <button type="button" onClick={() => setShowPw(!showPw)} aria-label={showPw ? "Hide password" : "Show password"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-secondary hover:text-primary">
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </span>
            </label>
            {mode === "register" && pwStrength && (
              <p className="mt-1 text-[12px] text-secondary" role="status">Strength: {pwStrength}</p>
            )}
            <div className="mt-3 flex items-center justify-between gap-2">
              <Button type="submit" loading={state === "busy"}>{mode === "login" ? "Log in" : "Create account"}</Button>
              {mode === "login" && (
                <button type="button" onClick={() => setAuthError("Password reset isn't available in this build — ask your workspace admin.")}
                  className="text-[12.5px] text-secondary hover:text-primary hover:underline">Forgot password?</button>
              )}
            </div>
            {fieldError && <p id="auth-field-error" className="mt-2 text-[13px] text-danger" role="alert">{fieldError}</p>}
            {authError && <p className="mt-2 text-[13px] text-danger" role="alert">{authError}</p>}
          </form>
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
      {projects.length === 0 && (
        <Card className="mb-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">Start here — 3 steps</p>
          <ol className="mt-2 grid gap-2 text-[13.5px] md:grid-cols-3">
            <li className="flex gap-2.5"><span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-primary font-mono text-[12px] font-bold text-canvas" aria-hidden>1</span><span><b>Describe your idea</b> <span className="text-secondary">in the box below, plain words fine.</span></span></li>
            <li className="flex gap-2.5"><span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-primary font-mono text-[12px] font-bold text-canvas" aria-hidden>2</span><span><b>Approve the requirements</b> <span className="text-secondary">we draft — tick them off.</span></span></li>
            <li className="flex gap-2.5"><span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-primary font-mono text-[12px] font-bold text-canvas" aria-hidden>3</span><span><b>We build the rest</b> <span className="text-secondary">— spec, design, tests, PDF.</span></span></li>
          </ol>
        </Card>
      )}
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
              className="group rounded-2xl border border-border bg-surface p-4 transition-colors duration-150 hover:border-border-strong focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2">
              <p className="flex items-center justify-between gap-2"><b className="truncate text-[14.5px] font-semibold">{p.name}</b>{p.status && <StatusBadge value={p.status} />}</p>
              {p.idea && <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-secondary">{p.idea}</p>}
              <p className="mt-3 flex items-center gap-1 border-t border-border pt-2.5 text-[12.5px] font-medium text-muted transition-colors group-hover:text-primary">
                Open workspace <span aria-hidden className="transition-transform duration-150 group-hover:translate-x-0.5">→</span>
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
