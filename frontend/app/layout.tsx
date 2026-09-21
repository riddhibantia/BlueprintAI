import "./globals.css";
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="layout">
          <nav className="nav">
            <h3>DevBlueprint</h3>
            {["Overview", "Requirements", "PRD", "User Stories", "Architecture", "Database", "APIs", "Security", "Tasks", "Tests", "Traceability", "Consistency", "Knowledge", "AI Assistant"].map((m) => (
              <a key={m} href="#">{m}</a>
            ))}
          </nav>
          <div className="main">{children}</div>
          <aside className="panel">
            <h4>AI Assistant</h4>
            <p style={{ color: "var(--text-secondary)" }}>Contextual — ask about the artifact in view. Never the primary surface (§29.4).</p>
          </aside>
        </div>
      </body>
    </html>
  );
}
