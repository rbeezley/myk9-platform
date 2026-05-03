# Open Todos

Active work items only. Resolved items and full context live in TO-DOS.md.

---

## North Star — Phase 2: Walk the Golden Paths

- [ ] **Phase 2 re-walk** — First pass complete 2026-05-03. Do a second end-to-end walk for secretary and exhibitor paths before Phase 3 hand-off. Exit: both paths complete without a blocker.
- [ ] **Build `/exhibitor/check-in/:entryId` page** — Route + `ClassCheckIn.tsx` UI exist but use mock data. Needs: (1) page component reading `useParams<{ entryId }>()` + Supabase fetch, (2) "Check In" CTA on `/exhibitor/show-day`. Files: `apps/myk9show/src/components/exhibitor/ClassCheckIn.tsx`, `apps/myk9show/src/pages/ShowDayPage.tsx`, `apps/myk9show/src/types/exhibitor-types.ts`.
- [ ] **Secretary Task Timeline View** — Add Timeline toggle to Tasks tab on secretary dashboard. Plan: `docs/plans/2026-05-02-secretary-task-timeline-view-plan.md`. No migration required for v1.

## North Star — Phase 3: Real-User Testing

- [ ] **Phase 3 — Real-User Testing** — Recruit 2–3 non-technical test users (one secretary, one or two exhibitors). Hand them written tasks, watch silently, fix every hesitation. Full plan: `docs/plans/strategy/2026-04-11-north-star-fall-2026.md`.

## Phase 3 Polish (found during Phase 2 walk, 2026-05-03)

- [ ] **Show cards: no personalized badge for logged-in users** — Cards always show generic status ("Accepting Entries") even when user already entered. Needs `userHasEntriesForShow` wired into browse show cards.
- [ ] **Entry date missing label on MyEntriesPage** — Calendar icon date is the entry close date but has no label clarifying that. Minor polish.

## Route & Page Audit Findings

- [ ] **Admin / judge / club-admin interior audit** — Routes under `/admin/*`, `/judge/*`, `/club-admin/*` not walked end-to-end. Need a pass as SITE_ADMIN (and JUDGE for `/judge/*`) to surface 400s, broken UI, or missing data.
- [ ] **`/results/dashboard` Base UI button warning** — Not reproducible on page load; may only fire on specific interactions. Re-investigate next time it surfaces with a repro path. Files: components rendered by `/results/dashboard`.
- [ ] **Judge surfaces: mock/seed data** — `/judge/dashboard` shows "Today's Classes 8, 3 completed" and `/judge/check-in` shows "Total Entries 40 · Checked In 30 · Conflicts 3" for a fresh judge who has zero real data. Confirm whether dashboards read real data or hardcoded values; swap seeds for real queries / empty state.

## People & Clubs CRUD

- [ ] **People CRUD full audit** — End-to-end audit: create, read, update, delete people as secretary + admin; monitor console/network. Files: `apps/myk9show/src/features/people/`. Full context in TO-DOS.md § "People CRUD + Test Clubs Audit — 2026-04-25".
- [ ] **Clubs full CRUD audit** — Walk create, read, update, delete, list, detail as site admin; capture console/network errors. Files: `apps/myk9show/src/pages/clubs/`. Full context in TO-DOS.md § "Clubs Full CRUD Audit and Fix — 2026-04-25".
- [ ] **Add Club: silent validation + RLS gate as secretary** — Button does nothing visible on first click; secretary 403s on submit anyway (by design but UI doesn't say so). Either hide Add Club from non-admins or gate button on `useIsSiteAdmin()`. Files: `apps/myk9show/src/components/panels/entities/ClubCreationPanel.tsx`. Full context in TO-DOS.md § "People CRUD Audit Findings — 2026-04-25".

## Payments & Email

- [ ] **Wire Up Resend API Key** — `send-email` edge function silently returns 503; `RESEND_API_KEY` is missing from edge function secrets. Ops task only — copy key from Supabase Auth → Edge Function Secrets, add `RESEND_WEBHOOK_SECRET`. No code change. Full context in TO-DOS.md § "Wire Up Resend API Key — 2026-04-28".
- [ ] **Stripe Integration** — No Stripe integration exists. Entry fees need Stripe Connect (club's connected account + platform convenience fee via `application_fee_amount`). Includes club Stripe onboarding flow + webhook. Full context in TO-DOS.md § "Stripe Integration + Exhibitor Payments Page — 2026-04-30".
- [ ] **Exhibitor Payments page** — `/exhibitor/payments` list view: date, show name, amount, Stripe reference, status, receipt link. Blocked on Stripe integration above. Files: `apps/myk9show/src/pages/`.

## Pre-Launch Housekeeping

- [ ] **CI-gated Vercel deploys** — Disable Vercel auto-deploy for production branch; add deploy step to GitHub Actions after all tests pass. Requires `VERCEL_TOKEN` secret.
- [ ] **Require PRs to merge into main** — Enable branch protection on `main` with CI as required status check. No direct pushes to main in production.
- [ ] **Make E2E CI jobs blocking** — Skipped historically due to billing issues + unstable test suite. Revisit once tests are stable.
- [ ] **Pre-load AKC & UKC Judge Directory** — Import judge directories into `people` + `judge_qualifications` before launch. Format TBD; check akc.org and ukc.org for CSV/XML export.

---

## Post-Fall (parked — do not pick up before Phase 3 exit)

- [ ] **Prevent Duplicate Rows in Core Tables** — Uniqueness constraints on people/dogs/clubs. Requires duplicate-audit + merge migration before adding constraints. Full context in TO-DOS.md.
- [ ] **Configurable Exhibitor Convenience Fee** — Per-show override + site-admin default. Full context in TO-DOS.md.
- [ ] **Role-Mode Icon Switcher for Sidebar Nav** — Replace labelled section groups with icon-mode switcher (Claude Desktop pattern). Brainstorm before implementing. Full context in TO-DOS.md.
- [ ] **Queue-based Offline Dog Create** — Extend MutationManager to `dogs` table; replace rollback pattern with enqueue. Full context in TO-DOS.md.
- [ ] **Review awesome-design-md for Design Consistency** — Evaluate against current dual approach (shadcn/ui + semantic CSS).
- [ ] **Research Claude Code Managed Agents for AskQ** — Evaluate managed agents API for the AskQ feature. Full context in TO-DOS.md.
