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

Two single-file components are vendored under `frontend/components/ui/`
(`task-list`, `code-block`), installed via
`npx shadcn add swamimalode07/rare-ui/<name>` and wired to real app state
(task checklist, API schemas). No RareUI code is modified beyond
theming bridges; the app footer links back to the source as required.

- Source: https://www.rareui.com/components
- License: personal and non-commercial projects only; commercial use needs
  an active Rare UI sponsorship; visible credit required (see app footer).

## Photography (Unsplash) — Unsplash License

Six photographs are bundled in `frontend/public/img/` and used on the landing
page: `hero-drafting`, `team-whiteboard`, `diagram-pointing`, `site-aerial`,
`sketch-notebook`, `quiet-office`.

- Source: https://unsplash.com — each file traces to the photo id in the table
  below, served from `images.unsplash.com` and committed locally (no hotlinking,
  so the pages do not depend on a third-party CDN at view time).
- License: Unsplash License — free for commercial and non-commercial use, no
  permission needed, attribution not required.
- Attribution is nevertheless recorded here in good faith. Photographer names
  could not be captured programmatically: `unsplash.com` blocks automated
  requests, and resolving them would need an Unsplash API key. Rather than
  guess, this file links each photo page instead. Replace with real names if
  you later add an API key.

| File | Photo id |
|---|---|
| `hero-drafting.jpg` | `photo-1503387762-592deb58ef4e` |
| `team-whiteboard.jpg` | `photo-1552664730-d307ca884978` |
| `diagram-pointing.jpg` | `photo-1519389950473-47ba0277781c` |
| `site-aerial.jpg` | `photo-1541888946425-d81bb19240f5` |
| `sketch-notebook.jpg` | `photo-1454165804606-c3d57bc86b40` |
| `quiet-office.jpg` | `photo-1497215728101-856f4ea42174` |

## Fonts

- **Inter** — SIL Open Font License 1.1, via `next/font`.
- **JetBrains Mono** — SIL Open Font License 1.1, via `next/font`.
- **EB Garamond** — SIL Open Font License 1.1, via `next/font`. Used as the
  display serif in place of Waldenburg Light, which is commercially licensed
  and therefore not redistributed here.

## npm dependencies

Runtime packages are listed in `frontend/package.json`; each carries its own
license. Notable permissive-licensed items: Next.js (MIT), React (MIT),
Tailwind CSS (MIT), TanStack Query (MIT), xyflow / React Flow (MIT),
lucide-react (ISC), motion (MIT), mermaid (MIT), prism-react-renderer (MIT).
