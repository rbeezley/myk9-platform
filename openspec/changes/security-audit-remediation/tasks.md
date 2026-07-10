## 1. send-email recipient derivation (SA-018/019)

- [ ] 1.1 In `supabase/functions/send-email/`, for `type: 'support_notification'`, derive the recipient email from the referenced ticket's owner (reuse the ticket already fetched for the `owner_id` authz check in `authz.ts`); stop passing body `data.to`/`data.cc` to Resend for this type.
- [ ] 1.2 For `type: 'entry_decision'`, derive the recipient from the referenced registration's exhibitor/person email (reuse the registration fetched for the show-official check); stop passing body `data.to` to Resend for this type.
- [ ] 1.3 Ensure the recipient-derivation happens before the Resend send and that a missing/unresolvable resource email fails closed (no send, error returned) rather than falling back to body `to`.
- [ ] 1.4 Extract the recipient-resolution logic into a pure, unit-testable helper (input: message type + resolved resource row; output: recipient/cc) so it can be asserted without invoking Resend.

## 2. send-results authorization (SA-020)

- [ ] 2.1 In `supabase/functions/send-results/index.ts`, add a show-official authorization check that queries `user_roles` (joined to `roles`) for a qualifying role on the results' show, mirroring `send-targeted-message`; return a 403-class error before invoking Resend when the caller is not authorized.
- [ ] 2.2 Derive `secretaryEmail` (used for cc + reply-to) from the show/secretary record server-side; ignore body-supplied cc/reply-to/destination. Keep the primary destination fixed to the existing submission address.
- [ ] 2.3 Extract the authorization predicate and the address-derivation into pure helpers for unit testing.

## 3. SQL hardening migration (SA-021/022/027)

- [ ] 3.1 Create one new migration `supabase/migrations/NNN_security_audit_remediation_lifecycle_hardening.sql` (next sequential number) that runs `ALTER TABLE public.<t> FORCE ROW LEVEL SECURITY;` for `support_tickets`, `support_ticket_messages`, `show_lifecycle_email_steps`, `show_lifecycle_email_jobs`, `show_lifecycle_email_attempts`.
- [ ] 3.2 In the same migration, `REVOKE ALL ON FUNCTION public.ensure_show_lifecycle_email_steps(uuid) FROM PUBLIC;` (leave the trigger as the sole caller — do not grant it to anon/authenticated).
- [ ] 3.3 In the same migration, `CREATE OR REPLACE` the lifecycle helper functions `can_manage_show_lifecycle_email`, `ensure_show_lifecycle_email_steps`, and the new-show trigger fn with `SET search_path = ''` and fully-qualified object references, preserving their existing bodies and trigger wiring. Read the current definitions in `20260708120000_show_lifecycle_emails.sql` first and reproduce them faithfully.
- [ ] 3.4 Do NOT run `supabase db push`. The migration is reviewed statically in this change.

## 4. resend-webhook constant-time compare (SA-023)

- [ ] 4.1 In `supabase/functions/resend-webhook/index.ts`, replace `signatures.includes(expectedSig)` with a constant-time comparison across the candidate signatures (length-checked constant-time equality). Preserve the existing 5-minute replay window and fail-closed behavior.

## 5. Client hardening (SA-026 / SA-009)

- [ ] 5.1 In `apps/myk9show/src/pages/admin/OperatorAlertsSection.tsx`, route the error toast through `friendlyDbError(err, '<generic copy>')` instead of raw `err.message`, matching the SA-010 remediation pattern used elsewhere.
- [ ] 5.2 In `apps/myk9show/src/context/AuthContext.tsx` (+ RBAC wiring), refresh the current user's permissions on role change without a reload: subscribe to `user_roles` `postgres_changes` filtered to the current `auth_user_id` and call `refreshPermissions()` on change; on `userProfile.status === 'suspended'`, force sign-out. If realtime is undesirable, piggyback the existing 60s `userProfile` poll to also reload RBAC. Do not bypass the replication layer.

## 6. Testing (assertion-first)

- [ ] 6.1 Unit-test the send-email recipient-resolution helper (Task 1.4): assert `support_notification` resolves to the ticket owner and `entry_decision` to the registration exhibitor, and that a body-supplied third-party `to`/`cc` is ignored. Write the `expect(...).toEqual(...)` assertions red first, then confirm green.
- [ ] 6.2 Unit-test the send-results authorization predicate and address-derivation helpers (Task 2.3): non-official → denied; official → allowed; cc/reply-to derived from the show record, body values ignored.
- [ ] 6.3 Unit-test the resend-webhook signature comparison helper for correctness (matching sig accepted, mismatch rejected) if the constant-time compare is extracted as a helper.
- [ ] 6.4 If a pure helper is extracted for the SA-009 refresh trigger, unit-test that a suspension event triggers sign-out. (Realtime wiring itself is integration-level; keep the testable unit pure.)
- [ ] 6.5 Statically verify the migration: confirm each `FORCE ROW LEVEL SECURITY`, the `REVOKE`, and the redefined functions parse and reference existing objects; run the `migration-auditor` review.
- [ ] 6.6 Run `pnpm typecheck` and the affected app test files; confirm clean before finalizing.

## 7. Finalize

- [ ] 7.1 Update `docs/security-audit-2026-07-10.md` remediation status for SA-018/019/020/021/022/023/026/027/009 (link this change).
- [ ] 7.2 Confirm no `supabase db push` and no `supabase functions deploy` were run. End state is an open PR; deploy/push is a separate confirmed step noted in the PR body.
