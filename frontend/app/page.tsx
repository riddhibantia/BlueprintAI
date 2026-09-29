import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Network } from "lucide-react";

const PIPELINE = [
  { n: "01", title: "Capture", text: "Product idea → clarified, RAG-grounded requirements with stable IDs and approval gates." },
  { n: "02", title: "Design", text: "PRD, user stories, architecture, data model, APIs, security controls — all interlinked." },
  { n: "03", title: "Verify", text: "Deterministic traceability, consistency checks, and impact analysis. Metrics computed, never invented." },
  { n: "04", title: "Ship", text: "Export PDF, OpenAPI, and Archify diagram IR. Human approval is authoritative state." },
];

const FEATURES = [
  { title: "RAG-grounded generation", text: "Upload standards docs; every artifact cites retrieved evidence — or says what's missing." },
  { title: "Traceability", text: "Requirement → story → API → task → test links with coverage % and orphan detection." },
  { title: "Consistency checks", text: "Cross-artifact rules (req↔API, API↔DB, sec↔API) with AI explanations you accept or reject." },
  { title: "Impact analysis", text: "Change a requirement, see every downstream artifact it touches before you commit." },
  { title: "Human-in-the-loop", text: "Optimistic locking, audit trail, and explicit approvals. AI proposes, humans dispose." },
  { title: "Honest exports", text: "PDF blueprints, OpenAPI specs, Archify diagrams — rendered from stored state, 1:1." },
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
          <Image src="/logo.svg" alt="BlueprintAI logo" width={32} height={32} className="rounded-[10px]" />
          BLUEPRINTAI
        </p>
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-[13px] font-semibold text-canvas hover:opacity-90">
          Open workspace <ArrowRight size={14} aria-hidden />
        </Link>
      </header>

      <section className="py-14 md:py-20">
        <p className="mb-4 font-mono text-[12px] uppercase tracking-[0.14em] text-muted">
          Idea → PRD → architecture → validation
        </p>
        <h1 className="max-w-[16ch] text-[44px] font-bold leading-[1.02] md:text-[76px]">
          Engineering blueprints, kept honest.
        </h1>
        <p className="mt-5 max-w-[560px] text-[16px] leading-relaxed text-secondary">
          BlueprintAI turns a product idea into requirements, specs, architecture, and tests —
          grounded in your docs, linked end-to-end, and verified by deterministic checks.
          Coverage is computed from stored links. The LLM never invents it.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-[14px] font-semibold text-canvas hover:opacity-90">
            Start blueprinting <ArrowRight size={15} aria-hidden />
          </Link>
          <a href="#pipeline" className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-[14px] font-medium text-secondary hover:text-primary">
            <Network size={15} aria-hidden /> How it works
          </a>
        </div>
        <dl className="mt-12 grid max-w-[860px] grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-4">
          {METRICS.map((m) => (
            <div key={m.label} className="bg-surface px-4 py-5">
              <dd className="font-mono text-[26px] font-bold tracking-tight tabular-nums">{m.value}</dd>
              <dt className="mt-1 font-mono text-[11px] uppercase tracking-[0.1em] text-muted">{m.label}</dt>
            </div>
          ))}
        </dl>
        <p className="mt-3 font-mono text-[11.5px] text-muted">Measured by evaluation/benchmark.py — mock LLM, temp SQLite DB. Re-run to reproduce.</p>
      </section>

      <section id="pipeline" className="scroll-mt-6 py-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">Pipeline</p>
        <h2 className="mt-1 text-[24px] font-bold">Four stages, every handoff stored and traceable.</h2>
        <ol className="mt-5 grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-4">
          {PIPELINE.map((s) => (
            <li key={s.n} className="bg-surface p-5">
              <p className="font-mono text-[12px] text-muted">{s.n}</p>
              <h3 className="mt-1 text-[15px] font-semibold">{s.title}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-secondary">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="py-8">
        <h2 className="text-[24px] font-bold">Why teams trust it</h2>
        <p className="mt-1 text-[13.5px] text-secondary">Six guarantees, enforced in code — not promised in copy.</p>
        <div className="mt-5 grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-surface p-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">{String(f.title).split(" ")[0]}</p>
              <h3 className="mt-1.5 text-[15px] font-semibold">{f.title}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-secondary">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 rounded-xl border border-border p-6 md:p-10">
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">Local-first</p>
        <h2 className="mt-1 max-w-[22ch] text-[26px] font-bold leading-tight">Bring your idea. Leave with a blueprint.</h2>
        <p className="mt-2 max-w-[520px] text-[13.5px] text-secondary">Runs locally in minutes — SQLite default, no Docker, mock LLM until you add a key.</p>
        <Link href="/dashboard" className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-[14px] font-semibold text-canvas hover:opacity-90">
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
