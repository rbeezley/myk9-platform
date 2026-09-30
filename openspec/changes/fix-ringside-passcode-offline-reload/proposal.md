# Proposal

## Why

The deployed October 10 rehearsal exposed two show-day failures: an offline reload of a ringside deep link returns Chrome's network error despite an active service worker, and a fresh passcode-only judge reaches a draft show URL that renders “Show not found.” Both interrupt scoring before the October 6 final rehearsal and threaten fall 2026 launch readiness.

## What Changes

- Serve the precached app shell for offline same-origin navigations, including `/at-show/:showId`, while leaving API requests and assets outside that fallback.
- Let a current, show-scoped staff passcode claim read its draft show's show, trial, and class rows; preserve the existing public and account visibility rules, and refuse stale or mismatched claims.
- Fetch the newly joined show's row into the offline replica after the anonymous passcode session receives its stamped claim. Report an unverified local miss honestly.
- Add regression tests and repeat the deployed checklist after the required migration and frontend deploy.

## Capabilities

### New Capabilities

- `ringside-offline-navigation`: A previously loaded ringside deep link can boot from the precached shell without a network.
- `ringside-passcode-draft-visibility`: A validated show-scoped staff passcode can load the draft show structure needed for scoring.

### Modified Capabilities

- None.

## Impact

myK9Show service worker, passcode session and show boundary, and the `shows`, `trials`, and `classes` SELECT policies. No new page or duplicated UI surface is needed: the existing `/at-show` route remains the sole scoring path. No public access to draft shows is added. A database migration and a frontend deploy are required before live verification; neither is applied by this source change.
