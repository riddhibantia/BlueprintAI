import "./globals.css";
import AssistantPanel from "../components/assistant";
import WorkspaceNav from "../components/nav";

export const metadata = { title: "DevBlueprint", description: "AI-assisted engineering blueprint workspace" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">Skip to content</a>
        <div className="layout">
          <WorkspaceNav />
          <main className="main" id="main">{children}</main>
          <aside className="panel" aria-label="AI Assistant">
            <AssistantPanel />
          </aside>
        </div>
      </body>
    </html>
  );
}
