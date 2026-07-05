## 1. SA-013 — send-waitlist-invite (do first, lowest risk)

- [x] 1.1 Write failing Deno test: request without the shared secret is
      rejected, no `generateLink`/`access_granted_at` side effect (red against
      current behavior)
- [x] 1.2 Implement server-side shared-secret verification in
      `send-waitlist-invite/index.ts`
- [x] 1.3 Write and pass idempotency test: second valid call no-ops on
      `access_invite_sent_at`
- [x] 1.4 Deploy `send-waitlist-invite` (confirmation-gated); verify via
      `supabase functions list` — **DONE 2026-07-04 (v28)**; Vault
      `waitlist_invite_secret` + env `WAITLIST_INVITE_SECRET` provisioned
      (matched); live negative test returns `403` on missing/wrong secret

## 2. SA-004 — send-email

- [x] 2.1 Verify the `useEntryManagementActions.ts:650` call site's `data.type`
      values to confirm official-only vs. recipient-or-official model
- [x] 2.2 Write failing Deno test: exhibitor JWT with no show role calling
      `send-email` for another address is denied, Resend not invoked (red)
- [x] 2.3 Implement the authorization check in `send-email/index.ts` mirroring
      `send-registration-email`'s role check
- [x] 2.4 Implement per-user rate-limiting reusing the `check_login_rate_limit`
      RPC pattern
- [x] 2.5 Write and pass the allow-path test: secretary of the show can send
- [x] 2.6 Deploy `send-email` (confirmation-gated); verify via
      `supabase functions list` — **DONE 2026-07-04 (v58)**; live negative test
      returns `401` on an unauthenticated call (was fully open before)

## 3. SA-005 — send-auth-email (deploy-coupled, do last)

- [x] 3.1 Write failing Deno test: unsigned/badly-signed payload rejected, no
      Resend call (red)
- [x] 3.2 Implement Standard-Webhooks HMAC verification in
      `send-auth-email/index.ts`, reusing the `resend-webhook` Svix HMAC
      primitive; fail closed when `SEND_EMAIL_HOOK_SECRET` is unset
- [x] 3.3 Write and pass the allow-path test: correctly signed payload sends
- [x] 3.4 Provision `SEND_EMAIL_HOOK_SECRET` in the function's environment —
      **DONE 2026-07-04**; set to match the existing dashboard hook signing
      secret (`v1,whsec_…`)
- [x] 3.5 Register the hook secret on the Supabase auth hook in the dashboard —
      **DONE 2026-07-04**; the Send Email Hook was already enabled + signing, so
      the cutover matched the env secret to the existing dashboard secret (no
      dashboard write needed)
- [x] 3.6 Deploy the function and flip the dashboard hook registration together
      (coordinated, confirmation-gated); immediately verify with a real
      signup/reset email — **DONE 2026-07-04 (v45)**; live password-reset logged
      `send-auth-email 200` (signature verified) + `resend-webhook 200`
      (delivery accepted)
- [x] 3.7 Add the SA-005 deploy coupling to the go-live runbook

## 4. Verification and rollout

- [x] 4.1 `pnpm typecheck` + `pnpm lint` clean
- [x] 4.2 Request Codex second opinion (auth-surface change)
- [x] 4.3 Update `docs/security-audit-2026-07/README.md` status table (SA-004,
      SA-005, SA-013 rows → DONE) and this change's tracking status — **DONE
      2026-07-04**
