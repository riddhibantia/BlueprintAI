import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

const PIPELINE = [
  { n: "01", title: "Capture", text: "Product idea becomes clarified, RAG-grounded requirements with stable IDs and explicit approval gates.", img: "/img/sketch-notebook.jpg", alt: "Hands sketching product ideas beside a laptop" },
  { n: "02", title: "Design", text: "PRD, user stories, architecture, data model, APIs and security controls — every artifact interlinked.", img: "/img/diagram-pointing.jpg", alt: "A hand tracing a system diagram pinned to a whiteboard" },
  { n: "03", title: "Verify", text: "Deterministic traceability, consistency rules and impact analysis. Coverage is computed from stored links, never guessed.", img: "/img/team-whiteboard.jpg", alt: "Team reviewing a wall of linked notes during a planning session" },
  { n: "04", title: "Ship", text: "Export PDF blueprints, OpenAPI specs and Archify diagram IR — rendered 1:1 from stored state.", img: "/img/site-aerial.jpg", alt: "Aerial view of a construction site laid out to plan" },
];

const FEATURES = [
  { tag: "RAG", title: "Grounded generation", text: "Upload standards documents. Every artifact cites retrieved evidence, or states plainly what is missing. No invented requirements." },
  { tag: "Links", title: "End-to-end traceability", text: "Requirement → story → API → task → test, with coverage percentage and automatic orphan detection." },
  { tag: "Checks", title: "Consistency engine", text: "Cross-artifact rules surface real contradictions with explanations you accept or reject. Human approval is authoritative state." },
  { tag: "Change", title: "Impact analysis", text: "Change one requirement and see every downstream artifact it touches — before you commit anything." },
  { tag: "Humans", title: "Approval gates", text: "Optimistic locking, audit trail, explicit approvals. AI proposes; humans dispose." },
  { tag: "Export", title: "Honest exports", text: "PDF blueprints, OpenAPI and Archify diagrams generated from stored state, never from model recall." },
];

/* The five atmospheric tokens. Each orb-card carries exactly one; orbs are
   decoration only and never hold interactive content. */
const ORBS = [
  { tone: "mint", label: "Grounded", text: "Retrieval cites the chunk it used." },
  { tone: "peach", label: "Linked", text: "Artifacts share stable identifiers." },
  { tone: "lavender", label: "Checked", text: "Rules run across every artifact." },
  { tone: "sky", label: "Measured", text: "Coverage comes from stored links." },
  { tone: "rose", label: "Approved", text: "A person signs off before export." },
];

const METRICS = [
  { value: "1.00", label: "Recall@3 retrieval" },
  { value: "100%", label: "Traceability coverage" },
  { value: "38/38", label: "Tests green" },
  { value: "0", label: "Failures over 9 runs" },
];

const MOCK_STAGES = [
  { label: "Requirements", detail: "8 approved", done: true },
  { label: "Product Spec", detail: "17 sections", done: true },
  { label: "Architecture", detail: "5 components", done: true },
  { label: "Traceability", detail: "100% · 0 orphans", done: true },
  { label: "Consistency", detail: "2 open issues", done: false },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] font-semibold uppercase tracking-[0.96px] text-muted">{children}</p>;
}

export default function Landing() {
  return (
    <div className="overflow-x-clip">
      {/* ---------------- top-nav ---------------- */}
      <header className="sticky top-0 z-30 border-b border-border bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-6 px-5">
          <Link href="/" className="flex items-center gap-2 text-[15px] font-medium text-primary">
            <Image src="/logo.svg" alt="BlueprintAI logo" width={28} height={28} className="rounded-full" />
            Blueprint<span className="text-muted">AI</span>
          </Link>
          <nav aria-label="Primary" className="ml-auto hidden items-center gap-6 md:flex">
            <a href="#pipeline" className="text-[15px] text-secondary transition-colors hover:text-primary">Pipeline</a>
            <a href="#features" className="text-[15px] text-secondary transition-colors hover:text-primary">Capabilities</a>
            <a href="#evidence" className="text-[15px] text-secondary transition-colors hover:text-primary">Evidence</a>
          </nav>
          <div className="ml-auto flex items-center gap-2.5 md:ml-0">
            <Link href="/dashboard" className="hidden h-10 items-center px-4 text-[15px] font-medium text-primary transition-colors hover:text-primary-active sm:inline-flex">
              Sign in
            </Link>
            <Link href="/dashboard" className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-5 text-[15px] font-medium text-on-accent transition-[background-color,transform] duration-150 hover:bg-primary-active active:scale-[0.98]">
              Try free <ArrowRight size={15} aria-hidden />
            </Link>
          </div>
        </div>
      </header>

      {/* ---------------- hero-band ---------------- */}
      <section className="relative isolate px-5 py-20 md:py-28">
        <div className="orb orb-lavender orb-drift -top-24 left-[8%] h-[420px] w-[420px]" aria-hidden />
        <div className="orb orb-peach orb-drift-slow top-16 right-[6%] h-[360px] w-[360px]" aria-hidden />
        <div className="orb orb-sky orb-drift top-64 left-[42%] h-[300px] w-[300px]" aria-hidden />

        <div className="relative z-10 mx-auto max-w-[1200px]">
          <div className="mx-auto max-w-[840px] text-center">
            <p className="rise-in text-[12px] font-semibold uppercase tracking-[0.96px] text-muted">
              Idea → PRD → architecture → validation
            </p>
            <h1 className="rise-in rise-in-1 mt-5 text-[40px] font-light leading-[1.08] tracking-[-0.96px] text-primary sm:text-[52px] lg:text-[64px]">
              Go to market with a blueprint you can prove.
            </h1>
            <p className="rise-in rise-in-2 mx-auto mt-6 max-w-[62ch] text-[16px] leading-[1.5] text-secondary">
              BlueprintAI turns a product idea into requirements, specifications, architecture and tests —
              grounded in your own documents, linked end to end, and verified by deterministic checks.
              Coverage is computed from stored links, so the model never invents it.
            </p>
            <div className="rise-in rise-in-3 mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link href="/dashboard" className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-6 text-[15px] font-medium text-on-accent transition-[background-color,transform] duration-150 hover:bg-primary-active active:scale-[0.98]">
                Start blueprinting <ArrowRight size={15} aria-hidden />
              </Link>
              <a href="#pipeline" className="inline-flex h-10 items-center rounded-full border border-border-strong px-6 text-[15px] font-medium text-primary transition-colors hover:bg-subtle">
                How it works
              </a>
            </div>
          </div>

          {/* hero photograph — the brand voltage is photographic, not chromatic */}
          <figure className="rise-in rise-in-3 soft-drop mt-16 overflow-hidden rounded-3xl border border-border bg-surface">
            <Image
              src="/img/hero-drafting.jpg"
              alt="An engineer drafting a technical plan by hand with a ruler"
              width={1800}
              height={1013}
              priority
              className="h-[260px] w-full object-cover sm:h-[360px] lg:h-[440px]"
            />
          </figure>
        </div>
      </section>

      {/* ---------------- pipeline ---------------- */}
      <section id="pipeline" className="scroll-mt-20 border-t border-border px-5 py-24">
        <div className="mx-auto max-w-[1200px]">
          <SectionLabel>Pipeline</SectionLabel>
          <h2 className="mt-3 max-w-[22ch] text-[32px] font-light leading-[1.13] tracking-[-0.32px] sm:text-[40px]">
            Four stages, and every handoff is stored.
          </h2>
          <ol className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {PIPELINE.map((s) => (
              <li key={s.n} className="soft-drop-hover group overflow-hidden rounded-xl border border-border bg-surface">
                <Image src={s.img} alt={s.alt} width={1200} height={800}
                  className="h-40 w-full object-cover grayscale-[35%] transition-[filter] duration-300 group-hover:grayscale-0" />
                <div className="p-6">
                  <p className="font-mono text-[12px] tracking-[0.96px] text-muted">{s.n}</p>
                  <h3 className="mt-3 font-sans text-[20px] font-medium leading-[1.35] text-primary">{s.title}</h3>
                  <p className="mt-2.5 text-[14px] leading-[1.5] text-secondary">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------- gradient orb cards ---------------- */}
      <section className="relative isolate overflow-hidden bg-subtle px-5 py-24">
        <div className="orb orb-mint orb-drift-slow -left-20 top-10 h-[380px] w-[380px]" aria-hidden />
        <div className="orb orb-rose orb-drift bottom-0 right-0 h-[340px] w-[340px]" aria-hidden />
        <div className="relative z-10 mx-auto max-w-[1200px]">
          <SectionLabel>How it stays honest</SectionLabel>
          <h2 className="mt-3 max-w-[24ch] text-[32px] font-light leading-[1.13] tracking-[-0.32px] sm:text-[40px]">
            Guarantees enforced in code, not promised in copy.
          </h2>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ORBS.map((o) => (
              <div key={o.tone} className="relative isolate overflow-hidden rounded-3xl border border-border bg-surface p-8">
                <div className={`orb orb-${o.tone} orb-drift -right-10 -top-10 h-40 w-40 opacity-60`} aria-hidden />
                <div className="relative z-10">
                  <h3 className="text-[24px] font-light leading-[1.2] text-primary">{o.label}</h3>
                  <p className="mt-2.5 text-[14px] leading-[1.5] text-secondary">{o.text}</p>
                </div>
              </div>
            ))}
            {/* the workspace preview sits in the sixth cell so the row stays even */}
            <div className="rounded-3xl border border-border bg-surface p-6">
              <p className="text-[12px] font-semibold uppercase tracking-[0.96px] text-muted">Live workspace</p>
              <ul className="mt-4 grid gap-2">
                {MOCK_STAGES.map((s) => (
                  <li key={s.label} className="flex items-center gap-3 border-b border-border pb-2 last:border-0">
                    <span className={`grid h-5 w-5 flex-none place-items-center rounded-full ${s.done ? "bg-success" : "bg-warning"}`} aria-hidden>
                      {s.done && <Check size={12} className="text-white" />}
                    </span>
                    <span className="text-[13.5px] text-primary">{s.label}</span>
                    <span className="ml-auto font-mono text-[12px] text-muted">{s.detail}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
                Copilot: “8 requirements (8 approved), 3 stories, 5 APIs, traceability 100%. Gaps: none.”
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- features ---------------- */}
      <section id="features" className="scroll-mt-20 px-5 py-24">
        <div className="mx-auto max-w-[1200px]">
          <SectionLabel>Capabilities</SectionLabel>
          <h2 className="mt-3 max-w-[24ch] text-[32px] font-light leading-[1.13] tracking-[-0.32px] sm:text-[40px]">
            What the platform actually does for you.
          </h2>
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.tag} className="soft-drop-hover rounded-xl border border-border bg-surface p-8">
                <p className="text-[12px] font-semibold uppercase tracking-[0.96px] text-muted">{f.tag}</p>
                <h3 className="mt-3 font-sans text-[20px] font-medium leading-[1.35] text-primary">{f.title}</h3>
                <p className="mt-2.5 text-[14px] leading-[1.5] text-secondary">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- evidence ---------------- */}
      <section id="evidence" className="scroll-mt-20 border-t border-border bg-subtle px-5 py-24">
        <div className="mx-auto max-w-[1200px]">
          <SectionLabel>Evidence</SectionLabel>
          <h2 className="mt-3 max-w-[20ch] text-[32px] font-light leading-[1.13] tracking-[-0.32px] sm:text-[40px]">
            Measured, not claimed.
          </h2>
          <dl className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border lg:grid-cols-4">
            {METRICS.map((m) => (
              <div key={m.label} className="bg-surface px-6 py-8">
                <dd className="font-mono text-[30px] text-primary">{m.value}</dd>
                <dt className="mt-1.5 text-[12px] font-semibold uppercase tracking-[0.96px] text-muted">{m.label}</dt>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-[13px] text-muted">
            Reproduce with <code className="font-mono">python evaluation/benchmark.py</code> — mock LLM, temporary SQLite database, full pipeline.
          </p>
        </div>
      </section>

      {/* ---------------- cta-band ---------------- */}
      <section className="relative isolate overflow-hidden bg-canvas-deep px-5 py-24 text-white">
        <div className="orb orb-sky orb-drift-slow -left-16 -top-10 h-[340px] w-[340px] opacity-30" aria-hidden />
        <div className="orb orb-lavender orb-drift -bottom-16 right-0 h-[300px] w-[300px] opacity-30" aria-hidden />
        <div className="relative z-10 mx-auto max-w-[1200px] text-center">
          <p className="text-[12px] font-semibold uppercase tracking-[0.96px] text-white/60">Local-first</p>
          <h2 className="mx-auto mt-4 max-w-[20ch] text-[32px] font-light leading-[1.13] tracking-[-0.32px] sm:text-[40px]">
            Bring your idea. Leave with a blueprint.
          </h2>
          <p className="mx-auto mt-5 max-w-[58ch] text-[16px] leading-[1.5] text-white/75">
            Runs locally in minutes. SQLite by default, no Docker required, and a deterministic mock LLM until you add a key.
          </p>
          <div className="mt-9 flex justify-center">
            <Link href="/dashboard" className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white px-6 text-[15px] font-medium text-canvas-deep transition-transform duration-150 active:scale-[0.98]">
              Open workspace <ArrowRight size={15} aria-hidden />
            </Link>
          </div>
          <figure className="mt-16 overflow-hidden rounded-3xl border border-white/10">
            <Image src="/img/quiet-office.jpg" alt="A quiet studio workspace in morning light"
              width={1200} height={800}
              className="h-[220px] w-full object-cover opacity-90 sm:h-[300px]" />
          </figure>
        </div>
      </section>

      {/* ---------------- footer ---------------- */}
      <footer className="border-t border-border bg-canvas px-5 py-12">
        <div className="mx-auto grid max-w-[1200px] gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <p className="flex items-center gap-2 text-[15px] font-medium">
              <Image src="/logo.svg" alt="" width={24} height={24} className="rounded-full" aria-hidden />
              BlueprintAI
            </p>
            <p className="mt-3 max-w-[34ch] text-[15px] leading-[1.47] text-secondary">
              Deterministic engineering blueprints, grounded in your own documentation.
            </p>
          </div>
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.96px] text-muted">Product</p>
            <ul className="mt-4 grid gap-2.5">
              <li><a href="#pipeline" className="text-[15px] text-secondary transition-colors hover:text-primary">Pipeline</a></li>
              <li><a href="#features" className="text-[15px] text-secondary transition-colors hover:text-primary">Capabilities</a></li>
              <li><a href="#evidence" className="text-[15px] text-secondary transition-colors hover:text-primary">Evidence</a></li>
            </ul>
          </div>
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.96px] text-muted">Workspace</p>
            <ul className="mt-4 grid gap-2.5">
              <li><Link href="/dashboard" className="text-[15px] text-secondary transition-colors hover:text-primary">Sign in</Link></li>
              <li><Link href="/dashboard" className="text-[15px] text-secondary transition-colors hover:text-primary">Create account</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.96px] text-muted">Credits</p>
            <ul className="mt-4 grid gap-2.5">
              <li><a href="https://www.rareui.com" target="_blank" rel="noreferrer" className="text-[15px] text-secondary transition-colors hover:text-primary">Rare UI</a></li>
              <li><a href="https://github.com/tt-a1i/archify" target="_blank" rel="noreferrer" className="text-[15px] text-secondary transition-colors hover:text-primary">Archify</a></li>
              <li><a href="https://unsplash.com" target="_blank" rel="noreferrer" className="text-[15px] text-secondary transition-colors hover:text-primary">Unsplash</a></li>
            </ul>
          </div>
        </div>
        <p className="mx-auto mt-12 max-w-[1200px] border-t border-border pt-6 text-[13px] text-muted">
          Photography from Unsplash under the Unsplash License. Type is EB Garamond and Inter.
        </p>
      </footer>
    </div>
  );
}
