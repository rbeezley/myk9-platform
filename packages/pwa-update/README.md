# @myk9/pwa-update

Shared PWA update lifecycle for myK9Show and myK9Q.

Implements the **prompt-then-skip-waiting** pattern recommended by Workbox:

1. New service worker installs silently in the background.
2. When it's waiting, the package fires `onPrompt()` so the app can show a toast.
3. User clicks "Update" → `applyPwaUpdate()` posts `SKIP_WAITING` and reloads on `controllerchange`.

## Why not `registerType: 'autoUpdate'`?

Auto-updating activates new SWs immediately via `skipWaiting` + `clientsClaim`. Two real costs:

- **Multi-tab chunk-load errors.** A user with two tabs across a deploy gets the new SW serving JS chunks the old tab can't find → blank page or `ChunkLoadError`.
- **Mid-session interruption.** A page reload during an entry form, payment flow, or scoresheet loses work.

The prompt pattern gives the user agency and matches both apps' UX intent.

## Usage

### Main thread

Each app injects `registerSW` from `vite-plugin-pwa`'s virtual module:

```ts
import { registerSW } from 'virtual:pwa-register';
import { setupPwaUpdate } from '@myk9/pwa-update';

setupPwaUpdate({
  registerSW,
  version: buildTimestamp,        // unique per deploy
  onPrompt: showToast,            // your toast
  shouldDefer: isOnSensitiveRoute, // optional — defers prompt mid-task
  onRegistered: reg => initSW(reg),
  onOfflineReady: () => {},
  logger: { info, warn, error },  // optional
});
```

After setup, anywhere in the app:

```ts
import { applyPwaUpdate, checkForPwaUpdate, onUpdateAvailable } from '@myk9/pwa-update';
```

These work because the package keeps a module-level singleton controller.

### Service worker

Inside your `sw-custom.ts`:

```ts
import { installSkipWaitingHandler } from '@myk9/pwa-update/sw';

declare const self: ServiceWorkerGlobalScope;
installSkipWaitingHandler(self);
```

Without this, `applyPwaUpdate()` falls back to a 3-second timeout reload, which is brittle.

## Behavior

- **Prompt-once-per-version** — uses `localStorage` key `sw_prompted_version` (override via `promptedKey`). Falls back to in-memory dedup if `localStorage` throws (Safari Private Mode).
- **Polling** — calls `registration.update()` every 10 minutes (configurable). Initial check after 5s.
- **Deferral retry** — if `shouldDefer()` returns true, re-checks every 2s and prompts once it returns false.
- **Offline guard** — `applyPwaUpdate()` skips the SW call when `navigator.onLine === false` and logs `'[PWA] update deferred — offline'`.
- **Singleton** — `setupPwaUpdate` returns the existing controller on repeat calls. Use `__resetPwaUpdateSingleton()` in tests to reset.

## App wiring

| App | Sensitive routes (deferred) |
|---|---|
| myK9Q | `/score`, `/entry/` (scoresheets) |
| myK9Show | `/checkout/`, `/shows/:id/register`, `/exhibitor/check-in/`, `/secretary/register/`, `/scoring/` |

## Tests

```bash
cd packages/pwa-update
pnpm test
```

14 tests cover prompt-once, deferral retry, localStorage failure, offline guard, singleton idempotency, and logger error path.
