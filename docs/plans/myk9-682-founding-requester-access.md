# MYK9-682 implementation plan

## Goal

When a site admin approves a new-club request, the founding requester receives club-scoped club-admin access, club-scoped secretary/show-operation access, and an active membership row for that same club.

## Implementation

1. Extend the existing `review_club_access_request` transaction in a new Supabase migration.
2. Reuse the established secretary appointment RPC so the grant keeps its existing authorization, expiry reset, and audit behavior.
3. Upsert `club_members` for the requester without changing existing membership type or dues data.
4. Include the secretary assignment and membership identifiers in the approval audit record.
5. Add behavioral SQL coverage for new-club approval, cross-club scope, idempotent role/membership reactivation, and rollback on a failed approval.
6. Update the club-admin and secretary documentation to describe the founding requester’s resulting access.

## Testing phase

- Run the targeted app/database contract tests and migration guard.
- Run the behavioral SQL test when a local Supabase database is available.
- Run formatting, typecheck/lint checks for touched application files, and inspect the final diff.
