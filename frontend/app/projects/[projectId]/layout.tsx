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
import { ShortcutsModal } from "../../../components/shell/shortcuts-modal";
import { useShortcuts } from "../../../lib/shortcuts/keys";

function ShellInner({ children }: { children: React.ReactNode }) {
  const { pid, setCopilotOpen, copilotOpen, copilotMode } = useShell();
  const [palette, setPalette] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const openPalette = () => setPalette(true);
  useShortcuts(pid, openPalette, () => setCopilotOpen(!copilotOpen), () => setShortcutsOpen(true));

  return (
    <div className="flex min-h-screen bg-canvas text-primary">
      {/* Desktop navigation rail */}
      <div className="hidden lg:block"><Sidebar /></div>
      {navOpen && (
        <Drawer open onClose={() => setNavOpen(false)} label="Project navigation" title="Navigate">
          <Sidebar onNavigate={() => setNavOpen(false)} />
        </Drawer>
      )}

      {/* Main content viewport */}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          onPalette={openPalette}
          onMenu={() => setNavOpen(true)}
          onShortcuts={() => setShortcutsOpen(true)}
        />
        <div className="mx-auto w-full max-w-[1140px] flex-1 px-5 py-5">
          {children}
        </div>
      </div>

      {/* Copilot: Docked Split-Pane Mode (Desktop) */}
      {copilotOpen && copilotMode === "dock" && (
        <aside
          aria-label="Blueprint Copilot docked panel"
          className="hidden lg:flex w-[390px] flex-col border-l border-border bg-surface shadow-xs h-screen sticky top-0 overflow-y-auto p-4 z-20 animate-in slide-in-from-right-4 duration-200"
        >
          <CopilotPanel onClose={() => setCopilotOpen(false)} />
        </aside>
      )}

      {/* Copilot: Drawer Modal Mode */}
      {copilotOpen && copilotMode === "drawer" && (
        <Drawer open={copilotOpen} onClose={() => setCopilotOpen(false)} label="Blueprint Copilot" title="Blueprint Copilot">
          <CopilotPanel onClose={() => setCopilotOpen(false)} />
        </Drawer>
      )}

      {/* Copilot: Mobile Drawer fallback when docked on desktop */}
      {copilotOpen && copilotMode === "dock" && (
        <div className="lg:hidden">
          <Drawer open={copilotOpen} onClose={() => setCopilotOpen(false)} label="Blueprint Copilot" title="Blueprint Copilot">
            <CopilotPanel onClose={() => setCopilotOpen(false)} />
          </Drawer>
        </div>
      )}

      <Palette open={palette} onClose={() => setPalette(false)} />
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
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
