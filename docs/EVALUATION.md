# Evaluation (§36)

All numbers below are measured by running `evaluation/benchmark.py --full`
(temp SQLite DB, deterministic mock LLM). No invented metrics — re-run to reproduce.

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
