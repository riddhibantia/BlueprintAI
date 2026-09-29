import Link from "next/link";
import {
  ArrowRight, BookOpenCheck, GitBranch, Scale, Zap, ShieldCheck,
  FileDown, Network, ListChecks, FolderKanban,
} from "lucide-react";

const PIPELINE = [
  { n: "01", title: "Capture", text: "Product idea → clarified, RAG-grounded requirements with stable IDs and approval gates." },
  { n: "02", title: "Design", text: "PRD, user stories, architecture, data model, APIs, security controls — all interlinked." },
  { n: "03", title: "Verify", text: "Deterministic traceability, consistency checks, and impact analysis. Metrics computed, never invented." },
  { n: "04", title: "Ship", text: "Export PDF, OpenAPI, and Archify diagram IR. Human approval is authoritative state." },
];

const FEATURES = [
  { Icon: BookOpenCheck, title: "RAG-grounded generation", text: "Upload standards docs; every artifact cites retrieved evidence — or says what's missing." },
  { Icon: GitBranch, title: "Traceability", text: "Requirement → story → API → task → test links with coverage % and orphan detection." },
  { Icon: Scale, title: "Consistency checks", text: "Cross-artifact rules (req↔API, API↔DB, sec↔API) with AI explanations you accept or reject." },
  { Icon: Zap, title: "Impact analysis", text: "Change a requirement, see every downstream artifact it touches before you commit." },
  { Icon: ShieldCheck, title: "Human-in-the-loop", text: "Optimistic locking, audit trail, and explicit approvals. AI proposes, humans dispose." },
  { Icon: FileDown, title: "Honest exports", text: "PDF blueprints, OpenAPI specs, Archify diagrams — rendered from stored state, 1:1." },
];

// Measured via evaluation/benchmark.py (mock LLM, temp SQLite). Real numbers, labeled.
const METRICS = [
  { value: "0.90", label: "Recall@3 retrieval" },
  { value: "100%", label: "Traceability coverage" },
  { value: "35/35", label: "Tests green" },
  { value: "0", label: "Failures over 9 runs" },
];

export default function Landing() {
  return (
    <div className="mx-auto max-w-[1120px] px-5 pb-16">
      <header className="flex items-center justify-between py-5">
        <p className="flex items-center gap-2 text-[13px] font-extrabold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-gradient-to-br from-accent via-info to-accent2 text-[15px] text-on-accent" aria-hidden>B</span>
          BLUEPRINTAI
        </p>
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-on-accent hover:brightness-110">
          Open workspace <ArrowRight size={14} aria-hidden />
        </Link>
      </header>

      <section className="py-14 text-center md:py-20">
        <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-[12px] font-semibold text-secondary">
          <FolderKanban size={13} aria-hidden /> Idea → PRD → architecture → validation
        </p>
        <h1 className="mx-auto max-w-[720px] text-[36px] font-bold leading-[1.1] tracking-tight md:text-[52px]">
          Engineering blueprints, <span className="text-accent">kept honest.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-[600px] text-[15px] leading-relaxed text-secondary">
          BlueprintAI turns a product idea into requirements, specs, architecture, and tests —
          grounded in your docs, linked end-to-end, and verified by deterministic checks.
          Coverage is computed from stored links. The LLM never invents it.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-[14px] font-semibold text-on-accent hover:brightness-110">
            Start blueprinting <ArrowRight size={15} aria-hidden />
          </Link>
          <a href="#pipeline" className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-[14px] font-medium text-secondary hover:border-accent hover:text-primary">
            <Network size={15} aria-hidden /> How it works
          </a>
        </div>
        <dl className="mx-auto mt-10 grid max-w-[760px] grid-cols-2 gap-3 md:grid-cols-4">
          {METRICS.map((m) => (
            <div key={m.label} className="rounded-2xl border border-border bg-surface px-3 py-4">
              <dt className="order-2 mt-1 block text-[12px] text-secondary">{m.label}</dt>
              <dd className="text-[24px] font-bold tracking-tight text-accent">{m.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[12px] text-muted">Measured by evaluation/benchmark.py — mock LLM, temp SQLite DB. Re-run to reproduce.</p>
      </section>

      <section id="pipeline" className="scroll-mt-6 py-8">
        <h2 className="text-[24px] font-bold tracking-tight">The pipeline</h2>
        <p className="mt-1 text-[13.5px] text-secondary">Four stages, every handoff stored and traceable.</p>
        <ol className="mt-5 grid gap-3 md:grid-cols-4">
          {PIPELINE.map((s) => (
            <li key={s.n} className="rounded-2xl border border-border bg-surface p-4">
              <p className="font-mono text-[12px] font-bold text-accent">{s.n}</p>
              <h3 className="mt-1 text-[15px] font-semibold">{s.title}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-secondary">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="py-8">
        <h2 className="text-[24px] font-bold tracking-tight">Why teams trust it</h2>
        <p className="mt-1 flex items-center gap-1.5 text-[13.5px] text-secondary"><ListChecks size={14} aria-hidden /> Six guarantees, enforced in code — not promised in copy.</p>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-border bg-surface p-4">
              <f.Icon size={17} className="text-accent" aria-hidden />
              <h3 className="mt-2 text-[14.5px] font-semibold">{f.title}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-secondary">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 rounded-2xl border border-accent/40 bg-accent/5 p-6 text-center md:p-10">
        <h2 className="text-[22px] font-bold tracking-tight">Bring your idea. Leave with a blueprint.</h2>
        <p className="mx-auto mt-2 max-w-[520px] text-[13.5px] text-secondary">Runs locally in minutes — SQLite default, no Docker, mock LLM until you add a key.</p>
        <Link href="/dashboard" className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-[14px] font-semibold text-on-accent hover:brightness-110">
          Open workspace <ArrowRight size={15} aria-hidden />
        </Link>
      </section>

      <footer className="mt-12 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-[12px] text-muted">
        <p>BlueprintAI — deterministic engineering blueprints. MIT (see LICENSE exception for RareUI components).</p>
        <p className="flex gap-4"><Link href="/dashboard" className="hover:text-primary hover:underline">Workspace</Link><a href="https://www.rareui.com" target="_blank" rel="noreferrer" className="hover:text-primary hover:underline">Rare UI</a></p>
      </footer>
    </div>
  );
}
