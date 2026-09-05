# MYK9-10 Auth Identity Revocation Plan

> **Status:** Complete — metadata reconciled 2026-09-05.
> MYK9-10 refreshed Done; self-service identity revocation contract is closed.


## Scope

Complete the existing self-service account deletion flow by banning the authenticated
Supabase identity after `soft_delete_person` succeeds. Keep the reversible person
tombstone semantics and report revocation failures through `operator_alerts`.

Duplication check: this does not add or duplicate a user-facing surface. It tightens
the existing Account → Delete account workflow and adds one narrowly scoped Edge
Function because service-role auth administration cannot run in the browser or SQL
RPC.

## Implementation

1. Add a JWT-authenticated self-revocation Edge Function that derives the target auth
   user from the verified token, applies the long-duration ban, and records a
   deduplicated operator alert if revocation fails.
2. Invoke the function after the existing person tombstone succeeds and before local
   sign-out. Preserve the current accurate post-tombstone error handling.
3. Update `OPEN-TODOS.md` only after verification proves the slice complete.

## Testing and verification

1. Add the value-sensitive Edge Function assertion first and observe it fail before
   implementation: `updateUserById(authUserId, { ban_duration: '876000h' })`.
2. Add Account page coverage proving the self-revocation function is invoked only
   after successful soft deletion and before sign-out.
3. Run the focused Edge Function and Account page tests, the relevant myK9Show
   typecheck, and diff/format checks.
4. Do not deploy the Edge Function or mutate the linked Supabase project without the
   user's explicit shared-system approval.

## Verification evidence

- 2026-07-14: deployed `revoke-self-auth-identity` to project
  `sojmvhhwsjxmfistvzbe` with `--no-verify-jwt` after explicit approval.
- Remote disposable-account proof passed: `soft_delete_person` succeeded, the Edge
  Function returned `revoked: true`, the auth row had `banned_until`, and a fresh
  password sign-in failed with `user_banned`. Temporary people/auth rows were removed.
