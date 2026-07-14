## 1. send-email recipient derivation (SA-018/019)

- [x] 1.1 In `supabase/functions/send-email/`, for `type: 'support_notification'`, derive the recipient email from the referenced ticket's owner (reuse the ticket already fetched for the `owner_id` authz check in `authz.ts`); stop passing body `data.to`/`data.cc` to Resend for this type.
- [x] 1.2 For `type: 'entry_decision'`, derive the recipient from the referenced registration's exhibitor/person email (reuse the registration fetched for the show-official check); stop passing body `data.to` to Resend for this type.
- [x] 1.3 Ensure the recipient-derivation happens before the Resend send and that a missing/unresolvable resource email fails closed (no send, error returned) rather than falling back to body `to`.
- [x] 1.4 Extract the recipient-resolution logic into a pure, unit-testable helper (input: message type + resolved resource row; output: recipient/cc) so it can be asserted without invoking Resend.

## 2. send-results authorization (SA-020)

- [x] 2.1 In `supabase/functions/send-results/index.ts`, add a show-official authorization check that queries `user_roles` (joined to `roles`) for a qualifying role on the results' show, mirroring `send-targeted-message`; return a 403-class error before invoking Resend when the caller is not authorized.
- [x] 2.2 Derive `secretaryEmail` (used for cc + reply-to) from the show/secretary record server-side; ignore body-supplied cc/reply-to/destination. Keep the primary destination fixed to the existing submission address.
- [x] 2.3 Extract the authorization predicate and the address-derivation into pure helpers for unit testing.

## 3. SQL hardening migration (SA-021/022/027)

- [x] 3.1 Create one new migration `supabase/migrations/NNN_security_audit_remediation_lifecycle_hardening.sql` (next sequential number) that runs `ALTER TABLE public.<t> FORCE ROW LEVEL SECURITY;` for `support_tickets`, `support_ticket_messages`, `show_lifecycle_email_steps`, `show_lifecycle_email_jobs`, `show_lifecycle_email_attempts`.
- [x] 3.2 In the same migration, `REVOKE ALL ON FUNCTION public.ensure_show_lifecycle_email_steps(uuid) FROM PUBLIC;` (leave the trigger as the sole caller — do not grant it to anon/authenticated).
- [x] 3.3 In the same migration, `CREATE OR REPLACE` the lifecycle helper functions `can_manage_show_lifecycle_email`, `ensure_show_lifecycle_email_steps`, and the new-show trigger fn with `SET search_path = ''` and fully-qualified object references, preserving their existing bodies and trigger wiring. Read the current definitions in `20260708120000_show_lifecycle_emails.sql` first and reproduce them faithfully.
- [x] 3.4 Do NOT run `supabase db push`. The migration is reviewed statically in this change.

## 4. resend-webhook constant-time compare (SA-023)

- [x] 4.1 In `supabase/functions/resend-webhook/index.ts`, replace `signatures.includes(expectedSig)` with a constant-time comparison across the candidate signatures (length-checked constant-time equality). Preserve the existing 5-minute replay window and fail-closed behavior.

## 5. Client hardening (SA-026 / SA-009)

- [x] 5.1 In `apps/myk9show/src/pages/admin/OperatorAlertsSection.tsx`, route the error toast through `friendlyDbError(err, '<generic copy>')` instead of raw `err.message`, matching the SA-010 remediation pattern used elsewhere.
- [x] 5.2 SA-009 — no change needed (false positive). `AuthContext.tsx:322-326` already reloads full RBAC on a 60s `window.setInterval(loadRbacData, 60_000)` (shipped 2026-07-03 in #1099), bounding permission staleness to ≤60s for grant and revoke; suspension sign-out is handled by the 60s `userProfile` poll. A realtime subscription was prototyped and dropped (REPLICA IDENTITY FULL WAL cost + shared-publication change for a marginal gain on an already-closed finding). Audit report corrected.

## 6. Testing (assertion-first)

- [x] 6.1 Unit-test the send-email recipient-resolution helper (Task 1.4): assert `support_notification` resolves to the ticket owner and `entry_decision` to the registration exhibitor, and that a body-supplied third-party `to`/`cc` is ignored. Write the `expect(...).toEqual(...)` assertions red first, then confirm green.
- [x] 6.2 Unit-test the send-results authorization predicate and address-derivation helpers (Task 2.3): non-official → denied; official → allowed; cc/reply-to derived from the show record, body values ignored.
- [x] 6.3 Unit-test the resend-webhook signature comparison helper for correctness (matching sig accepted, mismatch rejected) if the constant-time compare is extracted as a helper.
- [x] 6.4 N/A — SA-009 shipped no code (false positive; see 5.2), so no new unit under test.
- [x] 6.5 Statically verify the migration: confirm each `FORCE ROW LEVEL SECURITY`, the `REVOKE`, and the redefined functions parse and reference existing objects; run the `migration-auditor` review.
- [x] 6.6 Run `pnpm typecheck` and the affected app test files; confirm clean before finalizing. (typecheck 12/12 clean; 85 tests pass across the 6 affected files.)

## 7. Finalize

- [x] 7.1 Update `docs/security-audit-2026-07-10.md` remediation status for SA-018/019/020/021/022/023/026/027 and correct SA-009 to a false positive (already fixed in #1099).
- [x] 7.2 Confirm no `supabase db push` and no `supabase functions deploy` were run. End state is an open PR; deploy/push is a separate confirmed step noted in the PR body.
