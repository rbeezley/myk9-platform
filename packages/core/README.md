# @myk9/core

Internal platform types, constants, and utilities shared by myK9Show and its packages.

## Public surface

See [src/index.ts](src/index.ts) for the authoritative export list:

- Logging and redaction.
- Timeouts, exponential-backoff delays, and retryable-error classification.
- Entity types, class/check-in status constants, and composed class/trial display status.
- Time/date formatting, error handling, type assertions, and search utilities.
- Device capability detection and cached device tiers.
- Legacy passcode derivation and Nationals scoring constants.

Unused generic retry/search/guard helpers, random passcode generators, and stub sound/voice/Nationals services were removed. Active notifications remain in `@myk9/notifications`; server-generated passcodes retain their existing app workflow. This package does not own persistent data mutations or replication policy.

## Verification

Run from this package directory:

```sh
pnpm build
pnpm typecheck
pnpm test --run
```
