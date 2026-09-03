# MYK9-328 package dead-code inventory

Inventory date: 2026-09-02

The package sweep was run with whole-word searches across `apps/`, `packages/`,
and `supabase/`, excluding tests and build output.

## Result

The following clusters have no runtime importer in this repository:

- `@myk9/scoring`: timer store and calculation/nationals utility exports.
- `@myk9/scoring-ui`: animation, swipe, notification-permission, dialog-state
  hooks, and entry-mode scoresheets.
- `@myk9/ringside`: the unmounted `ClassList` cluster and listed unused helpers.
- `@myk9/ui`: the listed duplicate primitives.
- `@myk9/supabase`: the singleton client factory and React hook.
- `@myk9/replication`: TTL machinery, which is inert by design.

## Decision

The approved first cleanup removes the unused `@myk9/supabase` client singleton
and React hook, trims the package barrel, and documents the package as the
canonical generated-type surface. Repository-local usage was type-only, and the
API removal was explicitly approved before implementation. The remaining
clusters still need the same package-by-package compatibility decision and
verification before deletion.

The replication TTL cluster is additionally not safe to wire: expiry would
create false-empty offline reads. Keep it unchanged until a replacement cache
policy is designed.
