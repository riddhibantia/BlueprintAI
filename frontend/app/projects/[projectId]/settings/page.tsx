"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Activity, Cpu, Database } from "lucide-react";
import { me, logout } from "../../../../lib/api/client";
import { getHealth, changePassword } from "../../../../lib/api/endpoints";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { LoadingState, ErrorState, EmptyState } from "../../../../components/ui/feedback";
import { StatusBadge } from "../../../../components/ui/badge";

/** Settings: session, system diagnostics, and credits (§9: diagnostics live here, not the dashboard). */
type SessionUser = { name?: string; email?: string };
type Health = { status: string; db?: string; llm?: string; env?: string };

export default function Settings() {
  const [health, setHealth] = useState<Health | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [err, setErr] = useState("");
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => {
    getHealth().then(setHealth).catch((e) => setErr(e.message));
    me().then((u) => setUser((u as SessionUser) || null)).catch(() => {});
  }, []);

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (pwNew.length < 8) { setPwMsg("New password must be at least 8 characters."); return; }
    setPwBusy(true);
    setPwMsg("");
    try {
      const r = await changePassword(pwCurrent, pwNew);
      setPwMsg(r.message || "Password updated.");
      setPwCurrent("");
      setPwNew("");
    } catch (error) {
      setPwMsg(error instanceof Error ? error.message : "Could not update password.");
    } finally {
      setPwBusy(false);
    }
  };

  if (err && !health) return <ErrorState message={err} />;
  if (!health) return <LoadingState stage="Loading system status" />;

  return (
    <div>
      <h1 className="text-[24px] font-bold tracking-tight">Settings</h1>
      <p className="mb-5 text-[13.5px] text-secondary">Session, password, backend diagnostics, and licence.</p>
      <div className="grid gap-3.5 md:grid-cols-2">
        <Card>
          <h3 className="mb-2 text-[15px] font-semibold">Session</h3>
          {user ? (
            <><p className="text-[13.5px]"><b>{user.name || user.email}</b></p>
            <p className="font-mono text-[12px] text-secondary">{user.email}</p></>
          ) : <EmptyState title="No session" hint="Log in from the dashboard." />}
          <div className="mt-3"><Button variant="ghost" onClick={logout}>Log out</Button></div>
        </Card>
        <Card>
          <h3 className="mb-2 text-[15px] font-semibold">Change password</h3>
          {user ? (
            <form onSubmit={savePassword} className="grid gap-2">
              <label className="block text-[13px]">Current password
                <input type="password" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)}
                  autoComplete="current-password" required
                  className="mt-1 h-10 w-full rounded-md border border-border bg-canvas px-3 text-[13px] focus:border-primary focus:outline-none" />
              </label>
              <label className="block text-[13px]">New password
                <input type="password" value={pwNew} onChange={(e) => setPwNew(e.target.value)}
                  autoComplete="new-password" minLength={8} required
                  placeholder="At least 8 characters"
                  className="mt-1 h-10 w-full rounded-md border border-border bg-canvas px-3 text-[13px] placeholder:text-muted focus:border-primary focus:outline-none" />
              </label>
              <div><Button type="submit" size="sm" loading={pwBusy}>Update password</Button></div>
              {pwMsg && <p className="text-[12.5px] text-secondary" role="status">{pwMsg}</p>}
            </form>
          ) : <EmptyState title="No session" hint="Log in from the dashboard to change your password." />}
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
        <Card>
          <h3 className="mb-2 text-[15px] font-semibold">About</h3>
          <p className="text-[13px] text-secondary">BlueprintAI — deterministic engineering blueprints. MIT licensed; see LICENSE for the RareUI component exception.</p>
          <p className="mt-2 text-[12.5px] text-secondary">Motion components by <a href="https://www.rareui.com" target="_blank" rel="noreferrer" className="text-accent hover:underline">Rare UI</a> (personal/non-commercial license, details in docs/THIRD_PARTY_NOTICES.md).</p>
          <p className="mt-2 font-mono text-[12px] text-muted">Measured numbers: docs/EVALUATION.md</p>
        </Card>
      </div>
    </div>
  );
}
