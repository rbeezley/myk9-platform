## Context

`people_select` deliberately supports broad operational directory search, while two columns carry private identity data: `date_of_birth` and `junior_handler_numbers`. Existing clients still read and write those legacy columns, so simply revoking their SELECT grants before client adoption would break current workflows.

## Goals / Non-Goals

**Goals:** separate private fields from broad directory access, preserve directory behavior for non-private fields, preserve profile and show-paperwork workflows through narrow APIs, and provide an ordered rollout with an actual confidentiality close.

**Non-Goals:** re-scope names/contact-directory fields, redesign people management, add a new UI, or deploy a migration before merge and explicit approval.

## Decisions

1. Create a one-to-one `people_private` table keyed by `person_id`, rather than changing `people_select` or adding a view. The broad directory policy remains load-bearing for manager search.
2. In PR A, authorize private reads to the subject and site admins only. Show-manager paperwork reads are deliberately withheld until trusted subject consent or immutable assignment provenance is designed and shipped. Current `entries.handler_id` is mutable by a show manager and therefore cannot prove a trusted relationship.
3. Authorize private writes only to the subject and site admins. No manager receives private write access.
4. Use three releases because Vercel can deploy before CI/database migration: a client calling an absent RPC would produce browser-visible 404s. PR A expands the schema and retains one-way legacy write-through; PR B adopts the RPCs only after PR A is deployed; PR C removes legacy columns and write-through only after client rollout evidence.
5. PR A must not revoke legacy-column SELECT. This compatibility gap is explicitly temporary: until PR C, authenticated users can still directly read those two columns, so MYK9-664 is not closed by PR A alone.
6. `entries.handler_id` is manager-mutable under current entry RLS, so it is not trustworthy evidence that the subject consents to show-manager access. A manager can rewrite it to an arbitrary directory person. PR A's private helpers and RPCs must not derive access from that field. Do not restore manager paperwork reads until a separate design establishes trusted consent/provenance and covers adversarial reassignment.
7. The contract gate for PR C requires: PR A applied with ACL/RLS scenarios verified; PR B merged and a green production Vercel deployment at or after its merge SHA; source contract coverage proving no app query/write references legacy columns; trusted manager-read provenance delivered or MYK9-664 remains open; and Richard's explicit acceptance of retiring older cached clients for this web-only rollout.
8. This is online-only identity/profile data, not show-day replicated state; no replication table is introduced.
9. Mixed public/private profile saves use a single `update_person_with_private` SECURITY DEFINER RPC. It locks the person row, validates explicit allowlists and caller scope, applies both patches atomically, and returns private keys only to a private reader. Omitted keys preserve values; explicit JSON null clears them.

## Risks / Trade-offs

- [Circular RLS joins through entries/people] → use fixed-search-path security-definer helpers, live relationship checks, and role-aware SQL scenarios.
- [Manager can change entry.handler_id to a victim] → never use mutable entry linkage as private-read authorization; deny manager reads until independent trust evidence exists.
- [Compatibility window leaves direct legacy reads exposed] → limit it to the expand/adopt interval and make the explicit PR C ACL/column removal gate mandatory.
- [Partial deployment breaks new clients] → keep PR A DB-only and deploy it before PR B calls the RPCs.
- [Legacy writes diverge during adoption] → one-way trigger syncs only valid legacy values into `people_private`; there is no reverse trigger.
- [Live rows differ from seed assumptions] → survey schema, migration ledger, relations, and non-value counts before selecting the migration version.

## Migration Plan

1. PR A: add table, helpers, narrow RPCs, lossless backfill, explicit grants, compatibility write-through, and behavioral SQL contracts. Do not include RPC client calls.
2. Merge PR A, obtain explicit database-push approval, apply it, then verify migration ledger, table/column grants, RPC exposure, and role scenarios against the linked database.
3. PR B: regenerate types from the applied schema and move only subject/site-admin profile surfaces to the RPCs. Keep account shell/presence/global directory queries public-only. Keep manager paperwork private reads disabled pending the separate trusted-consent/provenance design.
4. Verify the production Vercel deployment at or after PR B's merge SHA and source-level absence of legacy app references.
5. PR C: after the contract gate, remove legacy columns and the write-through trigger and revoke legacy column access. Retire stale web sessions as explicitly accepted.

## Validation Profile

- Risk: high
- Validation: full, with independent or approved adversarial security review
- Rationale: This changes RLS, grants, a sensitive-data migration, and multiple identity paths across staged releases.
