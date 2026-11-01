"use client";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Eye, EyeOff, FolderKanban, GitBranch, LogOut, Pencil, Plus, Scale, Search, Sparkles, Trash2 } from "lucide-react";
import { api, me, logout } from "../../lib/api/client";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { StatusBadge } from "../../components/ui/badge";
import { LoadingState, ErrorState, EmptyState, ErrorSummary, FieldError } from "../../components/ui/feedback";
import { Dialog } from "../../components/ui/overlay";
import { ThemeToggle } from "../../components/ui/theme-toggle";
import { useToast } from "../../components/ui/toast";

type Project = { id: string; name: string; idea?: string; status?: string };

const PROMPT_SUGGESTIONS = [
  "Employee expense management platform with receipt OCR and manager approvals",
  "B2B SaaS subscription billing with Stripe, multi-tenant RBAC, and usage metering",
  "Healthcare patient portal with appointment booking and HIPAA-compliant messaging",
];

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
  const [projectSearch, setProjectSearch] = useState("");
  const [idea, setIdea] = useState("Build an employee expense management platform.");
  const [state, setState] = useState<"idle" | "loading" | "busy">("loading");
  const [fatal, setFatal] = useState("");
  // Per-field errors, so each input can announce its own problem via
  // aria-describedby instead of one banner that names no field.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [authError, setAuthError] = useState("");
  const [createError, setCreateError] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetPw, setResetPw] = useState("");
  const [resetMsg, setResetMsg] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const doReset = async () => {
    if (resetBusy) return;
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setResetMsg("Enter your account email above first."); return; }
    if (resetPw.length < 8) { setResetMsg("New password must be at least 8 characters."); return; }
    setResetBusy(true);
    setResetMsg("");
    try {
      // Two steps on purpose: a reset token is minted first, then spent. There
      // is no unauthenticated "just set the password" path — that let anyone
      // who knew a victim's email address take over the account.
      const issued = await api<{ reset_token?: string; message?: string }>("/auth/request-reset", {
        method: "POST", body: { email: email.trim() },
      });
      if (!issued.reset_token) {
        // Production delivers the token by mail instead of returning it.
        setResetMsg(issued.message || "Check your email for reset instructions.");
        return;
      }
      const r = await api<{ message?: string }>("/auth/reset", {
        method: "POST",
        body: { email: email.trim(), new_password: resetPw, reset_token: issued.reset_token },
      });
      setResetMsg(r.message || "Password reset — log in with the new one.");
      setResetPw("");
    } catch (err) {
      setResetMsg(err instanceof Error ? err.message : "Reset failed.");
    } finally {
      setResetBusy(false);
    }
  };
  const toast = useToast();
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const doDeleteProject = async () => {
    if (!deleteTarget || deleteBusy) return;
    const name = deleteTarget.name;
    setDeleteBusy(true);
    try {
      await api(`/projects/${deleteTarget.id}`, { method: "DELETE" });
      setProjects((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success(`Project "${name}" deleted successfully.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete project");
    } finally {
      setDeleteBusy(false);
    }
  };

  const [editTarget, setEditTarget] = useState<Project | null>(null);
  const [editName, setEditName] = useState("");
  const [editIdea, setEditIdea] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState("");

  const openEditProject = (p: Project) => {
    setEditTarget(p);
    setEditName(p.name);
    setEditIdea(p.idea || "");
    setEditError("");
  };

  const doUpdateProject = async () => {
    if (!editTarget || editBusy) return;
    if (!editName.trim()) {
      setEditError("Project name cannot be empty");
      return;
    }
    setEditBusy(true);
    setEditError("");
    try {
      const updated = await api<Project>(`/projects/${editTarget.id}`, {
        method: "PATCH",
        body: { name: editName.trim(), description: editIdea.trim() },
      });
      setProjects((prev) =>
        prev.map((p) =>
          p.id === editTarget.id ? { ...p, name: updated.name, idea: editIdea.trim() } : p
        )
      );
      setEditTarget(null);
      toast.success("Project updated successfully.");
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Failed to update project");
      toast.error("Failed to update project");
    } finally {
      setEditBusy(false);
    }
  };
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
    const errs: Record<string, string> = {};
    if (mode === "register" && !name.trim()) errs.name = "Enter your name.";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) errs.email = "Enter a valid email address.";
    if (password.length < 8) errs.password = "Password must be at least 8 characters.";
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      // Move focus to the summary so keyboard and screen-reader users land on
      // the list of problems rather than hunting the form.
      requestAnimationFrame(() => document.getElementById("auth-error-summary")?.focus());
      return;
    }
    setAuthError("");
    setState("busy");
    try {
      await api(mode === "login" ? "/auth/login" : "/auth/register", {
        method: "POST", body: { email: email.trim(), password, name: name.trim() },
      });
      setAuthed(true);
      setProjects(await api<Project[]>("/projects"));
      setState("idle");
    } catch (err) {
      const status = (err as { status?: number }).status;
      setAuthError(status === 401 && mode === "login"
        ? "Wrong email or password. Try again — or reset it with Forgot password below."
        : err instanceof Error ? err.message : "Authentication failed.");
      setState("idle");
    }
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
      <div className="relative mx-auto grid max-w-[960px] items-stretch gap-6 px-5 py-10 md:grid-cols-2 md:py-16">
        <div className="absolute right-6 top-2 z-20">
          <ThemeToggle />
        </div>
        <div className="relative isolate flex flex-col justify-between overflow-hidden rounded-2xl bg-canvas-deep p-8 text-white">
          <div className="orb orb-lavender orb-drift -right-14 -top-10 h-52 w-52 opacity-40" aria-hidden />
          <div className="orb orb-sky orb-drift-slow -bottom-12 -left-10 h-44 w-44 opacity-35" aria-hidden />
          <div className="relative z-10">
            <p className="flex items-center gap-2.5">
              <Image src="/logo.svg" alt="BlueprintAI logo" width={36} height={36} className="rounded-full" />
              <b className="text-[16px] font-medium tracking-[-0.18px]">Blueprint AI</b>
            </p>
            <h1 className="mt-8 text-[32px] font-light leading-[1.13] tracking-[-0.32px] md:text-[40px]">Engineering blueprints, kept honest.</h1>
            <p className="mt-3 max-w-[38ch] text-[14.5px] leading-[1.5] text-white/75">Idea → requirements → artifacts → relationships → validation → impact → approval.</p>
          </div>
          <ul className="relative z-10 mt-8 grid gap-2.5 text-[13.5px] text-white/85">
            <li className="flex items-start gap-2.5"><FolderKanban size={16} className="mt-0.5 flex-none" aria-hidden />RAG-grounded drafts that cite your standards docs.</li>
            <li className="flex items-start gap-2.5"><GitBranch size={16} className="mt-0.5 flex-none" aria-hidden />100% traceability — every link stored, none invented.</li>
            <li className="flex items-start gap-2.5"><Scale size={16} className="mt-0.5 flex-none" aria-hidden />Consistency checks with human approve / reject.</li>
          </ul>
        </div>
        <Card className="w-full self-center">
          <div className="mb-3 flex gap-2" role="tablist" aria-label="Auth mode">
            <button role="tab" aria-selected={mode === "login"} onClick={() => { setMode("login"); setFieldErrors({}); setAuthError(""); }}
              className={`relative min-h-9 rounded-full px-3.5 py-1.5 text-[13px] font-medium after:absolute after:left-0 after:right-0 after:-top-1 after:-bottom-1 after:content-[''] ${mode === "login" ? "bg-elevated font-semibold text-primary" : "text-secondary hover:text-primary"}`}>Log in</button>
            <button role="tab" aria-selected={mode === "register"} onClick={() => { setMode("register"); setFieldErrors({}); setAuthError(""); }}
              className={`relative min-h-9 rounded-full px-3.5 py-1.5 text-[13px] font-medium after:absolute after:left-0 after:right-0 after:-top-1 after:-bottom-1 after:content-[''] ${mode === "register" ? "bg-elevated font-semibold text-primary" : "text-secondary hover:text-primary"}`}>Sign up</button>
          </div>
          <form onSubmit={auth} noValidate>
            <ErrorSummary
              id="auth-error-summary"
              errors={Object.entries(fieldErrors).map(([field, message]) => ({ fieldId: `auth-${field}`, message }))}
            />
            {mode === "register" && (
              <>
                <label className="block text-[13px]" htmlFor="auth-name">Name</label>
                <input id="auth-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada" autoComplete="name"
                  aria-invalid={!!fieldErrors.name} aria-describedby={fieldErrors.name ? "auth-name-error" : undefined}
                  className="mt-1 h-11 w-full rounded-md border border-border bg-canvas px-3.5 py-2 placeholder:text-muted focus:border-primary focus:outline-none" />
                <FieldError id="auth-name-error">{fieldErrors.name}</FieldError>
              </>
            )}
            <label className={`${mode === "register" ? "mt-2 " : ""}block text-[13px]`} htmlFor="auth-email">Email</label>
            <input id="auth-email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@team.com" autoComplete="email"
              aria-invalid={!!fieldErrors.email} aria-describedby={fieldErrors.email ? "auth-email-error" : undefined}
              className="mt-1 h-11 w-full rounded-md border border-border bg-canvas px-3.5 py-2 placeholder:text-muted focus:border-primary focus:outline-none" />
            <FieldError id="auth-email-error">{fieldErrors.email}</FieldError>
            <label className="mt-2 block text-[13px]" htmlFor="auth-password">Password</label>
            <span className="relative mt-1 block">
              <input id="auth-password" type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="•••••••• (min 8)"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                aria-invalid={!!fieldErrors.password} aria-describedby={fieldErrors.password ? "auth-password-error" : undefined}
                className="h-11 w-full rounded-md border border-border bg-canvas px-3.5 py-2 pr-10 placeholder:text-muted focus:border-primary focus:outline-none" />
              <button type="button" onClick={() => setShowPw(!showPw)} aria-label={showPw ? "Hide password" : "Show password"}
                className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-secondary transition-colors after:absolute after:-inset-1 after:content-[''] hover:bg-elevated hover:text-primary">
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </span>
            <FieldError id="auth-password-error">{fieldErrors.password}</FieldError>
            {mode === "register" && pwStrength && (
              <p className="mt-1 text-[12px] text-secondary" role="status">Strength: {pwStrength}</p>
            )}
            <div className="mt-3 flex items-center justify-between gap-2">
              <Button type="submit" loading={state === "busy"}>{mode === "login" ? "Log in" : "Create account"}</Button>
              {mode === "login" && (
                <button type="button" onClick={() => { setResetOpen(!resetOpen); setResetMsg(""); }}
                  className="text-[12.5px] text-secondary hover:text-primary hover:underline">Forgot password?</button>
              )}
            </div>
            {mode === "login" && resetOpen && (
              <div className="mt-3 rounded-xl border border-border bg-canvas p-3">
                <p className="text-[13px] font-medium">Reset password for <b>{email.trim() || "your account"}</b></p>
                <label className="mt-2 block text-[13px]">New password
                  <input type="password" value={resetPw} onChange={(e) => setResetPw(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") doReset(); }}
                    placeholder="•••••••• (min 8)" autoComplete="new-password"
                    className="mt-1 h-11 w-full rounded-md border border-border bg-surface px-3.5 py-2 placeholder:text-muted focus:border-primary focus:outline-none" />
                </label>
                <div className="mt-2"><Button size="sm" loading={resetBusy} onClick={doReset}>Set new password</Button></div>
                {resetMsg && <p className="mt-2 text-[13px] text-secondary" role="status">{resetMsg}</p>}
              </div>
            )}
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
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="ghost" onClick={logout}><LogOut size={14} />Log out</Button>
        </div>
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
      <Card className="mb-5 shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 className="text-[15px] font-semibold text-primary">New project</h2>
          <span className="hidden text-[12px] text-muted sm:inline">Tip: press <kbd className="rounded bg-elevated px-1.5 py-0.5 font-mono text-[11px] text-secondary">Ctrl+Enter</kbd></span>
        </div>
        <label className="sr-only" htmlFor="new-idea">Product idea</label>
        <textarea id="new-idea" rows={2} value={idea}
          onChange={(e) => setIdea(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              create();
            }
          }}
          placeholder="Describe the product to blueprint… (press Ctrl+Enter to create)"
          className="w-full rounded-xl border border-border bg-canvas p-3 text-[13.5px] leading-relaxed placeholder:text-muted focus:border-primary focus:outline-none" />
        
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="flex items-center gap-1 text-[11px] font-medium text-muted">
            <Sparkles size={12} className="text-muted" aria-hidden /> Starter templates:
          </span>
          {PROMPT_SUGGESTIONS.map((s, idx) => (
            <button key={idx} type="button" onClick={() => setIdea(s)}
              className="rounded-full border border-border bg-subtle/80 px-2.5 py-0.5 text-[11.5px] text-secondary transition-colors hover:border-border-strong hover:bg-elevated hover:text-primary">
              {s.split(" with ")[0]}
            </button>
          ))}
        </div>

        <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-border pt-3">
          <div className="flex items-center gap-2">
            <Button onClick={create} loading={state === "busy"}><Plus size={14} />Create project</Button>
            {createError && <p className="text-[13px] text-danger" role="alert">{createError}</p>}
          </div>
        </div>
      </Card>
      {projects.length === 0 ? (
        <EmptyState title="No projects yet" hint="Describe your product idea above to get started." />
      ) : (
        <div className="space-y-3">
          {projects.length > 2 && (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-subtle px-3.5 py-2">
              <Search size={14} className="text-muted" aria-hidden />
              <label htmlFor="project-search" className="sr-only">Search projects</label>
              <input
                id="project-search"
                type="search"
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                placeholder="Search projects..."
                className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted"
              />
            </div>
          )}
          <div className="grid gap-3.5 md:grid-cols-2">
            {projects
              .filter((p) => (p.name + (p.idea || "")).toLowerCase().includes(projectSearch.toLowerCase()))
              .map((p) => (
            <div key={p.id}
              className="group relative flex flex-col justify-between rounded-2xl border border-border bg-surface p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-border/70 bg-elevated text-primary">
                      <FolderKanban size={15} aria-hidden />
                    </div>
                    <Link href={`/projects/${p.id}`} prefetch className="truncate text-[15px] font-semibold text-primary transition-colors hover:text-primary-active hover:underline">
                      {p.name}
                    </Link>
                  </div>
                  <div className="flex flex-none items-center gap-1">
                    {p.status && <StatusBadge value={p.status} />}
                    <button type="button" aria-label={`Edit ${p.name}`}
                      onClick={(e) => { e.preventDefault(); openEditProject(p); }}
                      className="relative rounded-lg p-2 text-muted transition-colors after:absolute after:-inset-1 after:content-[''] hover:bg-elevated hover:text-primary"
                      title={`Edit ${p.name}`}>
                      <Pencil size={14} />
                    </button>
                    <button type="button" aria-label={`Delete ${p.name}`}
                      onClick={(e) => { e.preventDefault(); setDeleteTarget(p); }}
                      className="relative rounded-lg p-2 text-muted transition-colors after:absolute after:-inset-1 after:content-[''] hover:bg-elevated hover:text-danger"
                      title={`Delete ${p.name}`}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {p.idea && <p className="mt-2.5 line-clamp-2 text-[13px] leading-relaxed text-secondary">{p.idea}</p>}
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-border pt-2.5">
                <Link href={`/projects/${p.id}`} prefetch
                  className="flex items-center gap-1.5 text-[12.5px] font-medium text-muted transition-colors group-hover:text-primary">
                  Open workspace <ArrowRight size={13} aria-hidden className="transition-transform duration-150 group-hover:translate-x-0.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
        </div>
      )}
      <Dialog open={!!editTarget} onClose={() => setEditTarget(null)} title="Edit project">
        <div className="space-y-3">
          <label className="block text-[13px]">
            Project name
            <input value={editName} onChange={(e) => setEditName(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-border bg-canvas px-3 text-[13.5px] placeholder:text-muted focus:border-primary focus:outline-none" />
          </label>
          <label className="block text-[13px]">
            Product idea / description
            <textarea rows={3} value={editIdea} onChange={(e) => setEditIdea(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-canvas p-2.5 text-[13px] placeholder:text-muted focus:border-primary focus:outline-none" />
          </label>
          {editError && <p className="text-[12.5px] text-danger" role="alert">{editError}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button loading={editBusy} onClick={doUpdateProject}>Save changes</Button>
          </div>
        </div>
      </Dialog>
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete project?">
        <p className="text-[13.5px] text-secondary">
          Are you sure you want to delete <b>{deleteTarget?.name}</b>? This will permanently remove the project and all its artifacts, specifications, and test cases.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="danger" loading={deleteBusy} onClick={doDeleteProject}>Delete project</Button>
        </div>
      </Dialog>
    </div>
  );
}
