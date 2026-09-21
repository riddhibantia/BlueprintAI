"use client";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";

export default function Dashboard() {
  const [health, setHealth] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [idea, setIdea] = useState("Build an employee expense management platform.");

  useEffect(() => {
    api("/health").then(setHealth).catch(() => setHealth({ status: "backend-down" }));
    api("/projects").then(setProjects).catch(() => {});
  }, []);

  const create = async () => {
    const p = await api("/projects", { method: "POST", body: JSON.stringify({ name: idea.slice(0, 60), product_idea: idea }) });
    setProjects([...projects, { id: p.id, name: p.name }]);
  };

  return (
    <div>
      <h1>Project dashboard</h1>
      <div className="card"><span className="mono">health: {JSON.stringify(health)}</span></div>
      <div className="card">
        <h3>No requirements yet — describe your product idea to get started</h3>
        <textarea rows={3} value={idea} onChange={(e) => setIdea(e.target.value)} />
        <button onClick={create}>Create project</button>
      </div>
      {projects.map((p) => (
        <div key={p.id} className="card"><span className="mono">{p.id.slice(0, 8)}</span> <b>{p.name}</b></div>
      ))}
      {projects.length === 0 && <p style={{ color: "var(--text-secondary)" }}>Empty state — create your first project above (§29.5).</p>}
    </div>
  );
}
