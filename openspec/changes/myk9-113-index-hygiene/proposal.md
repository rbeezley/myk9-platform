## Why

The production-candidate database reported 58 unindexed foreign keys and 2 duplicate indexes.
A fresh advisor-compatible query now finds 52, while a stricter check requiring the FK column to
be the leading key of a non-partial index finds 78, including 10 on the named show-day tables.
Classifying and correcting those findings reduces avoidable scans and write amplification before
the fall 2026 launch rehearsal while preserving indexes whose usage cannot yet be measured
reliably on the small pre-launch dataset.

## What Changes

- Inventory the live and migration-defined foreign keys and indexes, including exact definitions,
  predicates, validity, uniqueness, scan counts, and sizes.
- Add full supporting indexes for all 78 strictly uncovered foreign keys, including the 10
  hot-path findings, rather than accepting partial or non-leading coverage.
- Drop only exact duplicate indexes or indexes provably covered by a retained index, in a
  migration separate from all index additions.
- Record a one-line keep/drop rationale for every never-scanned index rather than treating
  `idx_scan = 0` as evidence of uselessness.
- Re-run the Supabase performance advisor after an explicitly approved database push and record
  the resulting finding counts.
- Update MYK9-113 and the existing launch-readiness tracking source with the evidence.

Non-goals:

- No bulk deletion of never-scanned indexes before MYK9-109 provides realistic show-weekend
  traffic.
- No query or RLS rewrites; high sequential-scan root causes remain MYK9-114.
- No new product page, dialog, or other UI surface.
- No automatic shared-database mutation; the database push remains an explicit operator gate.

This does not duplicate an existing product surface because it changes database infrastructure
only. A link cannot replace the missing physical indexes, and no new user-facing surface is
needed.

## Capabilities

### New Capabilities

- `database-index-hygiene`: Defines the auditable classification, migration separation, and
  post-deployment evidence required for safe index maintenance.

### Modified Capabilities

None.

## Impact

- `supabase/migrations/`: separate additive and subtractive index migrations.
- OpenSpec and launch-readiness documentation: durable classification and verification evidence.
- Linked Supabase project `sojmvhhwsjxmfistvzbe`: indexes change only after explicit approval.
- No application API, replication contract, user workflow, or runtime dependency changes.
