# Role: Site Admin

## Scope for fall 2026
**Functional only — just the user.** One site admin for the whole platform during fall. Impersonation, audit trails, and multi-admin workflows are post-fall concerns.

## Who they are
The platform operator. Deeply computer-literate. Responsible for keeping the lights on, onboarding new clubs, and being the final escalation point for anything a secretary can't fix themselves.

## Must accomplish (fall 2026)

1. **Manage users** — create, deactivate, and reset user accounts across the platform.
2. **Assign roles** — grant Secretary, Club Admin, Exhibitor, and Site Admin roles to users.
3. **Manage organization and sport templates** — add, modify, and delete templates for each sanctioning body (AKC, UKC, ASCA) and each sport under them. When a sanctioning body changes a rule, site admin updates the template and future shows inherit it.
4. **Assist secretaries across the platform** — Site Admin carries all Secretary permissions everywhere; no impersonation required. If a secretary is stuck, Site Admin can act in their club directly.
5. **Onboard new clubs** — create clubs for legitimate requests (see duty 6) and hand the first admin seat to the club contact.
6. **Review incoming club requests** — read submissions from the public landing-page "request a club" form, vet them, and either create the club or reject.
7. **Monitor platform health** — minimum viable: see active shows, recent errors, Supabase usage. Enough to catch problems before users call. No fancy dashboard.
8. **Emergency data repair** — documented runbook for inevitable "a secretary deleted the wrong entry, fix it" cases. Supabase Studio access plus a written procedure, not a custom admin UI.
9. **Troubleshoot general issues** — support escalation for anything a secretary or exhibitor can't resolve themselves.

## Should never have to think about
- Remembering which sport has which levels — templates carry that.
- Whether a fix in one club affects others — fixes are scoped by design.
- Building dashboards just to see what's going on — minimum viable telemetry is enough for fall.

## Deferred to post-fall
- Multi-admin site-admin workflow with audit trails.
- Impersonation mode (as distinct from the "all permissions" approach).
- Custom admin UI for emergency data repair.
- Rich platform analytics and dashboards.
- Self-service club onboarding that bypasses the admin review step.
