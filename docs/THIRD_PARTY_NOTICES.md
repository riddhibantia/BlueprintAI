# Third-Party Notices

## Archify (tt-a1i/archify) — MIT License

`GET /projects/{pid}/export/archify` emits diagram JSON shaped to Archify's
published `architecture` schema (schema_version 1) so blueprints render in
Archify's viewer/CLI. No Archify code is vendored or embedded; only the open
schema shape is targeted, with provenance credited inside the exported file.

- Source: https://github.com/tt-a1i/archify
- License: MIT — free to use, modify, and distribute (see their LICENSE).
- Usage: `node archify/bin/archify.mjs deliver architecture <exported>.archify.json out.html`

## Rare UI (swamimalode07/rare-ui) — personal/non-commercial use with credit

Six single-file components are vendored under `frontend/components/ui/`
(`task-list`, `step-player`, `code-block`, `folder-component`,
`hook-sidebar`, `scroll-progress`), installed via
`npx shadcn add swamimalode07/rare-ui/<name>` and wired to real app state
(task checklist, pipeline player/progress, API schemas,
knowledge collections, PRD outline). No RareUI code is modified beyond
theming bridges; the app footer links back to the source as required.

- Source: https://www.rareui.com/components
- License: personal and non-commercial projects only; commercial use needs
  an active Rare UI sponsorship; visible credit required (see app footer).
