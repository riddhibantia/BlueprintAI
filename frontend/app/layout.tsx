import "../styles/tokens.css";
import { Inter, JetBrains_Mono } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata = { title: "DevBlueprint", description: "AI-assisted engineering blueprint workspace" };

/** Root shell: theme + fonts only. Dashboard and project workspaces own their layouts. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem("dbp-theme");if(t)document.documentElement.dataset.theme=t;}catch(e){}})();` }} />
      </head>
      <body className={`${inter.variable} ${mono.variable} bg-canvas text-primary`}>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[100] focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-black">Skip to content</a>
        <main id="main">{children}</main>
      </body>
    </html>
  );
}
