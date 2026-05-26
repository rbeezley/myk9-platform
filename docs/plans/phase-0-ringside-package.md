# Phase 0 — Extract `packages/ringside` (Plan)

Companion to [`2026-05-17-unify-myk9show-myk9q.md`](./2026-05-17-unify-myk9show-myk9q.md) §Phase 0 steps 4–6. This doc resolves the open shape questions before any code lands.

**Status:** draft — awaiting answers to the open questions in §3 before implementation starts.

**Date:** 2026-05-26
**Owner:** TBD (waiting for assignment)

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

## 3. Open design questions (need answers before code)

**Q1. Theme contract.** myK9Q ships semantic CSS (no Tailwind). myK9Show ships shadcn/ui + Tailwind. `packages/ringside` will mount in both. Options:
   - **3a.** Ringside emits semantic CSS classes; each host app provides the stylesheet (clean separation, but two stylesheets to maintain in sync).
   - **3b.** Ringside emits inline styles / CSS-in-JS (no host dependency, but breaks myK9Show's design-token system).
   - **3c.** Ringside is theme-agnostic primitives; each host wraps in its own component layer (most flexible, most ceremony).
   - **Recommendation:** 3a — keep semantic class names, ship a `ringside.css` from the package, let each app extend with overrides. Matches myK9Q's current shape exactly. myK9Show wraps with a thin Tailwind shim where needed.

**Q2. Notifications package relationship.** `packages/notifications/` already exists with `sound.ts`, `push.ts`, `suppression.ts`, `handlers.ts`. Plan §step 5 says "Port the `isInRing` suppression idea from myK9Show's `useNotificationStore` into the shared notification module." Verify:
   - Is the existing `suppression.ts` already the shared module the plan wanted?
   - If yes: step 5 is partly done — just need to confirm the `isInRing` predicate is there.
   - If no: extend the existing module rather than creating a parallel ringside-notifications.
   - **Action item:** read `packages/notifications/src/suppression.ts` before drafting the implementation PR.

**Q3. Auth context boundary.** myK9Q's `AuthContext` currently knows about passcodes. myK9Show's auth context knows about email-password sessions. After Phase 0 the smart input is one field that resolves to either path. Options:
   - **3a.** Ringside package exports a `usePasscodeAuth()` hook that returns role + show. Host apps own the top-level auth context and decide how to merge passcode + account session (per Locked Decision 8).
   - **3b.** Ringside package owns a full `AuthProvider` and both apps mount it. (Couples host app to ringside's auth model.)
   - **Recommendation:** 3a. The "session precedence" rule is a host-app concern (signed-in user attaching a passcode = host's confirmation step), not a ringside concern.

**Q4. Scoresheet scope.** Scoresheets are currently in `pages/scoresheets/AKC/`, `UKC/`, `ASCA/`. Are these:
   - **3a.** Pure judge-UI that anyone with a `j****` passcode sees? → goes in ringside
   - **3b.** Coupled to myK9Q's scoring sync layer? → audit before move
   - **3c.** Some scoresheets are myK9Q-only (e.g., Nationals)? → split, move common, keep myK9Q-specific in app
   - **Action item:** spot-check imports in `pages/scoresheets/AKC/CheckInBox.tsx` and one ASCA scoresheet to see how deep the coupling goes.

**Q5. `services/replication/` status.** `@myk9/replication` already exists as a workspace package. Two possibilities:
   - The myK9Q `services/replication/` directory is a *legacy copy* that should be deleted in favor of the package — partial overlap with #15-style cleanup.
   - The myK9Q copy is the canonical one, and `@myk9/replication` is a stub or a different concern.
   - **Action item:** diff `apps/myk9q/src/services/replication/` vs `packages/replication/src/` before any ringside extraction. If duplicated, fix that first (it's a cheap consolidation win and clears a confusion source for #16).

## 4. Proposed extraction strategy

### 4.1 Sequencing — small PRs, not one big bang

Goal: each PR is < ~500 LOC moved, builds green, ships independently. Order:

1. **PR A — Package scaffold.** Create `packages/ringside/{package.json, tsconfig.json, tsup.config.ts, src/index.ts}`. No code moved yet — just the empty workspace package that builds and is consumed by `apps/myk9q` as a no-op import. Confirm Turbo/pnpm sees it.
2. **PR B — Move shared types + pure utilities.** Things with no React or store dependencies: type defs, status enum, date helpers, etc. Each move replaces app-internal imports with `@myk9/ringside` imports. Smallest possible move.
3. **PR C — Move passcode auth hook.** Just `useAuth`/`usePasscodeAuth` + the underlying `validate_passcode` client call. Per Q3, do NOT move the top-level `AuthProvider` — leave that in `apps/myk9q`, have it consume the new hook.
4. **PR D — Move ringside domain stores.** `entryStore`, `scoringStore`, `timerStore`. These are the load-bearing state. Verify hooks that depend on them still resolve via the new package paths.
5. **PR E — Move ClassList + EntryList + their hooks.** The biggest single move. Probably needs to land in two PRs (E1, E2) to stay under the size budget.
6. **PR F — Move scoresheets.** Pending Q4 resolution. May fork into common-vs-myK9Q-specific.
7. **PR G — Move dialogs + remaining ringside hooks.** Mop-up.
8. **PR H — Wire the in-ring notification suppression (plan §step 5).** Pending Q2 — likely just a single hook + a test, not a move.

**Stop point for Phase 0:** PRs A–H finished, `apps/myk9q` builds + tests pass, `apps/myk9show` does not yet consume ringside (that's Phase 1's `/at-show` route work).

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

## 6. Decision needed from you

Before I write code: please answer Q1–Q5 above (or sign off on the recommendations as written). Q2 and Q5 in particular require a quick diff between `packages/notifications/src/suppression.ts` + `apps/myk9q/src/services/replication/` and their app-side counterparts — I'll do that read-only audit and report back if you want me to before you decide. Just say "audit Q2/Q5 first" and I'll come back with a one-page comparison instead of starting on PR A.

Otherwise: I take Q1=3a / Q2=extend existing / Q3=3a / Q4=verdict-after-audit / Q5=audit-and-deduplicate as the working assumptions, and start with PR A (scaffold) which is risk-free under any answer.
