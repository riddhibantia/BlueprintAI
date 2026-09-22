"use client";
import { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, GitBranch, Info } from "lucide-react";
import { cn } from "../../lib/utils/cn";
import { Button } from "./button";
import { StatusBadge } from "./badge";

/** Approval banner: AI-generated, review before approval (§37). */
export function ApprovalBanner({ status, onApprove, onReject, onEdit }: { status: string; onApprove?: () => void; onReject?: () => void; onEdit?: () => void }) {
  if ((status || "").toLowerCase() === "approved") return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-warning/40 bg-warning/[0.07] p-3.5">
      <AlertTriangle size={16} className="text-warning" aria-hidden />
      <p className="flex-1 text-[13px]"><b>AI-generated artifact</b> <span className="text-secondary">— review before approval. Approved artifacts become authoritative project state.</span></p>
      <div className="flex gap-2">
        {onEdit && <Button variant="ghost" size="sm" onClick={onEdit}>Edit</Button>}
        {onReject && <Button variant="ghost" size="sm" onClick={onReject}>Reject</Button>}
        {onApprove && <Button size="sm" onClick={onApprove}>Approve</Button>}
      </div>
    </div>
  );
}

/** Consistency/agents issue card: severity, evidence, explanation, status (§27). */
export function IssueCard({ issue, children }: { issue: { severity: string; check?: string; description: string; affected?: string[]; suggestion?: string; status: string }; children?: ReactNode }) {
  const sev = (issue.severity || "").toLowerCase();
  const Icon = sev === "conflict" || sev === "high" ? AlertTriangle : sev === "info" ? Info : CheckCircle2;
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2"><Icon size={15} className={sev === "conflict" || sev === "high" ? "text-danger" : "text-warning"} aria-hidden /><StatusBadge value={issue.severity} /></span>
        <span className="flex items-center gap-2"><StatusBadge value={issue.status} />{issue.check && <code className="rounded bg-elevated px-1.5 py-0.5 font-mono text-[12px]">{issue.check}</code>}</span>
      </div>
      <p className="text-[13.5px]">{issue.description}</p>
      {(issue.affected || []).length > 0 && <p className="mt-1 text-[12.5px] text-secondary">Affected: {(issue.affected || []).join(", ")}</p>}
      {issue.suggestion && <p className="mt-1 text-[12.5px] text-secondary">Suggestion: {issue.suggestion}</p>}
      {children}
    </div>
  );
}

/** Timeline row for Recent Activity (§14): icon, event, context, timestamp. */
export function ActivityItem({ icon, title, context, time }: { icon: ReactNode; title: string; context?: string; time?: string }) {
  return (
    <div className="flex gap-3 border-b border-border py-2.5 last:border-b-0">
      <span className="mt-0.5 text-secondary" aria-hidden>{icon}</span>
      <div className="min-w-0">
        <p className="text-[13px] font-medium">{title}</p>
        {context && <p className="truncate font-mono text-[12px] text-secondary">{context}</p>}
      </div>
      {time && <span className="ml-auto shrink-0 text-[12px] text-muted">{time}</span>}
    </div>
  );
}

/** Linked-artifact chip (§19/§26). */
export function ArtifactLink({ code, href }: { code: string; href?: string }) {
  const inner = (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-elevated px-2.5 py-0.5 font-mono text-[12px] hover:border-accent">
      <GitBranch size={11} aria-hidden />{code}
    </span>
  );
  return href ? <a href={href}>{inner}</a> : inner;
}

/** Small helper for muted metadata lines. */
export function Meta({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-[12.5px] text-secondary", className)}>{children}</p>;
}
