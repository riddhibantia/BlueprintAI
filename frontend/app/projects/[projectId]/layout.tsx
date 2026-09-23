"use client";
import { useState } from "react";
import { useParams, usePathname } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CopilotPanel } from "../../../components/copilot/panel";
import { Drawer } from "../../../components/ui/overlay";
import { ShellProvider, useShell } from "../../../components/shell/context";
import { Sidebar } from "../../../components/shell/sidebar";
import { TopBar } from "../../../components/shell/topbar";
import { Palette } from "../../../components/shell/palette";
import { Breadcrumb } from "../../../components/ui/data";
import { useShortcuts } from "../../../lib/shortcuts/keys";

const NAMES: Record<string, string> = {
  requirements: "Requirements", prd: "Product Spec", stories: "User Stories", architecture: "Architecture",
  database: "Data Model", apis: "APIs", security: "Security", tasks: "Tasks", tests: "Tests",
  traceability: "Traceability", consistency: "Consistency", impact: "Impact Analysis", knowledge: "Knowledge",
  settings: "Settings", profile: "Profile", blueprint: "Blueprint",
};

function ShellInner({ children }: { children: React.ReactNode }) {
  const { pid, project, copilotOpen, setCopilotOpen } = useShell();
  const path = usePathname() || "";
  const [palette, setPalette] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const openPalette = () => setPalette(true);
  useShortcuts(pid, openPalette);

  const seg = path.split("/").pop() || "";
  const trail: { label: string; href?: string }[] = [{ label: project?.name || "Project", href: `/projects/${pid}` }];
  if (seg && NAMES[seg]) trail.push({ label: NAMES[seg] });

  return (
    <div className="flex min-h-screen bg-canvas text-primary">
      <span className="hidden lg:block"><Sidebar /></span>
      <Drawer open={navOpen} onClose={() => setNavOpen(false)} label="Project navigation" title="Navigate">
        <Sidebar onNavigate={() => setNavOpen(false)} />
      </Drawer>
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onPalette={openPalette} onMenu={() => setNavOpen(true)} />
        <main id="main" className="mx-auto w-full max-w-[1120px] flex-1 px-5 py-5">
          <Breadcrumb trail={trail} />
          {children}
          <footer className="mt-8 border-t border-border pt-3 text-[11.5px] text-muted">
            Motion components by <a href="https://www.rareui.com" target="_blank" rel="noreferrer" className="text-accent hover:underline">Rare UI</a>
          </footer>
        </main>
      </div>
      <aside aria-label="Blueprint Copilot" className="sticky top-0 hidden h-screen w-[300px] flex-none overflow-auto border-l border-border bg-surface p-4 xl:block">
        <CopilotPanel />
      </aside>
      <Drawer open={copilotOpen} onClose={() => setCopilotOpen(false)} label="Blueprint Copilot" title="Blueprint Copilot">
        <CopilotPanel />
      </Drawer>
      <Palette open={palette} onClose={() => setPalette(false)} />
    </div>
  );
}

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const { projectId } = useParams() as { projectId: string };
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 } },
  }));
  return (
    <QueryClientProvider client={client}>
      <ShellProvider pid={projectId}>
        <ShellInner>{children}</ShellInner>
      </ShellProvider>
    </QueryClientProvider>
  );
}
