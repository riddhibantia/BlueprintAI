# Evaluation (§36)

All numbers below are measured by running `evaluation/benchmark.py --full`
(temp SQLite DB, deterministic mock LLM). No invented metrics — re-run to reproduce.

## Last measured run (2026-09-29, Windows, mock LLM, temp SQLite DB, hash embeddings)

`python evaluation/benchmark.py --full --repeats 3` — 9 green runs, 0 failures.

### Retrieval (seeded fixture: 12 chunks, 4 topics, 43 queries with known answers)

35 keyword-grounded queries (`std`) + 8 adversarial paraphrases with no keyword
overlap (`adv`). Reported split — the `adv` subset is *expected* to fail under
hash embeddings; it quantifies the semantic gap real embeddings close.

| Subset | n | Recall@1 | Recall@3 | MRR |
|---|---|---|---|---|
| std (keyword-grounded) | 35 | 0.971 | 1.000 | 0.981 |
| adv (no-overlap paraphrases) | 8 | 0.250 | 0.250 | 0.250 |
| overall | 43 | 0.837 | 0.860 | 0.845 |

History: the first 10-query fixture scored R@3 0.80 and exposed a stemming gap
(`writes`≠`write`, `idempotent`≠`idempotency`, unsplittable `rate-limit`);
prefix-token normalization moved it to 0.90 with all 35 tests green, then the
fixture grew to 43. Only 2/8 adversarial queries hit — e.g. "how to secure API
writes?" cannot bridge `secure`→`JWT` without semantic vectors.

### Embedding ablation (same fixture, same code path)

`OPENAI_API_KEY=... python evaluation/benchmark.py --embeddings both`
(~600 embedding calls through production `retrieve()`, takes minutes).
Without a key the OpenAI leg reports `skipped` — never faked. No keyed run has
been recorded in this repo yet; the `adv` row above is the baseline the
semantic leg is expected to beat.

### Pipeline (all 3 ideas × 3 repeats, per-idea end-to-end)

| Idea | Reqs → Stories / APIs / Tests | Traceability | Orphans | Issues | Test cov. | Mean total |
|---|---|---|---|---|---|---|
| employee expense platform | 8 → 3 / 5 / 8 | 100% | 0 | 2 | 100% | ~0.8 s |
| online tutoring marketplace | 8 → 3 / 5 / 8 | 100% | 0 | 2 | 100% | ~0.5 s |
| inventory tracker (kirana) | 8 → 3 / 5 / 8 | 100% | 0 | 2 | 100% | ~0.6 s |

Per-stage means < 100 ms (generate/check/export); first-run cold start ~1.8 s.
~960 mock tokens per idea pipeline. Counts are identical across ideas because
the mock generators are template-driven — swap in an LLM key for variance;
the linking/coverage math is what is under test.

## What is measured

| Area | Metric | Source |
|---|---|---|
| RAG | retrieval hit rate on seeded standards, top-1 score | `retrieve()` over ingested chunks |
| Artifact generation | requirements/stories/APIs/tasks/tests counts, per-stage latency | timed pipeline run |
| Traceability | coverage %, orphan count | `coverage()` on stored links |
| Consistency | issues found by check | `run_checks()` output |
| Impact | affected-artifact count for a requirement change | `analyze()` output |
| Operations | total pipeline latency, failure count | wall clock + HTTP statuses |

## Comparison the spec asks for

`Baseline LLM vs LLM + RAG vs LLM + RAG + Multi-Agent` — the harness runs the
deterministic pipeline (mock LLM) with and without seeded knowledge documents,
so the RAG lift is observable in evidence usage (`AgentRun.evidence`) and in
whether generations cite sources. The LangGraph workflow path vs the sequential
fallback is selected automatically and reported in the output.

## Unit / integration / E2E

- `backend/tests/test_engines.py` — chunking, embeddings, retrieval
- `backend/tests/test_api_e2e.py` — full idea→export flow + auth guard
- `backend/tests/test_review_fixes.py` — regression tests for review findings
- `backend/tests/test_auth_cookies.py` — httpOnly session lifecycle
- `backend/tests/test_mvp_complete.py` — §39/§42 completion (all modules, PDF, isolation, locking)
