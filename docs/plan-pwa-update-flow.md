# Plan: Unified PWA Update Flow Across myK9Show + myK9Q

**Status:** All phases implemented 2026-05-15. See commit history for the changes.
**Author:** Claude (worktree `xenodochial-rosalind-bd45bb`)
**Date:** 2026-05-15
**Owner:** Richard

---

## Problem

`myk9show.com` opened from the installed PWA on Windows shows the **old landing page**. Hard refresh shows the new one. Mac (no PWA installed) shows the new page normally.

Root cause is in [apps/myk9show/src/sw-custom.ts:9](../apps/myk9show/src/sw-custom.ts:9) and [apps/myk9show/vite.config.ts:14-65](../apps/myk9show/vite.config.ts:14):

- `precacheAndRoute(self.__WB_MANIFEST)` precaches `index.html` and serves it for all navigations.
- `injectRegister: null` means the SW is registered with no update-detection wiring.
- The SW has no `SKIP_WAITING` handler and no `clientsClaim()`, so even a freshly built SW sits in `waiting` state forever for installed PWAs.
- There is no in-app UI to surface that an update exists or to trigger one.

myK9Q solved this with a "prompt + skip-waiting on user action" pattern (the canonical Workbox model). myK9Show has no equivalent. We want both apps on the same model so there's one mental model, one bug surface, and one set of tests.

## Goals

1. Fix the immediate stale-PWA bug on myK9Show.
2. Bring myK9Show to feature parity with myK9Q's update flow:
   - Toast prompt when a new version is detected.
   - Manual "Check for updates" + "Update Now" in an About / Settings surface.
   - Build-time version stamp visible to users.
   - Periodic background update checks for long-lived sessions.
3. Extract the shared update logic into a workspace package so future drift is impossible.
4. Add app-specific deferral predicates so updates never interrupt sensitive flows (scoring on myK9Q; checkout/payment on myK9Show once those exist).

## Non-Goals

- Replacing the offline-first replication system or runtime caching strategies.
- Changing myK9Q's existing UpdateToast styling or About dialog layout.
- Auto-applying updates without user consent. We prefer the prompt pattern even on the marketing site (see "Why prompt, not auto-update?" below).

## Why prompt, not auto-update?

`registerType: 'autoUpdate'` would fix the stale-PWA bug with one config flip, but it has two real costs:

1. **Multi-tab chunk-load errors.** `autoUpdate` calls `skipWaiting` + `clientsClaim` immediately. A user with two tabs open across a deploy can have tab A loading lazy chunks that no longer exist in tab B's new SW cache → blank page or "ChunkLoadError".
2. **Mid-session interruption.** As soon as myK9Show grows entry forms, payment flows, or any stateful page, an auto-applied SW activation mid-action loses work.

The prompt pattern gives the user agency, matches myK9Q, and makes the deployment story uniform across the platform.

---

## Architecture

### Phased approach

- **Phase 1 — Fix myK9Show in place** (small, ships independently).
- **Phase 2 — Extract `@myk9/pwa-update` shared package**.
- **Phase 3 — Adopt deferral predicates per app**.
- **Phase 4 — Documentation + memory updates**.

Phases 2–4 should not block Phase 1 from shipping.

---

## Phase 1 — Fix myK9Show in place

### 1.1 Build-time version stamp

**[EXPANDED] Verify `apps/myk9show/package.json` has a sensible `version` field first** — `productVersion` is shown to users via the About surface. If it reads `"0.0.0"` or `"0.0.1"`, bump to a meaningful starter (e.g. `"1.0.0"`) before exposing it. Confirm during implementation.

**New file:** `apps/myk9show/src/config/appVersion.ts`

Mirror [apps/myk9q/src/config/appVersion.ts](../apps/myk9q/src/config/appVersion.ts), but **use a stable fallback** (not `new Date().toISOString()`) — a per-load timestamp would break prompt-once semantics in any environment where the define isn't injected (unit tests, future SSR, misconfigured build):

```ts
import { version } from '../../package.json';

declare const __BUILD_TIMESTAMP__: string;

export const productVersion = version;

export const buildTimestamp =
  typeof __BUILD_TIMESTAMP__ !== 'undefined'
    ? __BUILD_TIMESTAMP__
    : 'dev'; // [ADDED] stable fallback — per-load value would re-prompt every navigation

export const formattedBuildDate = new Date(buildTimestamp).toLocaleString('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});
```

**Edit:** [apps/myk9show/vite.config.ts](../apps/myk9show/vite.config.ts) — add a top-level `define`:

```ts
define: {
  __BUILD_TIMESTAMP__: JSON.stringify(new Date().toISOString()),
},
```

> **Verify first:** check [apps/myk9q/vite.config.ts](../apps/myk9q/vite.config.ts) for the exact `define` placement and reuse the identical pattern.

#### 1.1.1 [ADDED] Vercel `Cache-Control` headers for `sw.js`

The PWA update mechanism is only as fast as the CDN's TTL on the SW file itself. If Vercel caches `sw.js` with a long `max-age`, the browser will hit the CDN-cached old SW and never see the new one.

**Action items:**

- Inspect `apps/myk9show/vercel.json` (and `vite.config.ts`'s `headers` block — there's already a `Cache-Control: no-cache, no-store, must-revalidate, max-age=0` line at line 202 for dev). Confirm production has equivalent headers for `/sw.js`, `/sw-custom.js`, and `/manifest.webmanifest`.
- If missing, add a `headers` rule in `vercel.json`:
  ```json
  {
    "source": "/(sw\\.js|sw-custom\\.js|manifest\\.webmanifest|workbox-.*\\.js)",
    "headers": [{ "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate, max-age=0" }]
  }
  ```
- Verify by `curl -I https://myk9show.com/sw.js` and checking the response headers after deploy.
- Repeat the audit for myK9Q's deployment config to confirm parity.

### 1.2 PWA config: switch to prompt mode

**Edit:** [apps/myk9show/vite.config.ts:14-65](../apps/myk9show/vite.config.ts:14):

```diff
 VitePWA({
   strategies: 'injectManifest',
   srcDir: 'src',
   filename: 'sw-custom.ts',
-  injectRegister: null,
+  registerType: 'prompt',
   injectManifest: {
     globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
     maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
   },
   ...
 })
```

Removing `injectRegister: null` lets vite-plugin-pwa inject the standard registration glue, which `virtual:pwa-register` then drives.

### 1.3 SW: handle SKIP_WAITING

**Edit:** [apps/myk9show/src/sw-custom.ts](../apps/myk9show/src/sw-custom.ts) — add after the `precacheAndRoute` call:

```ts
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
```

Do **not** add unconditional `self.skipWaiting()` — that defeats the prompt pattern.

### 1.4 Register SW + show toast

**Edit:** [apps/myk9show/src/main.tsx](../apps/myk9show/src/main.tsx). Add the registerSW call (model after [apps/myk9q/src/main.tsx:123-184](../apps/myk9q/src/main.tsx:123) but use `sonner`'s `toast.custom` instead of the bespoke `UpdateToast` root):

```ts
import { registerSW } from 'virtual:pwa-register';
import { toast } from 'sonner';
import { buildTimestamp } from './config/appVersion';

const APP_VERSION = buildTimestamp;
const PROMPTED_KEY = 'sw_prompted_version';

if (!import.meta.env.DEV) {
  const updateSW = registerSW({
    onNeedRefresh() {
      if (localStorage.getItem(PROMPTED_KEY) === APP_VERSION) return;
      localStorage.setItem(PROMPTED_KEY, APP_VERSION);

      toast('New version available', {
        description: 'Reload to get the latest myK9Show.',
        action: {
          label: 'Update',
          onClick: () => updateSW(true),
        },
        duration: Infinity,
      });
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      // Poll for updates every 10 minutes for long-lived sessions.
      setInterval(() => {
        if (navigator.onLine) {
          registration.update().catch(() => {});
        }
      }, 10 * 60 * 1000);
    },
  });
}
```

Notes:
- `updateSW(true)` posts SKIP_WAITING and reloads on `controllerchange` — handled by vite-plugin-pwa's helper.
- The DEV-mode SW unregister block at [apps/myk9show/src/main.tsx:17-28](../apps/myk9show/src/main.tsx:17) stays as-is. **[EXPANDED] Interaction reasoning:** the DEV block runs unconditionally and unregisters all SWs; our `registerSW` call is wrapped in `!import.meta.env.DEV`, so in DEV: unregister fires, registerSW is skipped, no conflict. In PROD: unregister block is dead-stripped by Vite's tree-shake (the `import.meta.env.DEV` check is statically false), registerSW runs. No interaction.
- Prompt-once-per-version uses the same `localStorage` key shape as myK9Q for cross-app consistency.

**[ADDED] Error handling:**
- Wrap the `registerSW` call in a `try/catch` and log to the existing `LoggingService`. A throw here should not crash the React render path.
- Wrap `localStorage.getItem` / `setItem` in try/catch — Safari Private Mode and some embedded webviews throw on access. If it throws, fall back to in-memory de-dup for the current session.
- The poll's `.catch(() => {})` should instead `.catch(err => logger.warn('[PWA] update poll failed', err))` so we have observability.

**[ADDED] Offline click handling:**
- Before calling `updateSW(true)`, check `navigator.onLine`. If offline, show a follow-up toast: "You're offline. The update will apply when you reconnect." Then re-show the original prompt on `online` event. Optional but cheap.

**[ADDED] Observability:**
- Emit `logger.info('[PWA] update available', { version: APP_VERSION })` from `onNeedRefresh`.
- Emit `logger.info('[PWA] update applied', { version: APP_VERSION })` from a `controllerchange` listener.
- These show up in the existing logging pipeline and let us answer "are users actually getting updates?" in production.

### 1.5 Surface version in About / Settings

myK9Show doesn't currently have an About dialog. Smallest viable surface:

- Add a "Version" row to whichever Settings page is most natural (TBD — check current Settings IA before implementing). Show `productVersion` and `formattedBuildDate`.
- Include a "Check for updates" button that calls `registration.update()` and a "Reload" button that calls `updateSW(true)` if `registration.waiting` is truthy.

If Settings doesn't exist or the placement is unclear, defer this to Phase 2 and rely on the toast for now. **Decision needed during implementation.**

### 1.6 Phase 1 testing

**Unit tests** (vitest, in `apps/myk9show/src/**/*.test.ts`):

- `config/appVersion.test.ts` — verify fallback to `new Date().toISOString()` when `__BUILD_TIMESTAMP__` undefined; verify formatted date pattern.
- `main.test.ts` (or a new `pwa-update.test.ts` if we extract the registerSW block) — mock `virtual:pwa-register`, assert the toast is shown exactly once per version, assert prompt is suppressed in DEV.

**Manual / E2E verification:**

1. Build twice with deliberately different `__BUILD_TIMESTAMP__` values, deploy to a preview URL.
2. Install as PWA on Windows. Confirm first build loads.
3. Deploy second build. Within 10 min (or after a reload), confirm toast appears.
4. Click "Update" → page reloads → new build's version shows in DevTools / Settings.
5. Open DevTools → Application → Service Workers; confirm the new SW is `activated and is running`, not `waiting`.
6. Repeat with two tabs open — confirm no `ChunkLoadError` after update because we only activate on user click.

**Migration cliff (one-time):** existing installed PWAs on the old SW have no SKIP_WAITING handler. Their first update will rely on the existing default cache-bust path or require one manual unregister. Document this in the release notes.

**[ADDED] In-app recovery for stuck users:**
Add a one-shot "self-heal" snippet to [apps/myk9show/src/main.tsx](../apps/myk9show/src/main.tsx) that runs once per browser (gated by a `localStorage` flag), unregisters any SW whose script URL doesn't match the expected `/sw.js` path, and reloads. This catches users on the old worker without requiring them to know about DevTools. Remove the snippet in a follow-up release once telemetry shows the cliff has been crossed.

**[ADDED] Manual recovery instructions (for support):**
- Chrome desktop: `chrome://serviceworker-internals` → find `myk9show.com` → Unregister → reload site.
- Edge desktop: same path with `edge://serviceworker-internals`.
- Installed PWA on Windows: right-click app icon → Settings → "Reset" if available; else uninstall + reinstall.
- iOS/Safari: Settings → Safari → Advanced → Website Data → search "myk9show" → Remove.

Add these to a short user-facing FAQ or a pinned support doc.

#### 1.6.1 [ADDED] Push notification regression test

Switching `injectRegister: null` → default registration changes the SW lifecycle. The push and notificationclick handlers in [apps/myk9show/src/sw-custom.ts:12-49](../apps/myk9show/src/sw-custom.ts:12) must keep firing.

**Concrete verification:**

1. Build + deploy to a preview URL.
2. Subscribe a test browser to push (use whatever subscribe surface myK9Show currently has, or a temporary debug button).
3. Trigger a push from the existing send path (Supabase edge function or Postman against the push subscription endpoint).
4. Confirm notification renders and clicking it focuses/navigates the window per the existing `notificationclick` handler.
5. Repeat after applying an update via the toast — notification handlers should survive the SW activation.

Block Phase 1 merge on this passing.

---

## Phase 2 — Extract shared `@myk9/pwa-update` package

### 2.1 New package

`packages/pwa-update/` (TypeScript, no UI framework dependency for the core).

**Public surface:**

```ts
// packages/pwa-update/src/index.ts

export interface PwaUpdateOptions {
  /** Build timestamp / version string used as the prompt-suppression key. */
  version: string;
  /** Return true to defer the update prompt (e.g. user mid-task). */
  shouldDefer?: () => boolean;
  /** How often to poll for updates while the app is open. Default 10 min. */
  pollIntervalMs?: number;
  /** Called when a new SW is waiting and should not be deferred. */
  onPrompt: () => void;
  /** Called when offline mode is ready. Optional. */
  onOfflineReady?: () => void;
}

export function setupPwaUpdate(opts: PwaUpdateOptions): {
  applyUpdate: () => void;
  checkNow: () => Promise<void>;
};
```

`setupPwaUpdate` wraps `registerSW({ onNeedRefresh, onRegisteredSW })`, owns the `localStorage` prompt-key, owns the polling interval, and owns the deferral retry loop.

**SW-side helper** (re-exported for consistency):

```ts
// packages/pwa-update/src/sw.ts
export function installSkipWaitingHandler(self: ServiceWorkerGlobalScope): void {
  self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  });
}
```

### 2.2 Adoption

- **myK9Q:** replace the bespoke `registerSW({...})` block in `main.tsx` with `setupPwaUpdate({ ..., shouldDefer: isOnScoresheet, onPrompt: showUpdateToast })`. Keep the existing `UpdateToast` component and About dialog — both just call the package's `applyUpdate` / `checkNow`.
- **myK9Show:** swap Phase 1's inline block for the package call. Pass a `shouldDefer` that returns false initially.

Both apps' `sw-custom` files import `installSkipWaitingHandler`.

**[EXPANDED] myK9Q regression checklist** — must keep working bit-for-bit after migration:
- About dialog "Check for updates" → "Up to date" / "Update available" state machine ([apps/myk9q/src/components/dialogs/AboutDialog.tsx:58-148](../apps/myk9q/src/components/dialogs/AboutDialog.tsx:58)).
- About dialog "Update Now" → SKIP_WAITING → controllerchange → reload.
- Toast deferral while user is on `/score` or `/entry/*` ([apps/myk9q/src/main.tsx:140-149](../apps/myk9q/src/main.tsx:140)).
- 10-minute polling interval and 5-second initial check.
- `sw_prompted_version` localStorage suppression across reloads.
- Push notification handlers in [apps/myk9q/src/sw-custom.js](../apps/myk9q/src/sw-custom.js) (license-key tenant isolation messages, push, notificationclick, simulated push).
- `serviceWorkerManager.initialize()` still called from `onRegisteredSW` and `onOfflineReady`.
- License-key tenant isolation message channel (the SW listens for `UPDATE_LICENSE_KEY`).

Each item gets one targeted test or manual-verification step in the migration PR.

### 2.3 Phase 2 testing

- Unit tests in `packages/pwa-update/src/__tests__/` covering: prompt-once semantics, deferral retry loop (use fake timers), DEV bypass, poll cadence, idempotent setup.
- Re-run myK9Q E2E update flow after migration to confirm parity.
- Re-run myK9Show manual verification from Phase 1.6.

---

## Phase 3 — Deferral predicates

- **myK9Q:** keep `isOnScoresheet` (already defined in `main.tsx`). Move it next to the call site.
- **myK9Show:** start with a no-op (`() => false`). Add real predicates as features land:
  - `/checkout`, `/payment`, `/entry-form/*` → defer.
  - Any future scoring or judging surface → defer.

Tests: per-app vitest covering the predicates with mocked `window.location.pathname`.

---

## Phase 4 — Documentation + memory

- Add a section to `apps/myk9show/CLAUDE.md` describing the PWA update flow and pointing to the shared package.
- Add the same section to `apps/myk9q/CLAUDE.md` with a note that the implementation is now shared.
- Save a memory entry: `feedback_pwa_update_pattern.md` — "Both apps use `@myk9/pwa-update` with `registerType: 'prompt'`. Never switch to `autoUpdate` without revisiting the multi-tab + mid-session-interruption tradeoffs documented in `docs/plan-pwa-update-flow.md`."
- Update `MEMORY.md` index with one line pointing to the new feedback file.

---

## [ADDED] Rollback strategy

A broken SW can persist for weeks because the prompt model gates activation on user click. If we ship Phase 1 and the new SW is broken (e.g. it crashes during `precacheAndRoute`, fails to register, or the toast never fires), users are stuck on whatever SW they have — possibly the new broken one if it managed to install.

**Tiered rollback:**

1. **Tier 1 — fix forward.** If the bug is in our app code (toast doesn't render, registration block throws), push a corrected build. Existing installs poll every 10 min and pick it up. No SW ejection needed.

2. **Tier 2 — kill-switch SW.** Pre-stage a "tombstone" branch that replaces `sw-custom.ts` with:
   ```ts
   self.addEventListener('install', () => self.skipWaiting());
   self.addEventListener('activate', async (event) => {
     event.waitUntil(
       (async () => {
         await self.registration.unregister();
         const clients = await self.clients.matchAll();
         clients.forEach(c => (c as WindowClient).navigate(c.url));
       })()
     );
   });
   ```
   This SW unregisters itself and reloads all controlled clients into a SW-free state. Deploy this branch if Tier 1 isn't viable. Document the branch name (`emergency/sw-tombstone`) in this plan and in `apps/myk9show/CLAUDE.md`.

3. **Tier 3 — full revert.** `git revert` the Phase 1 PR. Tier 2 still required afterward to clean up clients on the broken SW.

**Pre-flight checks before merging Phase 1:**

- Deploy to a Vercel preview URL.
- Install as PWA on at least Windows + Mac + iOS Safari.
- Verify toast appears on a follow-up deploy on each.
- Verify Tier 2 tombstone branch builds cleanly (don't deploy — just verify it compiles).

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Existing installed myK9Show PWAs are stuck on a SW with no SKIP_WAITING handler | One-time migration cliff. Document in release notes; instruct affected users to hard-refresh once or reinstall. After that, all future updates flow cleanly. |
| Toast appears during a critical flow on myK9Show before deferral predicates exist | Phase 1 has no critical flows on the routes that exist today. Add predicates in Phase 3 as flows land. |
| `__BUILD_TIMESTAMP__` not unique enough (sub-second deploys) | ISO timestamp gives ms precision; collisions impossible in practice. If we ever rebuild without code changes, the new SW will install but the precache hashes will be identical, so no false prompt. |
| `virtual:pwa-register` injects different code than the current `injectRegister: null` setup expects | Build, run typecheck, and test in a preview deploy before merging. |
| Worker has push-notification handlers; switching registration mode might break them | The push + notificationclick listeners in `sw-custom.ts` are independent of registration strategy. Verify with the existing notification test path after Phase 1.3. |

---

## Open questions for review

1. **About dialog placement on myK9Show** — Settings page row, footer link, or a dedicated dialog? (Affects 1.5 scope.)
2. **Toast styling** — use plain `sonner` `toast.custom` or build a styled component matching myK9Show's design language? (myK9Q uses a fully custom React root; myK9Show could just use sonner.)
3. **Phase 2 timing** — ship Phase 1 alone first and follow with Phase 2 in a separate PR, or bundle them? Recommend: ship Phase 1 first to fix the bug fast, then Phase 2 over the following days.
4. **Polling interval on myK9Show** — match myK9Q's 10-min cadence, or longer (e.g. 30 min) since it's a marketing site with no real-time pressure?

---

## Acceptance criteria

- [ ] Installed myK9Show PWA on Windows surfaces a toast within ~10 minutes of a new deploy without requiring a hard refresh.
- [ ] Clicking "Update" reloads cleanly with the new build.
- [ ] No `ChunkLoadError` regressions across deploys with multiple tabs open.
- [ ] myK9Q update flow continues to work identically to today after Phase 2 migration.
- [ ] Both apps' update flow lives in one place (`@myk9/pwa-update`) by end of Phase 2.
- [ ] Unit tests pass; manual verification steps in 1.6 pass on a preview deploy.
- [ ] No emojis added to source files (per [feedback_no_emojis.md](https://example.invalid)).
- [ ] [ADDED] Push notifications still fire on myK9Show after Phase 1 (per §1.6.1).
- [ ] [ADDED] Vercel response headers for `/sw.js` confirm `no-cache` via `curl -I` after deploy.
- [ ] [ADDED] `chrome://serviceworker-internals` shows the new SW activated, not stuck waiting, on at least one installed Windows PWA test client.
- [ ] [ADDED] Tier 2 tombstone branch exists and compiles before Phase 1 merge.
- [ ] [ADDED] myK9Show `package.json` `version` field reviewed and bumped to a user-presentable value if needed.

---

## [ADDED] Worktree & deploy notes

- All builds and previews must run from a worktree. Per [CLAUDE.md](../CLAUDE.md), gitignored files (`node_modules`, `.env`, `dist`) are not shared between worktrees — run `bash scripts/bootstrap-worktree.sh` if anything's missing.
- `gh pr merge` for any PR from this plan must be run from the **main repo directory**, not the worktree (per `feedback_merge_from_main_worktree.md` memory).
- Vercel auto-deploys from `main`. Use a feature branch + preview URL for verification before merging Phase 1.
