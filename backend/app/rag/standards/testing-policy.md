# Testing Policy (default pack)

How much testing a generated service needs, and what "tested" means. CI is the
source of truth: a suite that only passes on the author's machine is not a
suite.

## Test pyramid

- Unit tests cover pure logic: pricing, scoring, validation, state transitions.
  They run in milliseconds and need no network or database.
- Integration tests cover the API boundary against a real database (SQLite for
  local runs, Postgres in CI). Every route gets at least one success case and
  one authorization failure.
- End-to-end tests cover the critical user journeys only: sign in, create,
  approve, export. Three to ten flows, not every page.
- The pyramid is a budget, not a religion. A bug that escaped to production gets
  a regression test at the lowest level that can reproduce it.

## What every endpoint must prove

- Happy path returns the documented status and schema.
- Missing or expired credentials return `401`.
- A user outside the tenant gets `403` or `404`, never data.
- Invalid input returns `4xx` with the error envelope, not a `500`.
- A state conflict (duplicate, stale version) returns `409`.
- No test asserts on a stack trace, a timestamp string, or dict ordering.

## Determinism and isolation

- Tests never depend on execution order, wall-clock time, or the network.
  Anything time- or randomness-dependent is injected or frozen.
- Each test session owns a fresh disposable database; fixtures create the rows
  they need and do not mutate global state.
- The LLM and embedding providers default to deterministic stubs in tests. A
  test that needs a live model is marked and excluded from the default run.
- Retrieval tests assert ranking properties (the expected chunk is in the top
  k), not exact float scores.

## Coverage and CI gates

- Line coverage is a floor, not a goal: 80% overall, 100% of authorization
  branches. Coverage that only exercises getters is noise.
- CI runs lint, type check, unit and integration tests on every push and pull
  request. A red pipeline blocks merge; there is no "merge and fix later".
- Flaky tests are quarantined with an owner and a deadline, never retried until
  green.
- Migrations are tested forward and backward against a database with existing
  rows, not an empty schema.

## Test data

- Fixtures use obviously fake data (`demo@example.test`, `+1-555-0100`). Real
  customer data never enters a test database.
- A seed script builds a demo workspace through the public API so the same code
  path users hit is the one under test.
- Large fixtures live in files, not inline literals, and are generated when they
  can be.
