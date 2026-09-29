import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

const PIPELINE = [
  { n: "01", title: "Capture", text: "Product idea → clarified, RAG-grounded requirements with stable IDs and approval gates.", chip: "bg-[#1a3a3a] text-white" },
  { n: "02", title: "Design", text: "PRD, user stories, architecture, data model, APIs, security controls — all interlinked.", chip: "bg-[#b8a4ed] text-[#0a0a0a]" },
  { n: "03", title: "Verify", text: "Deterministic traceability, consistency checks, and impact analysis. Metrics computed, never invented.", chip: "bg-[#ffb084] text-[#0a0a0a]" },
  { n: "04", title: "Ship", text: "Export PDF, OpenAPI, and Archify diagram IR. Human approval is authoritative state.", chip: "bg-[#e8b94a] text-[#0a0a0a]" },
];

const FEATURES = [
  { tag: "RAG", title: "Grounded generation", text: "Upload standards docs; every artifact cites retrieved evidence — or says what's missing.", dot: "bg-[#ff4d8b]" },
  { tag: "Links", title: "Traceability", text: "Requirement → story → API → task → test links with coverage % and orphan detection.", dot: "bg-[#1a3a3a]" },
  { tag: "Checks", title: "Consistency", text: "Cross-artifact rules with AI explanations you accept or reject.", dot: "bg-[#b8a4ed]" },
  { tag: "Change", title: "Impact analysis", text: "Change a requirement, see every downstream artifact it touches before you commit.", dot: "bg-[#ffb084]" },
  { tag: "Humans", title: "Approval gates", text: "Optimistic locking, audit trail, explicit approvals. AI proposes, humans dispose.", dot: "bg-[#e8b94a]" },
  { tag: "Export", title: "Honest exports", text: "PDF blueprints, OpenAPI specs, Archify diagrams — rendered from stored state, 1:1.", dot: "bg-[#a4d4c5]" },
];

const METRICS = [
  { value: "0.90", label: "Recall@3 retrieval" },
  { value: "100%", label: "Traceability coverage" },
  { value: "35/35", label: "Tests green" },
  { value: "0", label: "Failures over 9 runs" },
];

const MOCK_STAGES = [
  { label: "Requirements", detail: "8 approved", done: true },
  { label: "Product Spec", detail: "17 sections", done: true },
  { label: "Architecture", detail: "5 components", done: true },
  { label: "Traceability", detail: "100% · 0 orphans", done: true },
  { label: "Consistency", detail: "2 open issues", done: false },
];

export default function Landing() {
  return (
    <div className="mx-auto max-w-[1280px] px-5 pb-16">
      <header className="flex h-16 items-center justify-between">
        <p className="flex items-center gap-2 text-[14px] font-semibold">
          <Image src="/logo.svg" alt="BlueprintAI logo" width={30} height={30} className="rounded-lg" />
          Blueprint&nbsp;AI
        </p>
        <nav className="hidden items-center gap-6 text-[14px] font-medium text-secondary md:flex" aria-label="Landing">
          <a href="#pipeline" className="hover:text-primary">Pipeline</a>
          <a href="#features" className="hover:text-primary">Features</a>
          <a href="#metrics" className="hover:text-primary">Evidence</a>
        </nav>
        <Link href="/dashboard" className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-primary px-5 text-[14px] font-semibold text-canvas hover:opacity-90">
          Open workspace <ArrowRight size={14} aria-hidden />
        </Link>
      </header>

      <section className="grid items-center gap-10 py-16 md:grid-cols-[7fr_5fr] md:py-24">
        <div>
          <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-muted">
            Idea → PRD → architecture → validation
          </p>
          <h1 className="mt-3 text-[48px] font-medium leading-[1.0] md:text-[72px]">
            Go to market with a blueprint you can prove.
          </h1>
          <p className="mt-5 max-w-[52ch] text-[16px] leading-relaxed text-secondary">
            BlueprintAI turns a product idea into requirements, specs, architecture, and tests —
            grounded in your docs, linked end-to-end, and verified by deterministic checks.
            Coverage is computed from stored links. The LLM never invents it.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/dashboard" className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-primary px-5 text-[14px] font-semibold text-canvas hover:opacity-90">
              Start blueprinting <ArrowRight size={15} aria-hidden />
            </Link>
            <a href="#pipeline" className="inline-flex h-11 items-center rounded-xl border border-border-strong px-5 text-[14px] font-semibold hover:bg-elevated">
              How it works
            </a>
          </div>
        </div>
        <div className="rounded-3xl border border-border bg-surface p-6" aria-label="Product preview">
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">Expense Platform Demo · live workspace</p>
          <ul className="mt-4 grid gap-2">
            {MOCK_STAGES.map((s) => (
              <li key={s.label} className="flex items-center gap-3 rounded-xl border border-border px-3.5 py-2.5">
                <span className={`grid h-5 w-5 flex-none place-items-center rounded-full ${s.done ? "bg-success" : "bg-warning"}`} aria-hidden>
                  {s.done && <Check size={12} className="text-white" />}
                </span>
                <span className="text-[13.5px] font-medium">{s.label}</span>
                <span className="ml-auto font-mono text-[12px] text-muted">{s.detail}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 rounded-xl bg-elevated p-3.5">
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">Copilot · rule-based</p>
            <p className="mt-1 text-[13px] leading-relaxed">“8 requirements (8 approved), 3 stories, 5 APIs, traceability 100%. Gaps: none.”</p>
          </div>
        </div>
      </section>

      <section id="pipeline" className="scroll-mt-6 py-12">
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">Pipeline</p>
        <h2 className="mt-1 max-w-[20ch] text-[32px] font-medium leading-[1.1] md:text-[40px]">Four stages, every handoff stored and traceable.</h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-4">
          {PIPELINE.map((s) => (
            <li key={s.n} className="rounded-3xl border border-border bg-surface p-8">
              <p className={`inline-block rounded-lg px-2 py-0.5 font-mono text-[13px] font-semibold ${s.chip}`}>{s.n}</p>
              <h3 className="mt-5 text-[18px] font-semibold">{s.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-secondary">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="features" className="scroll-mt-6 py-12">
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">Why teams trust it</p>
        <h2 className="mt-1 max-w-[22ch] text-[32px] font-medium leading-[1.1] md:text-[40px]">Guarantees, enforced in code — not promised in copy.</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-3xl border border-border bg-surface p-8">
              <p className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
                <span className={`h-2 w-2 rounded-full ${f.dot}`} aria-hidden />{f.tag}
              </p>
              <h3 className="mt-3 text-[18px] font-semibold">{f.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-secondary">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="metrics" className="scroll-mt-6 py-12">
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">Evidence</p>
        <h2 className="mt-1 text-[32px] font-medium leading-[1.1] md:text-[40px]">Measured, not claimed.</h2>
        <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-4">
          {METRICS.map((m) => (
            <div key={m.label} className="bg-surface px-5 py-6">
              <dd className="font-mono text-[30px] font-bold tabular-nums">{m.value}</dd>
              <dt className="mt-1 font-mono text-[11px] uppercase tracking-[0.1em] text-muted">{m.label}</dt>
            </div>
          ))}
        </dl>
        <p className="mt-3 font-mono text-[11.5px] text-muted">evaluation/benchmark.py — mock LLM, temp SQLite DB. Re-run to reproduce.</p>
      </section>

      <section className="mt-8 rounded-3xl bg-[#1a3a3a] p-10 text-white md:p-20">
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-white/60">Local-first</p>
        <h2 className="mt-2 max-w-[20ch] text-[32px] font-medium leading-[1.1] md:text-[40px]">Bring your idea. Leave with a blueprint.</h2>
        <p className="mt-3 max-w-[52ch] text-[15px] text-white/75">Runs locally in minutes — SQLite default, no Docker, mock LLM until you add a key.</p>
        <Link href="/dashboard" className="mt-8 inline-flex h-11 items-center gap-1.5 rounded-xl bg-white px-5 text-[14px] font-semibold text-[#0a0a0a] hover:opacity-90">
          Open workspace <ArrowRight size={15} aria-hidden />
        </Link>
      </section>

      <footer className="mt-12 bg-subtle px-2 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-secondary">
          <p className="flex items-center gap-2">
            <Image src="/logo.svg" alt="" width={22} height={22} className="rounded-md" aria-hidden />
            BlueprintAI — deterministic engineering blueprints.
          </p>
          <p className="flex gap-5">
            <Link href="/dashboard" className="hover:text-primary hover:underline">Workspace</Link>
            <a href="https://www.rareui.com" target="_blank" rel="noreferrer" className="hover:text-primary hover:underline">Rare UI</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
