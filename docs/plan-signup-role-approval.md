# Signup Role Approval Plan

## Problem

New users can select elevated roles on signup (`club_officer`, `secretary`), but those choices are only stored in auth metadata and do not create an auditable request for site admins. The UI can imply access may be automatic. Existing club-admin secretary assignment should remain the normal trusted path after a club already has an approved admin.

## Solution

Create a narrow site-admin approval flow for elevated signup intent:

1. Add a `role_requests` table with RLS, status tracking, requester ownership reads, and site-admin review/update policies.
2. Keep signup auto-granting only the exhibitor role, but insert pending elevated-role requests after signup when the user selected club officer or secretary.
3. Update signup copy to make elevated roles explicit requests that require approval.
4. Add a site-admin review surface for pending role requests. Approval creates scoped `user_roles` through an authorized RPC or service path; denial records an auditable status and note.
5. Keep secretary assignment delegated to approved club admins where possible.

## Testing Phase

1. Unit test signup submission so selected elevated roles call the role-request service and still pass only metadata to Supabase auth.
2. Unit test role-request service mapping and approval/denial calls.
3. Component test the admin review surface for pending, approve, and deny states.
4. Run focused Vitest files, then run the relevant app typecheck if the focused suite passes.
