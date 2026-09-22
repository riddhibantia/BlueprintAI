"use client";
import { useParams } from "next/navigation";

/** Full §29.3 module list — every item is a working page, no stubs. */
const MODULES: [string, string][] = [
  ["Overview", ""],
  ["Requirements", "requirements"],
  ["PRD", "prd"],
  ["User Stories", "stories"],
  ["Architecture", "architecture"],
  ["Database", "database"],
  ["APIs", "apis"],
  ["Security", "security"],
  ["Tasks", "tasks"],
  ["Tests", "tests"],
  ["Traceability", "traceability"],
  ["Consistency", "consistency"],
  ["Knowledge", "knowledge"],
];

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const { projectId } = useParams();
  const base = `/projects/${projectId}`;
  return (
    <div>
      <nav className="row" aria-label="Project modules" style={{ marginBottom: 16 }}>
        {MODULES.map(([label, slug]) => (
          <a key={label} className="btn ghost" href={slug ? `${base}/${slug}` : base}>{label}</a>
        ))}
      </nav>
      {children}
    </div>
  );
}
