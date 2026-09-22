# Security (§34)

Applies to the MVP as built. Anything here marked "planned" is not claimed as done.

## Implemented

- **Authentication**: email + bcrypt (SHA-256 pre-stretch, cost 12). Min length 8 enforced at the schema boundary.
- **Sessions**: httpOnly `SameSite=Lax` cookie (`Secure` in prod). JS never sees the token. Explicit `Authorization` header still accepted for scripts/API clients.
- **Project-level authorization**: every project route goes through `project_or_403` (owner or member). Cross-user access returns 403 — covered by `test_isolation_between_users`.
- **Document isolation**: chunks are always queried through a project-scoped join; user B gets 403 before any content is touched.
- **Upload validation**: PDF/TXT/MD allowlist, 15MB cap, checksum dedupe. Filenames never touch the filesystem (stored as `{uuid}.txt`).
- **Input validation**: Pydantic schemas on all writes; status fields use fixed vocabularies (409/400 otherwise).
- **Secrets**: `.env` gitignored, `.env.example` documents everything; JWT secret from env only.
- **Audit logs**: register/login, project create, requirement generate/approve/delete, upload, consistency check/decision, impact, traceability suggestions, PRD/arch edits. No document contents or secrets in logs.
- **Optimistic locking**: requirement edits take `expected_version`; stale writes get 409 instead of silent overwrites.

## Planned (post-MVP / AWS phase)

- Rate limiting on auth endpoints, RBAC roles beyond owner/editor/viewer, S3 + KMS storage, CloudWatch alarms, prompt-injection test harness with adversarial fixtures.
