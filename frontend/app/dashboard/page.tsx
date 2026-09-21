"use client";
import { useEffect, useState } from "react";
import { api, isAuthed, logout } from "../../lib/api";
import { Empty, Loading, ErrorBox, Status } from "../../components/ui";

export default function Dashboard() {
  const [authed, setAuthed] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [projects, setProjects] = useState<any[]>([]);
  const [idea, setIdea] = useState("Build an employee expense management platform.");
  const [health, setHealth] = useState<any>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("loading");
  const [err, setErr] = useState("");

  const load = async () => {
    setState("loading");
    try {
      setHealth(await api("/health"));
      if (isAuthed()) {
        setAuthed(true);
        setProjects(await api("/projects"));
      }
      setState("idle");
    } catch (e: any) {
      setErr(e.message || "Backend unreachable. Start FastAPI on :8000.");
      setState("error");
    }
  };

  useEffect(() => { load(); }, []);

  const auth = async () => {
    try {
      const r = await api(mode === "login" ? "/auth/login" : "/auth/register", {
        method: "POST", body: JSON.stringify({ email, password, name }),
      });
      localStorage.setItem("token", r.token);
      setAuthed(true);
      setProjects(await api("/projects"));
    } catch (e: any) { setErr(e.message); setState("error"); }
  };

  const create = async () => {
    const p = await api("/projects", {
      method: "POST",
      body: JSON.stringify({ name: idea.slice(0, 60), product_idea: idea }),
    });
    window.location.href = `/projects/${p.id}`;
  };

  if (state === "loading") return <Loading stage="Connecting to workspace backend" />;
  if (state === "error" && !authed && projects.length === 0 && !health)
    return <ErrorBox message={err} onRetry={() => { setState("loading"); load(); }} />;

  if (!authed)
    return (
      <div>
        <h1>DevBlueprint</h1>
        <p className="sub">Turn a product idea into a traceable engineering blueprint.</p>
        <div className="card" style={{ maxWidth: 420 }}>
          <div className="row">
            <button className={mode === "login" ? "" : "ghost"} onClick={() => setMode("login")}>Log in</button>
            <button className={mode === "register" ? "" : "ghost"} onClick={() => setMode("register")}>Sign up</button>
          </div>
          <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@team.com" /></label>
          <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" /></label>
          {mode === "register" && <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada" /></label>}
          <button onClick={auth}>{mode === "login" ? "Log in" : "Create account"}</button>
          {state === "error" && err && <p className="muted">{err}</p>}
        </div>
      </div>
    );

  return (
    <div>
      <div className="spread">
        <div><h1>Projects</h1><p className="sub">Backend: <span className="mono">{health?.db} · {health?.llm}</span></p></div>
        <button className="ghost" onClick={logout}>Log out</button>
      </div>
      <div className="card">
        <h3>New project</h3>
        <p className="muted">Describe the product idea in one line — the pipeline clarifies, then generates.</p>
        <textarea rows={3} value={idea} onChange={(e) => setIdea(e.target.value)} aria-label="Product idea" />
        <button onClick={create}>Create project</button>
      </div>
      {projects.length === 0 ? (
        <Empty title="No projects yet" hint="Describe your product idea above to get started.">
          <span className="mono muted">Idea → Requirements → PRD → … → Blueprint</span>
        </Empty>
      ) : (
        <div className="grid m2">
          {projects.map((p) => (
            <div key={p.id} className="card">
              <div className="spread"><b>{p.name}</b><Status value={p.status || "draft"} /></div>
              <p className="muted">{p.idea}</p>
              <a className="btn" href={`/projects/${p.id}`}>Open workspace</a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
