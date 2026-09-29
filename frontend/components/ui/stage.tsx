"use client";
import Link from "next/link";
import { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "./button";
import { EmptyState } from "./feedback";

/** Prerequisite banner: names the unmet gate and links to the fixing page. */
export function PrereqBanner({ text, href, action }: { text: string; href: string; action: string }) {
  return (
    <div className="mb-3.5 flex flex-wrap items-center gap-3 rounded-2xl border border-warning/40 bg-warning/[0.07] p-3.5" role="status">
      <AlertTriangle size={16} className="flex-none text-warning" aria-hidden />
      <p className="min-w-0 flex-1 text-[13px]">{text}</p>
      <Link href={href} prefetch
        className="inline-flex items-center rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-on-accent hover:brightness-110">
        {action}
      </Link>
    </div>
  );
}

/** Empty stage with a real generate CTA (never a dead end). */
export function StageEmpty({ title, hint, actionLabel, onGenerate, generating,
                             disabledReason, secondary }: {
  title: string; hint: string; actionLabel: string;
  onGenerate: () => void; generating: boolean;
  disabledReason?: string; secondary?: ReactNode;
}) {
  return (
    <EmptyState title={title} hint={hint} action={
      <div className="grid justify-items-center gap-2">
        <span title={disabledReason}>
          <Button onClick={onGenerate} loading={generating} disabled={!!disabledReason || generating}>
            {actionLabel}
          </Button>
        </span>
        {disabledReason && <p className="text-[12.5px] text-warning" role="status">{disabledReason}</p>}
        {secondary}
      </div>
    } />
  );
}
