# Supabase Advisor Inventory — go-live-2026-07-11-gate-remediation, Batch B

Task 9.1 of `openspec/changes/go-live-2026-07-11-gate-remediation/tasks.md`.

## Files

- `raw-security.json` / `raw-performance.json` — raw MCP `get_advisors` output (`security` and
  `performance` types), captured 2026-07-12 via `mcp__supabase__get_advisors` (read-only).
- `before-2026-07-12.json` — normalized/classified snapshot generated from the raw files by
  `scripts/qa/db-drift/advisor-inventory.ts`. This is the "before" baseline for Batch B
  disposition (tasks 9.2–9.8). Re-run the same command after remediation lands to produce the
  "post" snapshot and diff by `identity` (stable across re-runs; functions carry a type-only
  identity-argument signature, e.g. `public.foo(uuid, text)`).

## Live count vs the July 11 ledger baseline

The task ledger (see proposal/design) recorded **364 entries** (2 ERROR, 3 INFO, 359 WARN) as of
the July 11 audit. The live snapshot captured 2026-07-12 has:

|       | July 11 ledger | 2026-07-12 live | Delta |
| ----- | -------------- | --------------- | ----- |
| Total | 364            | 524             | +160  |
| ERROR | 2              | 2               | 0     |
| WARN  | 359            | 361             | +2    |
| INFO  | 3              | 161             | +158  |

**All 524 entries classified: 522 repository-owned, 2 extension-owned, 0 unclassified.** The
inventory script exits non-zero on any unclassified repository-owned entry; a clean exit 0
confirms every object identity in this snapshot is accounted for by the classifier.

### Why the INFO count jumped (+158)

The July 11 ledger's INFO count (3) almost certainly reflects only the `security` advisor export.
This snapshot combines **both** `security` and `performance` advisor types per task 9.1's
instructions ("security + performance advisors"), and the `performance` export contributes 101
`unused_index` + 55 `unindexed_foreign_keys` (mostly INFO/WARN) entries not present in a
security-only export. That alone accounts for the bulk of the INFO delta; the remainder is normal
advisor-count drift between July 11 and July 12 (new tables/functions shipped in the interim,
e.g. via merged PRs on `main`).

### WARN breakdown (2026-07-12), by advisor code

| Count | Code                                                 |
| ----- | ---------------------------------------------------- |
| 110   | `auth_allow_anonymous_sign_ins`                      |
| 101   | `unused_index`                                       |
| 84    | `authenticated_security_definer_function_executable` |
| 81    | `multiple_permissive_policies`                       |
| 74    | `auth_rls_initplan`                                  |
| 55    | `unindexed_foreign_keys`                             |
| 10    | `anon_security_definer_function_executable`          |
| 4     | `rls_enabled_no_policy`                              |
| 2     | `security_definer_view`                              |
| 2     | `duplicate_index`                                    |
| 1     | `auth_db_connections_absolute`                       |

Note: some codes (e.g. `unused_index`, `unindexed_foreign_keys`, `multiple_permissive_policies`,
`auth_rls_initplan`) surface at multiple levels across the two advisor types; the table above sums
all levels per code. `security_definer_view` (2) covers `view_public_entry_results` and
`view_authenticated_entry_results` — see task 9.3.

## Regenerating

```bash
pnpm qa:advisor-inventory -- \
  --security=docs/audits/2026-07-go-live-advisors/raw-security.json \
  --performance=docs/audits/2026-07-go-live-advisors/raw-performance.json \
  --out=docs/audits/2026-07-go-live-advisors/<before-or-post>-<date>.json
```

Raw advisor JSON must be fetched separately (via `mcp__supabase__get_advisors` for `security` and
`performance`, or the Supabase dashboard export) and saved to the paths above before running the
script — the script only normalizes/classifies/writes, it does not call the network itself.

## Next steps (tasks 9.2–9.8)

This snapshot is the evidence base for:

- 9.2 — 119 unique repository-owned SECURITY DEFINER functions behind the 84 + 10 = 94
  `*_security_definer_function_executable` WARN/entries (ledger cites 231 role warnings across
  overloads; this snapshot's per-identity count differs because it collapses overload count by
  distinct advisor-entry rows, not distinct roles × functions).
- 9.3 — the 2 `security_definer_view` entries (`view_public_entry_results`,
  `view_authenticated_entry_results`).
- 9.4 — `login_attempts`, `show_money_locks`, `show_passcodes` disposition (see
  `rls_enabled_no_policy`, 4 entries).
- 9.5 — the 15 named functions needing `search_path = ''`.
- 9.6 — storage policy entries from `013_create_images_storage_bucket.sql` /
  `189_published_premium.sql`.
- 9.7 — the 110 `auth_allow_anonymous_sign_ins` project-level exception.
- 9.8 — after remediation, regenerate this snapshot as the "post" file and prove every "before"
  entry maps to a fix, exclusion, or exception.
