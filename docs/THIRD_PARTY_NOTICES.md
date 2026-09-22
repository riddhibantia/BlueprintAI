# Third-Party Notices

## Archify (tt-a1i/archify) — MIT License

`GET /projects/{pid}/export/archify` emits diagram JSON shaped to Archify's
published `architecture` schema (schema_version 1) so blueprints render in
Archify's viewer/CLI. No Archify code is vendored or embedded; only the open
schema shape is targeted, with provenance credited inside the exported file.

- Source: https://github.com/tt-a1i/archify
- License: MIT — free to use, modify, and distribute (see their LICENSE).
- Usage: `node archify/bin/archify.mjs deliver architecture <exported>.archify.json out.html`
