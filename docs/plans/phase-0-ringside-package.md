# Phase 0 — Extract `packages/ringside` (Plan)

Companion to [`2026-05-17-unify-myk9show-myk9q.md`](./2026-05-17-unify-myk9show-myk9q.md) §Phase 0 steps 4–6. This doc resolves the open shape questions before any code lands.

**Status:** rev 4 — decisions locked, audits returned, ready for PR A.

**Date:** 2026-05-26 (rev 4 same-day)
**Owner:** TBD (waiting for assignment)

**Changelog:**
- rev 1 (initial): surfaced five open questions, recommended defaults, proposed 8-PR sequencing.
- rev 2 (2026-05-26 PM): user locked Q1=Tailwind / Q2=extend-existing / Q3=hook-only / Q4=audit-then-defer-Nationals / Q5=audit-then-decide. Audits returned in §3. PR order tightened.
- rev 3 (drafted, never committed): user reversed Q4 to extract Nationals along with the generic scoresheets on the assumption that the monorepo's `apps/myk9q/` had the working version worth preserving.
- rev 4 (2026-05-26 PM): rev 3 reversed after a quick audit revealed the monorepo's 1409 LOC of Nationals code is a **stale partial port**; the working version lives in the separate production myK9Q v3 repo (not accessible from this machine). Defer Nationals to a future PR that ports directly from prod — extracting the stale monorepo copy would enshrine a known-broken version into the shared package. Q4 reverts to: extract generic scoresheets, defer Nationals.

---

## 1. Goal

Carve a `packages/ringside` workspace package out of `apps/myk9q/src/` that contains the ringside experience (auth + class lists + entry lists + scoresheets + ringside-only notification suppression). myK9Q keeps consuming it as a shell. The Phase 1 myK9Show `/at-show` route mounts the same package inside myK9Show's app shell — a single React tree, two app shells, no duplicated logic.

Concretely, "done" means:
- `apps/myk9q` builds as before, with `pnpm dev:q` opening the same UI.
- `apps/myk9show` can import the package and render `<RingsideApp />` (or whatever the top-level export ends up being) inside its routes.
- No code under `packages/ringside/` references the legacy license-key derivation model — auth flows through `validate_passcode` (PR #366, merged 2026-05-25) and identity comes from `auth.uid()` via `get_account_today_entries()` (PR #374, merged 2026-05-26).

## 2. Inventory — what's a candidate to extract

Survey of `apps/myk9q/src/` against the package boundary. Each row gets a verdict before code moves.

### 2.1 Definitely in scope (ringside experience)

| Path | Reason | Risk |
|---|---|---|
| `pages/ClassList/` | Class list for a trial — ringside core | low |
| `pages/EntryList/` | Entry list for a class — ringside core | low |
| `pages/ShowDetails/` | Dashboard with ClassTable — ringside landing | low |
| `pages/scoresheets/` (AKC/UKC/ASCA) | Judging surface — ringside core | medium (Nationals scoring is judge-specific; needs careful isolation) |
| `pages/Login/` + `pages/Landing/` | The passcode-input UX — re-skinnable but the auth logic must move | medium (currently has myK9Q-specific copy + visuals) |
| `components/dialogs/` | Reusable ringside dialogs (status, requirements, options) | low |
| `hooks/useClassFilters`, `useClassSelection`, `useFavoriteClasses`, `useShowAccent`, `useAreaManagement`, `useClassCompletion`, `useNationals*` | Ringside-specific business logic | low |
| `stores/entryStore`, `scoringStore`, `timerStore`, `nationalsStore`, `announcementStore` | Ringside domain stores | low |
| `services/replication/` | Already offline-first — used by both apps in the future | **HIGH** (already declared `@myk9/replication` exists as a package; we may be re-extracting code that already moved). Verify before touching. |
| `contexts/AuthContext.tsx` | Passcode auth state | medium — must rewire to `validate_passcode` RPC if not already done |

### 2.2 Definitely **not** in scope (stays in myK9Q app shell)

| Path | Reason |
|---|---|
| `main.tsx`, `App.tsx`, `index.css` | App shell — myK9Q-specific |
| `sw-custom.js`, `workers/` | PWA service worker — myK9Q's PWA config |
| `pages/Admin/` | If admin UI is a separate concern, deferred to a later extraction |
| `pages/TVRunOrder/` | Possibly platform-specific — needs verdict |
| `pages/MigrationTest`, `pages/TestConnections` | Dev scaffolding |
| `demo/` | Demo data — myK9Q-only |
| `styles/`, `lib/`, `constants/` | App-shell styling/config |

### 2.3 Ambiguous — needs a verdict before extraction

| Path | Question |
|---|---|
| `pages/Home/` | Is the myK9Q home page reusable in `/at-show` or does each app have its own landing? |
| `pages/Settings/` | Per-device ringside settings (sound, voice, haptics) — move into ringside? Or scope to the host app? |
| `pages/Stats/` | Ringside analytics? Or admin-only? |
| `pages/Announcements/` | Sender/receiver of show announcements — ringside includes receiver, sender belongs to admin |
| `pages/DogDetails/`, `pages/Results/` | Are these read-only views that ringside surfaces? Or admin/exhibitor views that belong in myK9Show? |
| `hooks/usePushNotificationAutoSwitch`, `usePushSubscription` (if present) | Push subscription belongs to the *device*, not the ringside experience — but the ringside UI is the only consumer in myK9Q today. Move or stay? |
| `hooks/useNotifications` + `contexts/NotificationContext` | Already a `packages/notifications` exists with `suppression.ts`. Is the in-ring suppression idea referenced in plan §step 5 already implemented there? Need to compare. |
| `services/` (everything not under `replication/`) | Many services may be myK9Q-app-specific glue. Audit row-by-row. |

## 3. Decisions (locked) + audit findings

### Q1 — Theme: **Tailwind, with package-bundled CSS** ✅

**Decision:** ringside uses Tailwind internally. The package ships a pre-built `dist/styles.css` so myK9Q consumes the compiled output without needing a Tailwind toolchain.

**Why this overrides the original "semantic CSS" recommendation:** Phase 6 deletes `apps/myk9q` entirely. Optimizing the package for the *temporary* host (myK9Q) over the *destination* (myK9Show) is backwards. Tailwind in the package gives myK9Show clean integration; myK9Q just imports a stylesheet — its own components keep using semantic CSS, no app-level Tailwind toolchain required, no CLAUDE.md constraint violated.

**Implementation note:** `tsup` (already used by `@myk9/scoring-ui`) can bundle CSS alongside JS via the `loader: { '.css': 'css' }` config. Reference the build of `@myk9/ui` for the exact shape.

### Q2 — Notifications: **extend `packages/notifications`** ✅

**Audit finding:** the existing package is already richer than the plan implied. It contains:
```
handlers.ts  push.ts  sound.ts  suppression.ts
types.ts     voice.ts voice-text.ts
```
with `suppression.ts` already exporting `shouldSuppress(preferences, { isInRing })`. Plan step §5 ("port the `isInRing` suppression idea") is **already done** in the package itself.

**The actual gap:** myK9Q is NOT consuming the package. Its `hooks/useNotifications.ts` imports from `@/services/notificationService` (local); `contexts/NotificationContext.tsx` imports `@/services/notificationSoundService` (local). There's a parallel implementation in `apps/myk9q/src/services/` that should switch to `@myk9/notifications`.

**Adjustment:** the ringside extraction does NOT include "port notifications" — the package is already correct. Instead, a sibling cleanup PR migrates myK9Q's notification call-sites to `@myk9/notifications` (independent of ringside, can ship in parallel or even before PR A). Treating it as a pre-extraction tidy: smaller scope, isolated risk.

### Q3 — Auth: **package exports a hook, host owns the provider** ✅

**Decision:** `packages/ringside` exports `usePasscodeAuth()` / `useCurrentPasscodeRole()` hooks. Each host app keeps its own top-level `AuthProvider` and decides how to merge passcode + account session per Locked Decision 8 (signed-in user attaching a passcode = host's confirmation step).

### Q4 — Scoresheets: **extract generic, defer Nationals to a prod-repo port** ✅

**Audit inventory:**
```
AKC/AKCFastCatScoresheet.tsx                    — generic, extract in PR F
AKC/AKCScentWorkScoresheet.tsx                  — generic, extract in PR F
AKC/AKCScentWorkScoresheetRouter.tsx            — generic, extract in PR F
AKC/AKCNationalsScoresheet.tsx                  — Nationals (stale; see below)
AKC/components/NationalsConfirmationDialog.tsx  — Nationals (stale; see below)
ASCA/ASCAScentDetectionScoresheet.tsx           — generic, extract in PR F
components/NationalsPointsDisplay.tsx           — Nationals (stale; see below)
components/TimerDisplay.tsx, AreaInputs.tsx,
ScoreConfirmationDialog.tsx, etc.               — generic shared components
```

**Critical context (surfaced 2026-05-26):** the monorepo's `apps/myk9q/` Nationals files total 1409 LOC across `AKCNationalsScoresheet.tsx`, `NationalsConfirmationDialog.tsx`, `NationalsPointsDisplay.tsx`, `nationalsStore.ts` (461 lines), `useNationalsScoring.ts`, `useNationalsCounters.ts`. Despite the size, this is a **stale partial port**. The canonical working version lives in the separate production myK9Q v3 repo, which is not accessible from this machine.

**Decision per user (rev 4):** do NOT extract the monorepo's stale Nationals copy into `packages/ringside`. Enshrining a known-broken implementation into the shared package would create a debug trap for whoever next touches Nationals — they'd find a substantial-looking codebase that doesn't actually work, with no clear flag that it's stale.

**PR F therefore covers ONLY the generic scoresheets:**
- AKC FastCat, AKC ScentWork (+ Router), ASCA ScentDetection
- Generic shared components (`TimerDisplay`, `AreaInputs`, `ScoreConfirmationDialog`, etc.)

**Nationals deferred to a future PR (out of Phase 0):** port the working Nationals implementation from the prod myK9Q v3 repo *directly into* `packages/ringside`, alongside the new auth model. This is a fresh port — not a migration of the monorepo's stale copy. Tracked as a new follow-up task.

**Knock-on effects:**
- PR D (stores) excludes `nationalsStore.ts` — it's stale and won't be needed until the prod-repo port lands.
- PR D excludes `useNationalsScoring`/`useNationalsCounters` hooks for the same reason.
- The 1409 LOC of stale Nationals code in `apps/myk9q/` stays where it is for now. Removing it adds scope and may break the existing monorepo myK9Q dev experience without notice — leave for the prod-port PR to clean up as it lands.

### Q5 — Replication: **NOT duplication, leave layered** ✅

**Audit finding:** `apps/myk9q/src/services/replication/` and `packages/replication/src/` are **not** parallel implementations. They're a two-layer architecture:

| Layer | Location | Content |
|---|---|---|
| Primitives | `packages/replication/src/` | `MutationManager.ts`, `syncReplicatedTable.ts`, conflict resolution, mutation utilities, types |
| Orchestration | `apps/myk9q/src/services/replication/` | `ReplicationManager`, `SyncEngine`, `PrefetchManager`, `myk9qDependencies.ts`, `initReplication.ts`, table-specific subclasses |

Import counts confirm both are live: 30 myK9Q files import from `@myk9/replication`, 19 from `@/services/replication`. The local layer wraps the package and adds myK9Q-specific bootstrap.

**Decision:** no deduplication needed. The orchestration layer is app-specific and stays in `apps/myk9q/` for now. When the future `/at-show` route mounts ringside, myK9Show will need its own orchestration layer — that's a Phase 1 question, not Phase 0. **Treat `services/replication/` as host-app territory, do not move into ringside.**

The one nuance: any table-specific subclasses under `services/replication/tables/` that ringside UI directly imports become a question — likely they should stay app-side and ringside consumes them through a dependency-injection hook. Confirmed during PR D when the ringside stores actually need them.

## 4. Proposed extraction strategy

### 4.1 Sequencing — small PRs, not one big bang

Goal: each PR is < ~500 LOC moved, builds green, ships independently. Updated order after audit findings (PR H from rev 1 dropped — Q2 finding rendered it unnecessary):

| # | Title | Risk | Notes |
|---|---|---|---|
| **Pre-A** | Migrate `apps/myk9q` notification call-sites to `@myk9/notifications` | low | Independent cleanup uncovered by Q2 audit. Ships in parallel; not gated on PR A. Optional but recommended before PR G. |
| **A** | Package scaffold | trivial | `package.json` + `tsconfig.json` + `tsup.config.ts` with Tailwind + CSS bundling per Q1. Empty `src/index.ts`. `apps/myk9q` consumes as no-op import. |
| **B** | Move shared types + pure utilities | low | Type defs, status enums, date helpers — anything with no React or store deps. |
| **C** | Move passcode auth hook | low | Export `usePasscodeAuth()` only, NOT the AuthProvider per Q3. Verify the new `validate_passcode` RPC call replaces any residual license-key derivation. |
| **D** | Move ringside domain stores | medium | `entryStore`, `scoringStore`, `timerStore`. The table-subclass question from Q5 surfaces here — likely resolved via a DI hook. |
| **E1** | Move ClassList page + hooks | medium | Largest single move. Split E1/E2 to stay under size budget. |
| **E2** | Move EntryList + ShowDetails (ClassTable) | medium | |
| **F** | Move generic scoresheets | medium | AKC FastCat, AKC ScentWork (+ Router), ASCA ScentDetection, generic components. **Skip** `AKCNationalsScoresheet`, `NationalsConfirmationDialog`, `NationalsPointsDisplay` per Q4 — those are stale in the monorepo and will be fresh-ported from the prod myK9Q v3 repo in a separate follow-up. |
| **G** | Move dialogs + remaining ringside hooks | low | Mop-up. |

**Stop point for Phase 0:** PRs A–G finished, `apps/myk9q` builds + tests pass, `apps/myk9show` does not yet consume ringside (that's Phase 1's `/at-show` route work). Stale Nationals code remains in `apps/myk9q/` pending the prod-repo port follow-up.

### 4.2a — Out-of-Phase-0 follow-up (Nationals port)

Tracked as a separate task (not part of this plan's PR sequence):

> **Port Nationals scoresheets from prod myK9Q v3 → `packages/ringside`.** Replace the stale 1409 LOC currently in `apps/myk9q/`. Requires:
> 1. Access to the prod myK9Q v3 repo
> 2. The new auth model rewired in (passcode lookup via `validate_passcode`, no license-key derivation)
> 3. Coordination with whatever `nationalsStore` shape ringside uses by then (PR D will have set the precedent)
>
> Schedule: "we won't need them for a while" per user, so low priority. Tagged for the future Nationals-active sprint.

### 4.2 Guardrails per PR

Each PR includes:
- Same-file imports rewritten (`from '@/foo'` → `from '@myk9/ringside'`).
- `pnpm typecheck` and `pnpm lint` clean before push.
- `pnpm test` clean for the touched layer.
- A visual smoke against `pnpm dev:q` for any PR that moves UI (E, F, G).
- A note in the PR body listing every file moved and every callsite rewritten — so reviewers can grep-verify nothing fell behind.

### 4.3 What blocks merging the WHOLE extraction

Even after the per-PR guardrails pass:
- **Build:** `pnpm build` across the monorepo green (catches package-export wiring).
- **myK9Q test suite:** `cd apps/myk9q && pnpm test` clean.
- **Manual smoke at staging:** sign in with `aa260` (test admin), reach a class list, score one entry. The full mainline ringside loop must work identically to before. Documented as test #11's analogue for this extraction.

## 5. Things deliberately deferred

- **myK9Show consumption.** Phase 1's `/at-show` route is the consumer. This plan only ships the package; it doesn't mount it in a second app.
- **Theming work for myK9Show's `/at-show` route.** That belongs to Phase 1's UI sprint, not this extraction.
- **Removing `apps/myk9q` entirely.** Phase 6's task. The extraction makes that possible but doesn't trigger it.
- **`services/replication/` consolidation.** If Q5 reveals duplication, it's a one-PR side quest, but it's not gated on Phase 0 closure.

## 6. Ready to start

All five questions answered; audits done. Two entry points are valid:

- **Pre-A (Q2 byproduct):** migrate `apps/myk9q`'s notification call-sites from local `services/notificationService` / `notificationSoundService` to `@myk9/notifications`. Independent of ringside, smaller scope, immediately useful. Could ship first or last — owner's call.
- **PR A:** scaffold `packages/ringside` with Tailwind + CSS bundling per Q1. No code moved, just the empty package + workspace wiring. Risk-free under any future answer.

Default proceed order: **PR A first** (the extraction's foundation), Pre-A interleaves at any point before PR G.
