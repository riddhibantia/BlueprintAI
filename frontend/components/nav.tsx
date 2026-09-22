"use client";
import { usePathname } from "next/navigation";

/** Workspace nav rail — Dashboard plus an orientation hint (project modules live in context). */
export default function WorkspaceNav() {
  const path = usePathname() || "";
  const active = path.startsWith("/dashboard") ? "active" : "";
  return (
    <nav className="nav" aria-label="Workspace">
      <div className="brand">
        <span className="logo" aria-hidden>D</span>
        <span><b>DevBlueprint</b><small>engineering workspace</small></span>
      </div>
      <div className="sec">Workspace</div>
      <a href="/dashboard" className={active}><span className="dot" aria-hidden />Dashboard</a>
      <div className="sec">Modules</div>
      <p className="muted" style={{ padding: "0 10px" }}>Open a project to reach its 13 blueprint modules.</p>
    </nav>
  );
}
