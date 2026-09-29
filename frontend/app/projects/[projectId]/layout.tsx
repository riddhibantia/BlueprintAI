"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CopilotPanel } from "../../../components/copilot/panel";
import { Drawer } from "../../../components/ui/overlay";
import { ShellProvider, useShell } from "../../../components/shell/context";
import { Sidebar } from "../../../components/shell/sidebar";
import { TopBar } from "../../../components/shell/topbar";
import { Palette } from "../../../components/shell/palette";
import { useShortcuts } from "../../../lib/shortcuts/keys";

function ShellInner({ children }: { children: React.ReactNode }) {
  const { pid, setCopilotOpen, copilotOpen } = useShell();
  const [palette, setPalette] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const openPalette = () => setPalette(true);
  useShortcuts(pid, openPalette, () => setCopilotOpen(true));

  return (
    <div className="flex min-h-screen bg-canvas text-primary">
      <div className="hidden lg:block"><Sidebar /></div>
      <Drawer open={navOpen} onClose={() => setNavOpen(false)} label="Project navigation" title="Navigate">
        <Sidebar onNavigate={() => setNavOpen(false)} />
      </Drawer>
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onPalette={openPalette} onMenu={() => setNavOpen(true)} />
        <main id="main" className="mx-auto w-full max-w-[1120px] flex-1 px-5 py-5">
          {children}
        </main>
      </div>
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
