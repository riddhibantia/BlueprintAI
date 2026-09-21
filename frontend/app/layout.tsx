import "./globals.css";
import AssistantPanel from "../components/assistant";

const NAV: [string, string][] = [
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

export const metadata = { title: "DevBlueprint", description: "AI-assisted engineering blueprint workspace" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">Skip to content</a>
        <div className="layout">
          <nav className="nav" aria-label="Modules">
            <div className="brand">DevBlueprint<small>engineering workspace</small></div>
            <div className="sec">Workspace</div>
            <a href="/dashboard">Dashboard</a>
            <div className="sec">Blueprint modules</div>
            {NAV.map(([label]) => (
              <a key={label} href="/dashboard" title="Open a project first">{label}</a>
            ))}
          </nav>
          <main className="main" id="main">{children}</main>
          <aside className="panel" aria-label="AI Assistant">
            <AssistantPanel />
          </aside>
        </div>
      </body>
    </html>
  );
}
