## Why

The applied database has 72 `multiple_permissive_policies` advisor findings across 23 tables. These overlaps multiply per-row authorization work on show-day paths, but consolidating them without per-role proofs could silently widen or narrow access, so MYK9-112 requires a semantics-preserving, table-by-table remediation before fall 2026 launch.

## What Changes

- Inventory the applied policy command, role, `USING`, and `WITH CHECK` definitions for every affected table.
- Replace avoidable overlapping permissive policies with command- and role-specific policies whose effective predicates are the exact logical union of the previous policies.
- Preserve and document role-mismatched overlaps when consolidation would change access for hosted roles covered by `TO public`.
- Add assertion-first contract coverage for every affected table and role class, proving representative rows remain allowed or denied before and after consolidation.
- Record the disposition of all 23 tables and the expected advisor-count reduction for MYK9-108's post-push evidence pass.
- Keep the database push and live advisor verification behind the existing shared-system approval gate.
- Do not add UI, routes, APIs, or product affordances. This change duplicates no existing surface; a link cannot address database policy evaluation overhead.

## Capabilities

### New Capabilities

- `rls-policy-consolidation`: Defines the semantics-preserving consolidation, per-table access-equivalence evidence, and advisor disposition contract for overlapping permissive RLS policies.

### Modified Capabilities

None. Effective product authorization requirements remain unchanged.

## Impact

- Affected systems: Supabase PostgreSQL RLS policies, migration history, database contract tests, and advisor disposition documentation.
- Affected tables: `dogs`, `enrollments`, `exhibitor_profiles`, `judge_assignments`, `judge_availability`, `notification_queue`, `offline_scoring`, `people`, `push_notification_queue`, `push_subscriptions`, `role_requests`, `sport_class_rules`, `sport_templates`, `sport_titles`, `stripe_customers`, `stripe_orders`, `stripe_subscriptions`, `sync_conflicts`, `vaccinations`, `volunteer_class_assignments`, `volunteer_general_assignments`, `volunteer_roles`, and `volunteers`.
- Risk: RLS changes are security-sensitive and can fail silently; implementation requires focused equivalence tests and an independent review before merge.
- Non-goals: changing who may access any row, changing grants, introducing new authorization helpers, redesigning role boundaries, or adding user-facing surface area.
- Expected intentional remainder: the `dogs` INSERT overlap and four `push_subscriptions` command overlaps, where `public` and `authenticated` role sets differ.
- Original execution request: `start myk9-112`.
