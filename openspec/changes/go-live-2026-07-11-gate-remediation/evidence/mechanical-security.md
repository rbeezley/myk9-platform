# Mechanical Security Fix Evidence

**Checked:** 2026-07-12 UTC

**Shared-system mutation performed:** none

## RED

Focused tests were added before production edits. The first run produced the expected four
behavior/contract failures:

- malformed Standard-Webhooks timestamps with a numeric prefix were accepted;
- Standard-Webhooks and push bearer auth did not share one timing-safe equality primitive;
- `resend-webhook` still used its private verifier; and
- production `getCurrentUserId()` trusted `dev-current-mock-user` from localStorage.

## GREEN

- `verifyStandardWebhookSignature` now rejects non-decimal or unsafe-integer timestamps, retains
  the five-minute skew window, ignores non-`v1`/unversioned signature candidates, evaluates every
  valid versioned signature, and compares through the shared `timingSafeEqual` primitive.
- `requirePushWebhookSecret` uses the same primitive for complete bearer comparison. The existing
  service-role fallback is intentionally unchanged in this slice; SA-029 remains task 8 and is
  gated on dedicated-secret alignment and coordinated deployment.
- `resend-webhook` reads the request body once and delegates missing-secret/header, timestamp,
  multi-signature, valid, and invalid behavior to `verifyStandardWebhookSignature`. The obsolete
  resend-only comparison module and tests are removed.
- `getCurrentUserId()` reads the development mock key only when `import.meta.env.DEV` is true.

Verification:

- focused Edge tests: 17 passed;
- focused client tests: 2 passed;
- full myK9Show unit suite: passed;
- `pnpm typecheck`: 26/26 tasks passed; and
- `pnpm lint`: 14/14 tasks passed.

No Edge Function was deployed. Runtime closure of SA-023 and SA-028 remains tied to the approved
deployment plan; SA-030 reaches the hosted app only after merge and the normal deployment path.
