import "../styles/tokens.css";
import { EB_Garamond, Inter, JetBrains_Mono } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
/* Waldenburg Light is licensed; EB Garamond 300 is the documented substitute.
   Loaded as a variable font (no explicit weight list) so the 300 axis the
   brand depends on is actually available — the static-weight typings in this
   Next version only expose 400-800. */
const display = EB_Garamond({ subsets: ["latin"], variable: "--font-ebgaramond", display: "swap" });
/* Named --font-jetbrains, not --font-mono: @theme also defines --font-mono
   and two declarations of the same custom property silently clobber each other. */
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata = { title: "BlueprintAI — Engineering Blueprint Workspace", description: "Idea → requirements → architecture → APIs → validation. RAG-grounded, traceable, human-approved." };

/** Root shell: theme + fonts only. Dashboard and project workspaces own their layouts. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem("dbp-theme");if(t==="dark")document.documentElement.dataset.theme="dark";}catch(e){}})();` }} />
      </head>
      <body className={`${inter.variable} ${display.variable} ${mono.variable} bg-canvas font-sans text-primary`}>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[100] focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-on-accent">Skip to content</a>
        <main id="main">{children}</main>
      </body>
    </html>
  );
}
