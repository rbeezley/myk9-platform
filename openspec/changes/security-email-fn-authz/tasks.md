## 1. SA-013 — send-waitlist-invite (do first, lowest risk)

- [ ] 1.1 Write failing Deno test: request without the shared secret is
      rejected, no `generateLink`/`access_granted_at` side effect (red against
      current behavior)
- [ ] 1.2 Implement server-side shared-secret verification in
      `send-waitlist-invite/index.ts`
- [ ] 1.3 Write and pass idempotency test: second valid call no-ops on
      `access_invite_sent_at`
- [ ] 1.4 Deploy `send-waitlist-invite` (confirmation-gated); verify via
      `supabase functions list`

## 2. SA-004 — send-email

- [ ] 2.1 Verify the `useEntryManagementActions.ts:650` call site's `data.type`
      values to confirm official-only vs. recipient-or-official model
- [ ] 2.2 Write failing Deno test: exhibitor JWT with no show role calling
      `send-email` for another address is denied, Resend not invoked (red)
- [ ] 2.3 Implement the authorization check in `send-email/index.ts` mirroring
      `send-registration-email`'s role check
- [ ] 2.4 Implement per-user rate-limiting reusing the `check_login_rate_limit`
      RPC pattern
- [ ] 2.5 Write and pass the allow-path test: secretary of the show can send
- [ ] 2.6 Deploy `send-email` (confirmation-gated); verify via
      `supabase functions list`

## 3. SA-005 — send-auth-email (deploy-coupled, do last)

- [ ] 3.1 Write failing Deno test: unsigned/badly-signed payload rejected, no
      Resend call (red)
- [ ] 3.2 Implement Standard-Webhooks HMAC verification in
      `send-auth-email/index.ts`, reusing the `resend-webhook` Svix HMAC
      primitive; fail closed when `SEND_EMAIL_HOOK_SECRET` is unset
- [ ] 3.3 Write and pass the allow-path test: correctly signed payload sends
- [ ] 3.4 Provision `SEND_EMAIL_HOOK_SECRET` in the function's environment
- [ ] 3.5 Register the hook secret on the Supabase auth hook in the dashboard
- [ ] 3.6 Deploy the function and flip the dashboard hook registration together
      (coordinated, confirmation-gated); immediately verify with a real
      signup/reset email
- [ ] 3.7 Add the SA-005 deploy coupling to the go-live runbook

## 4. Verification and rollout

- [ ] 4.1 `pnpm typecheck` + `pnpm lint` clean
- [ ] 4.2 Request Codex second opinion (auth-surface change)
- [ ] 4.3 Update `docs/security-audit-2026-07/README.md` status table (SA-004,
      SA-005, SA-013 rows → DONE) and this change's tracking status
