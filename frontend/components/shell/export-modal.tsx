"use client";
import { useState } from "react";
import {
  Download,
  FileText,
  Globe,
  Database,
  Layers,
  Copy,
  Check,
  Code2,
  FileJson,
  KanbanSquare,
  Sparkles,
} from "lucide-react";
import { Dialog } from "../ui/overlay";
import { Button } from "../ui/button";
import { apiDownload } from "../../lib/api/client";
import { copyText } from "../../lib/clipboard";
import { useToast } from "../ui/toast";
import { useTasks, useStories, useRequirements } from "../../lib/query/useArtifacts";

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
  pid: string;
  projectName?: string;
}

export function ExportModal({ open, onClose, pid, projectName = "blueprint" }: ExportModalProps) {
  const toast = useToast();
  const [downloading, setDownloading] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const tasksQ = useTasks(pid);
  const storiesQ = useStories(pid);
  const reqsQ = useRequirements(pid);

  const safeName = projectName.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-") || "blueprint";

  const handleDownload = async (key: string, path: string, filename: string, isJson = false) => {
    setDownloading(key);
    try {
      await apiDownload(path, filename, isJson);
      toast.success(`Downloaded ${filename}!`);
    } catch (e: any) {
      toast.error(e.message || "Export download failed");
    } finally {
      setDownloading(null);
    }
  };

  const copyGitHubIssuesJson = async () => {
    const tasks = tasksQ.data || [];
    const stories = storiesQ.data || [];
    const issuesPayload = [
      ...stories.map((s: any) => ({
        title: `[Story] ${s.code}: ${s.title || s.story?.slice(0, 50)}`,
        body: `### User Story\n"${s.story}"\n\n### Acceptance Criteria\n${(s.acceptance || []).map((a: string) => `- [ ] ${a}`).join("\n")}\n\n*Traces to:* \`${s.req || "N/A"}\``,
        labels: ["user-story", "blueprint-ai"],
      })),
      ...tasks.map((t: any) => ({
        title: `[Task] ${t.code}: ${t.title}`,
        body: `### Implementation Task\n**Epic:** ${t.epic || "General"}\n**Priority:** ${t.priority || "Medium"}\n**Requirement:** \`${t.req || "N/A"}\``,
        labels: ["task", t.epic?.toLowerCase().replace(/\s+/g, "-") || "feature", "blueprint-ai"].filter(Boolean),
      })),
    ];

    const jsonStr = JSON.stringify(issuesPayload, null, 2);
    if (await copyText(jsonStr)) {
      setCopiedKey("github-json");
      toast.success(`Copied ${issuesPayload.length} GitHub/Linear issues as JSON!`);
      setTimeout(() => setCopiedKey(null), 2000);
    } else {
      toast.error("Clipboard blocked");
    }
  };

  const EXPORT_OPTIONS = [
    {
      id: "markdown",
      title: "Technical Markdown Spec",
      badge: "Markdown (.md)",
      desc: "Comprehensive engineering specification including architecture, requirements, APIs, and data models.",
      action: () => handleDownload("markdown", `/projects/${pid}/export/markdown`, `${safeName}-spec.md`),
    },
    {
      id: "pdf",
      title: "Executive PDF Blueprint",
      badge: "Document (.pdf)",
      desc: "Presentation-grade formatted PDF report tailored for leadership reviews and client deliverables.",
      action: () => handleDownload("pdf", `/projects/${pid}/export/pdf`, `${safeName}-blueprint.pdf`),
    },
    {
      id: "openapi",
      title: "OpenAPI 3.1 Specification",
      badge: "OpenAPI JSON",
      desc: "Standard OpenAPI 3.1 document with all endpoints, request schemas, parameters, and responses.",
      action: () => handleDownload("openapi", `/projects/${pid}/export/openapi`, `${safeName}-openapi.json`, true),
    },
    {
      id: "postman",
      title: "Postman Collection v2.1",
      badge: "Postman JSON",
      desc: "Ready-to-import Postman Collection with preconfigured routes, environment variables, and test templates.",
      action: () => handleDownload("postman", `/projects/${pid}/export/postman`, `${safeName}-postman.json`, true),
    },
    {
      id: "sql",
      title: "PostgreSQL Schema DDL",
      badge: "SQL / DDL",
      desc: "Full executable PostgreSQL DDL script with CREATE TABLE, primary keys, and foreign key constraints.",
      action: () => handleDownload("sql", `/projects/${pid}/export/schema?target=postgres`, `${safeName}-schema.sql`),
    },
    {
      id: "json",
      title: "Full Project Architecture IR",
      badge: "Archify JSON",
      desc: "Complete machine-readable project state containing all cross-referenced artifact nodes and edges.",
      action: () => handleDownload("json", `/projects/${pid}/export/json`, `${safeName}-bundle.json`, true),
    },
  ];

  return (
    <Dialog open={open} onClose={onClose} title="Export Architecture Blueprint" label="Export modal">
      <div className="space-y-4">
        <p className="text-[13px] text-secondary">
          Export your engineered architecture, schemas, and sprint backlogs into industry-standard tool formats.
        </p>

        {/* Export formats grid */}
        <div className="grid gap-2.5 sm:grid-cols-2">
          {EXPORT_OPTIONS.map((opt) => (
            <div
              key={opt.id}
              className="flex flex-col justify-between rounded-xl border border-border bg-surface p-3 transition-colors hover:border-border-strong hover:bg-elevated/20"
            >
              <div>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="font-semibold text-[13px] text-primary">{opt.title}</span>
                  <span className="rounded bg-elevated px-1.5 py-0.5 font-mono text-[10px] font-semibold text-secondary">
                    {opt.badge}
                  </span>
                </div>
                <p className="text-[11.5px] leading-relaxed text-secondary">{opt.desc}</p>
              </div>

              <div className="mt-3 flex justify-end">
                <Button
                  size="sm"
                  variant="subtle"
                  loading={downloading === opt.id}
                  onClick={opt.action}
                  className="text-[12px]"
                >
                  <Download size={13} /> Download
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Sprint Backlog / Linear & GitHub Issues Card */}
        <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-3.5">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2">
              <KanbanSquare size={16} className="text-accent" />
              <span className="text-[13.5px] font-semibold text-primary">Sprint Delivery (Linear / GitHub Issues)</span>
            </div>
            <span className="rounded-full bg-accent/15 px-2 py-0.5 font-mono text-[10.5px] font-bold text-accent">
              {(storiesQ.data?.length || 0) + (tasksQ.data?.length || 0)} Items
            </span>
          </div>
          <p className="text-[12px] text-secondary leading-relaxed">
            Export all generated User Stories (with acceptance criteria) and implementation Tasks formatted as structured JSON for importing into Linear, Jira, or GitHub Issues.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button
              size="sm"
              variant="subtle"
              onClick={copyGitHubIssuesJson}
              className="text-[12px]"
            >
              {copiedKey === "github-json" ? (
                <>
                  <Check size={13} className="text-success" /> Copied JSON
                </>
              ) : (
                <>
                  <Copy size={13} /> Copy Backlog JSON
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-border">
          <Button variant="ghost" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
