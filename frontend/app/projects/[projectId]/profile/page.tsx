"use client";
import { useEffect, useState } from "react";
import { User as UserIcon } from "lucide-react";
import { me, logout } from "../../../../lib/api/client";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { LoadingState, ErrorState } from "../../../../components/ui/feedback";

/** Profile: who is signed in (real session data only). */
export default function Profile() {
  const [user, setUser] = useState<any>(null);
  const [err, setErr] = useState("");

  useEffect(() => { me().then(setUser).catch((e) => setErr(e.message)); }, []);

  if (err && !user) return <ErrorState message={err} />;
  if (!user) return <LoadingState stage="Loading profile" />;

  return (
    <div>
      <h1 className="text-[24px] font-bold tracking-tight">Profile</h1>
      <p className="mb-5 text-[13.5px] text-secondary">Your workspace identity.</p>
      <Card>
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-elevated font-bold text-accent" aria-hidden>
            {(user.name || user.email || "?").slice(0, 1).toUpperCase()}
          </span>
          <div>
            <p className="flex items-center gap-2 text-[15px] font-semibold"><UserIcon size={15} aria-hidden />{user.name || "Unnamed"}</p>
            <p className="font-mono text-[12.5px] text-secondary">{user.email}</p>
          </div>
        </div>
        <div className="mt-4"><Button variant="ghost" onClick={logout}>Log out</Button></div>
      </Card>
    </div>
  );
}
