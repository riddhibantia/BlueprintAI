import "./globals.css";
import "../styles/tokens.css";
import { Inter, JetBrains_Mono } from "next/font/google";
import AssistantPanel from "../components/assistant";
import WorkspaceNav from "../components/nav";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata = { title: "DevBlueprint", description: "AI-assisted engineering blueprint workspace" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <body className={`${inter.variable} ${mono.variable}`}>
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
