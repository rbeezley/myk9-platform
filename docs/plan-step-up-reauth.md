# Step-up re-authentication for refunds and role changes (MYK9-1208)

> **Status:** Active

Session limits (14-day inactivity, 30-day time-box, MYK9-1053) do not protect an unlocked,
signed-in device: a club laptop left open, a phone picked up mid-session. For the actions that
move money or hand out power, the server now asks for the password again. One confirmation
covers five minutes, so a batch of refunds or a round of appointments prompts once.

## Inventory: every gated entry point

### Refunds (edge functions, `apps/myk9show/supabase/functions/`)

| UI entry point                                                                                                                                                           | Server endpoint         | Gate placed                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- | --------------------------------------------------------------------------------------------------- |
| `components/entries/management/RefundEntryDialog.tsx` (opened from `EntryListCard`, `PullManagementTab`, `EntryManagementExceptionPanes`, `ForceDeleteOverride`)         | `stripe-refund-entry`   | after the secretary / club-admin / site-admin check, before any read of payout state or Stripe call |
| `components/shows/RefundAllEntriesCard.tsx` via `features/payments/useShowRefundAll.ts`                                                                                  | `stripe-refund-show`    | after the manager check, before the cancelled-show check and any Stripe call                        |
| `pages/admin/RefundRequestsSection.tsx` (Approve, Check status) and `pages/admin/ResolveWithoutRefundButton.tsx` via `features/admin-system-health/useRefundRequests.ts` | `stripe-approve-refund` | after the site-admin check, before either action runs                                               |

No other caller invokes these three functions (no cron, webhook or service-role caller), so no
exemption is needed. Refund decision logic, amounts and Stripe calls are unchanged.

### Role changes (Postgres)

| UI entry point                                                                                                                                                                                                                                                                                                           | Server path                                                                                                                                     | Gate placed                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Club admin appoints or removes a secretary: `pages/club-admin/ClubMembersPage.tsx` → `setClubShowManagerAccess`                                                                                                                                                                                                          | `grant_club_secretary` / `revoke_club_secretary` RPCs                                                                                           | after the authorization check, before any write                                                                 |
| Club admin approves a secretary request: `pages/club-admin/useClubShowAccessRequests.ts` → `approveClubRoleRequest`                                                                                                                                                                                                      | `approve_club_role_request` RPC → `grant_club_secretary` (unconditional `PERFORM`, no exception handler)                                        | inherited from `grant_club_secretary`                                                                           |
| Site admin approves a role request: `pages/admin/RoleRequestsPage.tsx` → `approveRoleRequest`                                                                                                                                                                                                                            | `approve_role_request` RPC                                                                                                                      | after validation, before the grant (secretary branch also passes through `grant_club_secretary`)                |
| Site admin approves a club access request: `pages/admin/ClubAccessRequestsSection.tsx` → `reviewClubAccessRequest`                                                                                                                                                                                                       | `review_club_access_request` RPC (grants `club_admin`, then `grant_club_secretary`)                                                             | on `approved` only, after the request is validated; denial is not a role change                                 |
| Site-admin role edits: `components/admin/permissions/ManageUserRolesDialog.tsx`, `services/rbac/RoleManager.ts` (`assignRole`, `ensureUserHasRole`, `revokeRole`, `revokeUserRole`, `migrateUserRoles`, `deleteRole`), `components/admin/users/bulkRolePlanner.ts`, `CreateUserDialog` → `rbacService.ensureUserHasRole` | direct PostgREST writes to `user_roles`, `roles`, `role_permissions` (RLS admits only site admins, plus the legacy show-official insert policy) | `AFTER INSERT OR UPDATE OR DELETE ... FOR EACH ROW` trigger on each table, firing only for direct client writes |
| Site-admin role definitions: `pages/admin/permissions/{CreateRolePage,CloneRolePage,RoleEditPage}.tsx` → `RoleManager.createRole` / `updateRole` (MYK9-1409)                                                                                                                                                             | `create_role_with_permissions` / `update_role_with_permissions` RPCs (SECURITY DEFINER, so the direct-write trigger does not fire)              | after the site-admin check, before any write                                                                    |

### Payout account and site-admin account administration (MYK9-1393)

MYK9-1393 found three entry points that meet this plan's own criterion, "move money or hand out
power", and were on neither list. All three are gated, after the role check and before any side
effect, through the copy of `stepUpReauth.ts` in the function's own tree.

| UI entry point                                                                                                                                                         | Server endpoint                                                     | Gate placed                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `features/payments/ClubPaymentsCard.tsx` (start, finish, add missing information, try again) → `useClubStripeAccount.ts` `startConnectOnboarding`                      | `stripe-connect-onboard` (`apps/myk9show/supabase/functions/`)      | after the `is_club_admin` / `is_site_admin` check, before the `club_stripe_accounts` lookup and any Stripe call |
| `/admin/users` permanent delete: `components/admin/users/UserTable` → `usePermanentDeleteUserMutation` → `services/database/users/reads.ts` `permanentDeleteUser`      | `admin-delete-user` (`supabase/functions/`, `deleteUserHandler.ts`) | after the site-admin check, before input validation, the target lookup and either delete                        |
| `/admin/users` "Create User" with an invitation (`components/admin/users/CreateUserDialog.tsx`), Resend access and the roster's bulk send (`useSendUserInvitation.ts`) | `admin-invite-user` (`supabase/functions/`, `inviteUserHandler.ts`) | after the site-admin check, before the identity lookup, `generateLink` and the email                            |

Why each one: whoever completes a Connect onboarding link sets the bank account that
`cron-process-payouts` pays every one of the club's shows into; a permanent delete removes a
person and their sign-in and cannot be undone; an invitation mints a sign-in for an account that
may already hold the roles `CreateUserDialog` assigned. Every caller is
`supabase.functions.invoke` on the one app client, so `stepUpFetch.ts` prompts and replays with no
call-site change, and a cancelled prompt lands in each caller's existing failure copy, which is
already true for the action ("We couldn't start your payment setup", "Failed to permanently
delete user", "the invitation could not be sent"). No cron, webhook, script or service-role caller
invokes any of the three, so no exemption is needed. `stepUpReauthParity.test.ts` holds the
declared list of every gated edge caller across both trees.

### Deliberately not gated

- `grant_show_official` / `revoke_show_official`: naming someone on a show's paperwork. Since
  20260830240000 this is a label, except a steward's ring assignment, which a secretary may
  make on show day. Gating it would put a password prompt in the show-creation wizard and on
  show-day staffing, which the issue rules out.
- Denying requests (`deny_role_request`, `deny_club_role_request`, `review_club_access_request`
  with `denied`): no role changes hands.
- System writers of `user_roles`: `handle_new_user` and `grant_early_access_secretary_role`
  (run by GoTrue, no request JWT), `cleanup_stale_ringside_anon_users` (cron),
  `grant_club_admin_to_club_creator` and `propagate_people_auth_user_id_to_user_roles`
  (`SECURITY DEFINER` triggers: they run as the function owner, so the direct-write trigger
  does not see them as client writes), `soft_delete_person` (deleting a person, not a grant).
- Entitlement grants (`admin_grant_entitlement`): a subscription entitlement, not a role.

## Mechanism: the session JWT's `amr` claim

Supabase access tokens carry `amr: [{ method, timestamp }]`, one entry per way the user proved
who they are in that session, with the time they did it (verified in the installed
`@supabase/auth-js` 2.117.3 types: `AMREntry { method; timestamp }`). A token refresh keeps the
original timestamps, so a 14-day-old session still says "password, 14 days ago". Signing in
again with the same account mints a new session whose `amr` timestamp is now.

The server requires an `amr` entry with an accepted method (`password`, `otp`, `magiclink`, or
an MFA factor) no older than 300 seconds and no more than 60 seconds in the future. Edge
functions read it from the bearer token after `auth.getUser` has verified that token with
GoTrue; Postgres reads it from `auth.jwt() -> 'amr'`.

Why `amr` and not the alternatives:

- **A step-up token from an edge function** needs a new table or a signing secret, a second
  token to carry on every call, and its own expiry and replay rules. `amr` is already signed
  into the session JWT by GoTrue, and both edge functions and `SECURITY DEFINER` RPCs can read
  it with no new state.
- **`iat`** moves on every token refresh, so it says nothing about when the person last typed a
  password.
- **MFA AAL2** would make every secretary and club admin enroll a factor first, and AAL2 lasts
  the whole session, so it does not answer "is the person at the keyboard now".

The custom access token hook (`custom_access_token_hook`, migration 063) passes `claims`
through unchanged, so the object form of `amr` reaches every token.

### Server enforcement

- Edge: `apps/myk9show/supabase/functions/_shared/stepUpReauth.ts` decodes the verified token
  and returns `403 { error: 'step_up_required' }` when the re-auth is missing or stale.
- SQL: `public.require_recent_reauth(p_max_age_seconds integer DEFAULT 300)` raises SQLSTATE
  `MKAUT` (hint `step_up_required`). Exempt: `service_role` tokens and connections with no
  request JWT at all (migrations, cron, GoTrue hooks, psql). An `anon` or `authenticated` token
  without a fresh `amr` is refused.
- The direct-write trigger is `AFTER ... FOR EACH ROW`, so it only sees rows that already
  passed RLS: a non-admin's refused write still reads as 42501, never as a password prompt.

### Client

- `features/step-up/stepUpFetch.ts` wraps the Supabase client's `fetch`. When a response is
  the step-up refusal (PostgREST `code: MKAUT` or an edge function's `error: step_up_required`),
  it asks for confirmation once, then replays the same request with the new access token.
  Every entry point above goes through the one client, so none of them needed a call-site
  change, and a future refund or role endpoint that adds the server gate is covered too.
- Concurrent refusals share one prompt. A refusal that lands after another request's prompt
  already settled is answered from the session the client now holds, when that session is a
  different token for the same account and its `amr` is fresh (`stepUpToken.ts`, a 240 s
  client window under the server's 300 s), so it never opens a second prompt. After a
  confirmation, the server accepts the next five minutes of actions with no prompt.
- CAPTCHA: when a Turnstile site key is configured, the dialog renders the same
  `TurnstileChallenge` the sign-in page uses (action `step_up`) and forwards a fresh
  single-use token with every password, send-code and verify-code attempt, resetting the
  widget after each. With no key it renders nothing and sends no token, as on sign-in.
- `useStepUpReauth` drives `StepUpReauthDialog`, mounted once at the app root: "Confirm your
  password to continue", a clear wrong-password message, Cancel returns the original refusal
  to the caller, whose error copy says only what is true for that action: "No refund was
  issued", "Not approved, so nothing was sent to Stripe this time", "Not resolved", and for
  Check status "Status not checked" (an earlier approval's refund may already exist).

### Accounts with no password (Google, Apple)

The dialog offers "Email me a code instead", and opens on it when the account has no `email`
identity. It calls `signInWithOtp({ email, options: { shouldCreateUser: false } })` and then
`verifyOtp({ email, token, type: 'email' })`, which mints a session whose `amr` is `otp`.
`reauthenticate()` was evaluated and rejected: it only issues a nonce for `updateUser` and
never refreshes the session's `amr`, so the server could not see it. The magic-link email from
`send-auth-email` now also prints the 6-digit code GoTrue already supplies in the hook payload
(`email_data.token`). Following the link in another tab works too: that tab signs in, auth-js
broadcasts the new session, and the open prompt listens to `onAuthStateChange` and settles
itself on a `SIGNED_IN` or `TOKEN_REFRESHED` session for the same user whose `amr` is fresh,
so the refused request replays without the code. The link stays in the email.

## Password changes (owner option 1)

A stale session could otherwise change the password and then pass any step-up check. Two layers:

- **Server:** GoTrue "Secure password change" (`[auth.email] secure_password_change = true` in
  `supabase/config.toml`, checked against the installed CLI 2.117.0 schema, where it maps to
  `security_update_password_require_reauthentication`). A session signed in more than 24 hours
  ago must present the nonce emailed by `reauthenticate()`. config.toml only drives the local
  stack; the hosted project needs the dashboard switch below.
- **Client:** `features/step-up/passwordChange.ts` runs before `updateUser({ password })` for
  both `SecuritySettings` (through `useAuth.updatePassword`) and `ResetPasswordPage`. It needs a
  fresh `amr` (the same `stepUpToken` check), otherwise it opens the step-up dialog. The reset
  page also accepts a `recovery`, `otp` or `magiclink` entry up to 15 minutes old, so a
  forgotten password can be reset from the emailed link. If GoTrue still answers
  `reauthentication_needed`, the client calls `reauthenticate()`, shows "For your security,
  confirm it's you first. We've emailed you a code." with a code field, and retries
  `updateUser({ password, nonce })` (supported by the installed auth-js `UserAttributes.nonce`).
  `send-auth-email` renders the `reauthentication` email as a code with no link.

Owner step (hosted project `sojmvhhwsjxmfistvzbe`): Supabase Dashboard > Authentication >
Sign In / Providers > Email > turn on "Secure password change" > Save.

## Offline and show day

Refunds and role changes were already online-only: edge functions and RPCs with no replicated
path. Nothing under `/at-show`, `features/at-show`, `show-today`, `show-workbench`,
`show-live-sync`, the scoring packages or the ringside package calls a gated endpoint (grep in
this branch). The fetch wrapper only acts on the two refusal shapes, which no ringside or
scoring endpoint can return, so offline queues and show-day traffic pass through untouched.

## Testing phase

- [x] `_shared/stepUpReauth.test.ts` (node environment): fresh password and OTP pass; stale,
      missing, string-form, future and garbage `amr` refuse; each refund function's gate runs
      after authorization and before its first Stripe or payout read. Since MYK9-1393 the same
      block pins `stripe-connect-onboard`, and `stepUpReauthParity.test.ts` fails by name when
      any gated edge caller in either tree loses its gate or a new caller is not listed.
- [x] `admin-delete-user/deleteUserHandler.test.ts`, `admin-invite-user/inviteUserHandler.test.ts`
      (MYK9-1393): a stale session is refused with `step_up_required` after the role check and
      nothing is deleted, looked up, minted or sent; a non-site-admin still gets the role refusal.
- [x] `features/step-up/*.test.ts(x)`: the fetch wrapper replays once with the new token,
      shares one prompt across concurrent refusals, does not re-prompt inside the window,
      passes other errors through; the dialog's wrong-password message and the email-code path.
- [ ] `supabase/tests/myk9_1208_step_up_reauth_test.sql`: `require_recent_reauth` refuses and
      accepts; a gated RPC and a direct `user_roles` write by a site admin are refused without
      a fresh `amr` and allowed with one. Registered in the runner; it runs only in CI (no
      local container runtime), so it is unchecked until a CI run shows its PASS notices.
      `myk9_169_role_boundaries_test.sql` and `show_officials_label_not_permission_test.sql`
      now carry a fresh `amr` in their JSON claims, since they call `grant_club_secretary`.
- [ ] After deploy: on staging, a refund and a secretary appointment prompt once, and a second
      within five minutes does not.
- [ ] After deploy (MYK9-1393): Connect onboarding from `ClubPaymentsCard` prompts once and
      then opens Stripe; a permanent delete and an invitation from `/admin/users` prompt once.

## Deploy

`supabase db push` for `20261017163700_myk9_1208_step_up_reauth.sql`;
`supabase functions deploy stripe-refund-entry stripe-refund-show stripe-approve-refund`
(myk9show tree) and `send-auth-email` (root tree); then a Deploy myK9Show run for the client.
MYK9-1393 adds `supabase functions deploy stripe-connect-onboard` (myk9show tree) and
`admin-delete-user admin-invite-user` (root tree); the client already handles the refusal.
Deploy the client before or with the functions so the prompt exists when the server starts
refusing.
