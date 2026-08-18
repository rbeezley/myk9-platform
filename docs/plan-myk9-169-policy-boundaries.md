# MYK9-169 Policy Boundaries Plan

## Policy decision

- Club-wide secretary/show-manager access requires an `active` row in
  `club_members` for the target club.
- An explicitly assigned show-scoped secretary may be a non-member. Show
  scope is not promoted to club scope by membership or role lookup.
- Judges do not require club membership; an authorized `judge_assignments`
  row remains sufficient for judge access.
- Lapsed, suspended, and resigned members must not retain effective
  club-scoped secretary access. Existing role rows may remain for audit and
  reactivation, but shared authorization predicates must ignore them.

## Implementation

1. Add a security-definer active-membership predicate reusable by the grant
   RPC and authorization helpers.
2. Require active membership in `grant_club_secretary` and make the existing
   club-admin Members action clearly reject inactive members before calling the
   RPC.
3. Update club/show role predicates so inactive club-scoped secretary rows are
   ineffective and show-scoped secretary rows do not become club-wide access.
4. Update the club-admin guide to match the policy.

## Testing

- Extend the SQL authorization matrix for active, non-member, lapsed, and
  suspended club secretary grants and access.
- Cover an explicitly assigned non-member show secretary.
- Cover a non-member assigned judge and preserve existing cross-club/show
  boundaries.
- Add focused UI coverage for inactive-member Show Access behavior.
- Run focused SQL tests, relevant app unit tests, typecheck, and the full
  myK9Show suite once; stop a hanging suite after 60 seconds per repository
  guidance.
