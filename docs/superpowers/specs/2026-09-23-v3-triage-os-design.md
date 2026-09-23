# V3 Design Spec — "Triage OS, familiar first" (2026-09-23)

## Goal
Rebuild DevBlueprint's frontend so a first-time user understands it instantly:
visible lifecycle navigation, a triage inbox home, shared cached data, contextual Copilot.
Backend, APIs, auth, data, and calculations are untouched.

## Decisions (user-approved)
1. UX: Triage OS (Linear-style) + borrowed bits (Notion slash hints, NotebookLM citation chips).
2. Navigation: visible lifecycle-grouped sidebar (Inbox on top), ⌘K + G-keys as accelerators.
3. Data: TanStack Query with per-project keys; shell context holds UI state only.
4. Copilot: contextual (per-page guide + selection-aware), opened on demand via panel button or ⌘K.

## Information architecture
- Sidebar: Inbox (badge = orphans + open issues) → Discover (Overview, Requirements) → Define (PRD, Stories) → Design (Architecture, Data Model, APIs, Security) → Build (Tasks) → Verify (Tests, Traceability, Consistency, Impact) → Graph → Knowledge → Settings/Profile.
- Routes unchanged (13 modules + overview/blueprint/settings/profile stay deep-linkable).
- Home (`projects/[id]`): health strip (4 real metrics) + triage queue + recent activity.

## Data layer
- `QueryClientProvider` in project layout; keys: `['p', pid, '<artifact>']`.
- Mutations (approve/generate/decide/link) invalidate related keys — no manual reloads.
- `lib/query/lifecycle.ts` + `links.ts` become selectors over cached data.
- staleTime 30s, refetchOnWindowFocus true. Auth redirect stays centralized in `lib/api/client.ts`.

## Key screens
- Inbox home: triage rows (severity, age, one-key act) + health strip + activity.
- Module pages: tables + drawers, doc workspace (PRD), React Flow canvases, explorer/inspector splits.
- Copilot: Ask tab (citations as `[REQ-x]` chips) + Activity tab; opens via button/palette.
- States: Loading/Empty/Error/Approval/Version/Outdated everywhere; responsive + a11y preserved.

## Non-goals
- No backend changes (except none planned). No new deps beyond @tanstack/react-query.
- No route removals. No fabricated data — every number from cache of real endpoints.

## Verification
- `pytest backend/tests`, `npm run build`, `benchmark --full`, 41-check live sweep, click-through.
