## 1. MYK9-191 — Consent, settings, and confirmation

- [x] 1.1 Add assertion-first tests for the exact confirmation message, one GSM-7 segment, formatted-number normalization, atomic consent payload, source propagation, invalid input, number-change clearing, and safe in-app disable.
- [x] 1.2 Add the provider interface and fail-closed Twilio Messaging Service REST client with focused success, provider-error, and missing-config tests.
- [x] 1.3 Add the authenticated `sms-opt-in` edge-function handler: derive ownership only from the JWT, validate phone/version/source, make complete same-number submissions idempotent, save all consent fields plus `sms_enabled` and a write token in one exactly-one-row write, send confirmation after the write, and compare-and-clear only that write on failure. **[EXPANDED after security review]**
- [x] 1.4 Extend the existing notification preference service to load the single per-user row, synchronize `upcoming_runs`, enable/disable retained text consent safely, and clear consent when the normalized number changes.
- [x] 1.5 Reshape the existing Notification Settings surface into one Ring alerts feature with outer all-channel control, push/text delivery options, verbatim unchecked consent, calm loading/error feedback, valid-consent suppression, and no checkout/per-show capture.
- [x] 1.6 Register every new edge-function test in the myK9Show Vitest allowlist and update the SMS deploy checklist with `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_MESSAGING_SERVICE_SID` as operator-owned prerequisites.
- [x] 1.7 Harden notification preference RLS/grants with caller-derived RPCs, adversarial SQL/source tests, a service-only per-account/destination rate limit, bounded provider timeout, and ring/global-monitor state separation. **[ADDED after security review]**

## 2. MYK9-192 — Carrier opt-out webhook (deferred until MYK9-191 merges)

- [ ] 2.1 Branch from fresh `origin/main`, consume the reviewed provider/settings shape, and add assertion-first HMAC-SHA1 signature tests including missing-secret fail-closed behavior.
- [ ] 2.2 Implement STOP/STOPALL/UNSUBSCRIBE/CANCEL/END/QUIT and HELP handling; STOP records opt-out and mutes both channels, while START never creates consent.
- [ ] 2.3 Show carrier STOP state and the sending-number/START recovery guidance in the existing Ring alerts settings surface, distinct from the in-app text delivery switch.
- [ ] 2.4 Run focused webhook/settings tests, typecheck, lint, OpenSpec validation, and security review.

## 3. MYK9-193 — Once-per-entry proximity delivery (deferred until MYK9-192 merges)

- [ ] 3.1 Re-check current `origin/main` migration versions, then add the sent-marker migration with explicit grants/revokes, source tests, rollback notes, and migration-auditor review.
- [ ] 3.2 Replace the push-only early exit with per-recipient channel decisions: absent row means SMS off, opted-out rows are excluded, and push/SMS sends are independent siblings under `Promise.allSettled`.
- [ ] 3.3 Claim/persist the once-per-entry SMS marker so trigger retries cannot emit duplicates, and use the one-segment proximity builder for delivery.
- [ ] 3.4 Run focused sender/idempotency tests, migration checks, typecheck, lint, OpenSpec validation, and second-opinion review.

## 4. Verification and review

- [ ] 4.1 For each issue branch, run its focused tests at least six shuffled times, app test typecheck, app typecheck, lint, `git diff --check`, and `pnpm openspec validate sms-ring-alert-delivery --type change --strict` without retrying a runner that hangs beyond 60 seconds.
- [ ] 4.2 Verify all acceptance scenarios against implementation and fix every CRITICAL OpenSpec verification finding before review.
- [ ] 4.3 Open the scoped PR with Linear/OpenSpec links, risk, non-goals, checks, and material agent involvement; require CI and code/security review before merge.
- [ ] 4.4 After each PR merges, update the batch tracker and linked Linear issue with implementation, tests, risks, acceptance evidence, PR, and merge commit; keep later serialized tasks open.

## 5. Operator-gated deployment and closure

- [ ] 5.1 Record MYK9-190 campaign approval and operator confirmation that all three Twilio secrets exist; do not inspect, copy, set, or log their values.
- [ ] 5.2 With explicit approval, apply the MYK9-191 and MYK9-193 migrations and deploy the SMS functions using the repository’s internal-auth deployment convention; record exact commands and revisions.
- [ ] 5.3 Complete the end-to-end handset proof for opt-in confirmation, HELP, every STOP keyword, carrier STOP settings state, START recovery, and once-per-entry proximity delivery.
- [ ] 5.4 Archive the OpenSpec change only after every required PR is merged and all operator/handset evidence is recorded, then perform final branch/worktree cleanup.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: Consent compliance, authenticated edge functions, external-provider delivery, later webhook authentication, and a later migration span client, database, and provider boundaries even though each serialized PR uses focused local checks.
