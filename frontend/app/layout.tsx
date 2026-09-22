import "./globals.css";
import AssistantPanel from "../components/assistant";

export const metadata = { title: "DevBlueprint", description: "AI-assisted engineering blueprint workspace" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">Skip to content</a>
        <div className="layout">
          <nav className="nav" aria-label="Workspace">
            <div className="brand">DevBlueprint<small>engineering workspace</small></div>
            <div className="sec">Workspace</div>
            <a href="/dashboard">Dashboard</a>
            <div className="sec">Modules</div>
            <p className="muted" style={{ padding: "0 10px" }}>Open a project to reach its 13 blueprint modules.</p>
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
