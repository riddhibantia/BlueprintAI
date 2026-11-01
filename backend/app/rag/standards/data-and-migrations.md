# Data and Migrations (default pack)

Schema rules for generated services. The database is a long-lived contract:
changing it is a deployment, not an edit.

## Naming and keys

- Tables are plural `snake_case` (`expense_reports`); columns are singular
  `snake_case` (`created_at`). No reserved words, no quoted identifiers.
- Every table has a stable primary key. Prefer an opaque id (UUID or a
  prefixed string) over a mutable natural key.
- Foreign keys are named `<table>_id` and are indexed. An unindexed foreign key
  is a missing index, not an optimisation.
- Booleans are `is_*` or `has_*` and are non-nullable with a default.
- Money is an integer in minor units plus a `currency` column; never a float.
- Timestamps are stored in UTC as `timestamptz` (`DateTime(timezone=True)` on
  Postgres), named `created_at` / `updated_at`.

## Constraints and integrity

- Enforce what the database can enforce: `NOT NULL`, `UNIQUE`, `CHECK`,
  foreign keys. Application-only validation drifts.
- Delete behaviour is explicit: `ON DELETE CASCADE` for owned children,
  `RESTRICT` for referenced master data, soft delete only when history matters.
- Soft-deleted rows get a `deleted_at` timestamp and every query filters on it;
  a boolean `is_deleted` plus no filter is a data leak waiting to happen.
- JSON columns are for genuinely schemaless payloads (metadata, provider
  responses), never for fields you filter or join on.

## Multi-tenancy

- Every tenant-owned table carries `tenant_id` or `project_id`, indexed, and
  included in every uniqueness constraint that should be per-tenant.
- Composite indexes put the tenant column first: `(project_id, created_at)`.
- Row-level security is enabled on Postgres for tenant tables as defence in
  depth; the application still filters explicitly.

## Migrations

- Migrations are versioned, forward-only files committed with the code that
  needs them. No manual production edits.
- Every migration is reversible or explicitly documented as irreversible.
- Adding a `NOT NULL` column is three steps: add nullable, backfill in batches,
  then enforce. Never lock a large table with a rewrite in one shot.
- Renames are add-copy-drop, not `ALTER ... RENAME`, so old and new code can run
  during a rolling deploy.
- Indexes are created concurrently on Postgres for live tables.
- A migration is tested against a database containing real-shaped rows, and the
  rollback path is exercised in CI.

## Query hygiene

- No `SELECT *` in application code; select the columns you return.
- List endpoints paginate at the database, not in memory. Loading a table and
  slicing it in Python fails at the first real customer.
- Watch for N+1 queries: relationship access inside a loop is a review blocker;
  use a join or an eager load.
- Long-running reports run in a background job, not inside a request.
