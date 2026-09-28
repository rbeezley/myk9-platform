# Proposal

## Why

A club access request can be approved while its club remains unauthorized for publication. The current admin handoff exists only in page memory, so leaving or reloading Admin → Onboarding hides the remaining action. This left Darboshea unauthorized during the October 10 launch rehearsal and made a completed onboarding step look like a completed publishing gate.

## What Changes

- Show site admins a persistent list of live clubs whose authorization is pending on the existing Admin → Onboarding page, including clubs created outside the access-request flow.
- Let the site admin authorize a named club from that list through the existing site-admin-only `set_club_authorization` RPC, with a confirmation that explains public listing and show publication.
- Refresh the list after an access-request approval or authorization, and show honest loading and failure states.
- Preserve separate access approval and club authorization decisions. Do not authorize automatically when granting a requester club roles.

## Capabilities

### New Capabilities

- `club-authorization-handoff`: Admin onboarding keeps the publishing authorization step discoverable until the club is authorized.

### Modified Capabilities

None.

## Impact

MYK9-855 and the MYK9-829 publishing precondition. myK9Show Admin → Onboarding and the existing club authorization service are affected. No migration or new route is planned. This tightens the fall 2026 secretary/show-day launch workflow: an approved organizer cannot be silently stranded with an unpublishable show. The existing club detail page also has an authorization action; a link alone is insufficient because the site-admin test account could not load the unauthorized Darboshea detail page from the signed-in clubs replica, and the post-approval link disappears after navigation. The onboarding page is the owner surface for pending authorization. Non-goals: changing club RLS, automatically trusting new clubs, publishing a show, or adding a second club-management page.
