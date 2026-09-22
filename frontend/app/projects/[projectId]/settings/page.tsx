"use client";
import { useEffect, useState } from "react";
import { Activity, Cpu, Database, Moon, Sun } from "lucide-react";
import { me, logout } from "../../../../lib/api/client";
import { getHealth } from "../../../../lib/api/endpoints";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { LoadingState, ErrorState, EmptyState } from "../../../../components/ui/feedback";
import { StatusBadge } from "../../../../components/ui/badge";

/** Settings: theme, session, and system diagnostics (§9: diagnostics live here, not the dashboard). */
export default function Settings() {
  const [health, setHealth] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [err, setErr] = useState("");
  const [light, setLight] = useState(false);

  useEffect(() => {
    setLight(document.documentElement.dataset.theme === "light");
    getHealth().then(setHealth).catch((e) => setErr(e.message));
    me().then(setUser).catch(() => {});
  }, []);

  const toggleTheme = () => {
    const el = document.documentElement;
    const next = el.dataset.theme === "light" ? "dark" : "light";
    el.dataset.theme = next;
    setLight(next === "light");
    try { localStorage.setItem("dbp-theme", next); } catch { /* private mode */ }
  };

  if (err && !health) return <ErrorState message={err} />;
  if (!health) return <LoadingState stage="Loading system status" />;

  return (
    <div>
      <h1 className="text-[24px] font-bold tracking-tight">Settings</h1>
      <p className="mb-5 text-[13.5px] text-secondary">Preferences, session, and backend diagnostics.</p>
      <div className="grid gap-3.5 md:grid-cols-2">
        <Card>
          <h3 className="mb-2 text-[15px] font-semibold">Appearance</h3>
          <Button variant="ghost" onClick={toggleTheme}>
            {light ? <><Moon size={14} /> Use dark theme</> : <><Sun size={14} /> Use light theme</>}
          </Button>
          <p className="mt-2 text-[12.5px] text-secondary">Dark-first enterprise workspace; light mode keeps the same hierarchy.</p>
        </Card>
        <Card>
          <h3 className="mb-2 text-[15px] font-semibold">Session</h3>
          {user ? (
            <><p className="text-[13.5px]"><b>{user.name || user.email}</b></p>
            <p className="font-mono text-[12px] text-secondary">{user.email}</p></>
          ) : <EmptyState title="No session" hint="Log in from the dashboard." />}
          <div className="mt-3"><Button variant="ghost" onClick={logout}>Log out</Button></div>
        </Card>
        <Card>
          <h3 className="mb-3 flex items-center gap-2 text-[15px] font-semibold"><Activity size={15} />System status</h3>
          <div className="grid gap-2 text-[13px]">
            <p className="flex items-center justify-between">API <StatusBadge value={health.status === "ok" ? "approved" : health.status} /></p>
            <p className="flex items-center justify-between"><span className="flex items-center gap-1.5"><Database size={13} />Database</span><code className="font-mono text-[12px]">{health.db}</code></p>
            <p className="flex items-center justify-between"><span className="flex items-center gap-1.5"><Cpu size={13} />LLM provider</span><code className="font-mono text-[12px]">{health.llm}</code></p>
            <p className="flex items-center justify-between">Environment<code className="font-mono text-[12px]">{health.env}</code></p>
          </div>
        </Card>
      </div>
    </div>
  );
}
