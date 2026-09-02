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

Do not delete these symbols in this wave. Several are exported from published
workspace package barrels, so repository-local zero-import evidence does not
prove that external consumers are unaffected. The safe next step is a package
API compatibility decision (or a major-version/deprecation plan), followed by
one package at a time with package builds and typecheck evidence.

The replication TTL cluster is additionally not safe to wire: expiry would
create false-empty offline reads. Keep it unchanged until a replacement cache
policy is designed.
