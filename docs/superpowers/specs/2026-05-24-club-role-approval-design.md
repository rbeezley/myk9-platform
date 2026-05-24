# Club Role Approval Workflow Design

## Goal

Create a low-friction, secure access model where a site admin approves each new club and its first club admin, then that approved club admin can manage secretary access for only their own club.

## Trust Model

The site-admin approval boundary is club ownership, not every staffing action. A new club request creates a pending review item. When a site admin approves it, myK9 creates or links the club and grants the requester a `club_admin` role scoped to that club.

After that, the club admin can grant and revoke `secretary` for the same club. A secretary can serve multiple clubs, but each club relationship is a separate `user_roles` row with its own `club_id`.

## Role Scope Rules

- `exhibitor`: global default role created at signup.
- `club_admin`: always scoped to one `club_id`; only site admins approve the first one for a club.
- `secretary`: always scoped to one `club_id`; site admins or that club's admins can grant it.
- `site_admin`: global platform role; only site admins can manage platform-level review queues.

Show secretary selection must be filtered by club scope. A person with `secretary` for Club A can be assigned to Club A shows. They cannot be selected as secretary for Club B unless Club B also grants them secretary access.

## Signup Experience

The signup role copy changes from identity language to request language:

- "I show dogs" remains the default exhibitor path.
- "I help run a club or host shows" opens club request fields.
- "I work as a show secretary" explains that a club admin can add them after the club is approved.

Club request fields collect the minimum needed for approval: club name, optional website, and an optional note. The form stays calm and explicit: elevated access requires approval, and signing up still creates a normal exhibitor account.

## Data Model

Create `club_access_requests`:

- requester person and auth user ids
- requested club name
- optional website and note
- status: `pending`, `approved`, `denied`
- review metadata: reviewer, reviewed timestamp, review note
- approved `club_id`

Rows are created from signup metadata by the existing `handle_new_user()` trigger path so they work before email confirmation creates a client session. Requesters can read their own requests. Site admins can read and review all requests.

## Authorized Mutations

Use security-definer RPCs for elevated role changes instead of broad table writes:

- `review_club_access_request(...)`: site-admin only; approves or denies a pending club request. Approval creates/links the club and grants `club_admin`.
- `grant_club_secretary(...)`: site-admin or `club_admin` for that club only; grants an active club-scoped `secretary` role.
- `revoke_club_secretary(...)`: site-admin or `club_admin` for that club only; deactivates the matching secretary role.

Harden `user_roles` RLS so normal authenticated users cannot directly insert/update/delete arbitrary role assignments.

## People And Dog Permissions

People and dogs remain global records, but secretary power is operational and scoped. Exhibitors manage their own profile and dogs. Club-scoped secretaries can add or edit people/dogs only through show-entry workflows for their club, such as mail-in and day-of entries.

Current broad secretary checks are a known risk. This work includes a focused hardening pass for user-role writes and a planning marker for dog/person CRUD hardening where policy calls use unscoped `is_trial_secretary()` / `is_show_secretary()`.

## Admin UI

Add a site-admin review queue under `/admin/access-requests`. It lists pending club requests with requester name/email, requested club, signup note, and Approve/Deny actions.

Extend club member management so a club admin can add or remove club-scoped secretaries from their own club. The UI should use clear language: "Can manage this club's shows" rather than broad platform language.

## Testing

Testing must prove:

- signup still auto-grants only `exhibitor`
- signup club-interest metadata creates a pending club request
- approving a request grants `club_admin` only for the approved club
- a Club A admin can grant Club A secretary but cannot grant Club B secretary
- secretary selection for a show only includes secretaries scoped to that show's club
- direct client writes to `user_roles` are rejected unless routed through authorized RPCs

## Out Of Scope

- Payment or billing approval for clubs
- Automated identity verification
- Site-admin approval for every secretary assignment
- Reworking all people/dog CRUD into fully scoped RPCs in the first slice
