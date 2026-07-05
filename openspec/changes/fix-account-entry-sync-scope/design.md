## Context

`/exhibitor/entries` uses `getUserEntries(personId)` to render the account-level My Shows page. That read prefers the local replicated entries table, but entry replication is show-scoped for ringside/show-day use. The global `ReplicationSyncProvider` runs without a scope, so `ReplicatedEntriesTable.sync('')` intentionally skips downloading entries. A cold browser can therefore have dogs and shows locally but no entries, producing a false "no entries" state.

This change preserves the current page and query surface. It does not add UI or duplicate another workflow.

## Goals / Non-Goals

**Goals:**

- Make account-level exhibitor entry reads accurate when online, even if the local entries replica is empty.
- Preserve offline behavior by returning the local result when the authoritative online view cannot be reached.
- Reduce future confusion by using sync scope terminology in the global provider and touched sync code.
- Add focused regression tests for the cold local replica case.

**Non-Goals:**

- Replace the replication package or redesign all local-first reads.
- Rename every historical ringside `licenseKey` reference in one pass.
- Change passcode behavior for unauthenticated stewards, timers, or judges.
- Add new screens, dialogs, or navigation.

## Decisions

1. **Use the authenticated entry-results view as the online authority for empty account reads.**
   - Rationale: `postgrestGetUserEntries` already scopes to `is_own_entry = true`, applies result visibility rules, and avoids leaking manageable-but-not-own rows.
   - Alternative considered: force global entry replication. That would either require unscoped entry downloads or a new account-scoped replication mode, both broader than this bug fix.

2. **Keep local-first behavior for hydrated local entries.**
   - Rationale: existing offline behavior and scored-result safeguards depend on the replication path. The online fallback only activates when the account-level local result is empty, when relation rows are missing, or when scored entries require cascade-aware visibility.
   - Alternative considered: always read the online view first. That would make the page less local-first and degrade offline behavior.

3. **Rename provider-facing scope language without changing runtime behavior.**
   - Rationale: myK9Show does not have license keys for normal account use; the old name hides that the value is a table-specific sync scope.
   - Alternative considered: defer naming cleanup. That leaves future maintainers likely to repeat the same diagnosis.

## Risks / Trade-offs

- **Extra online read when a user truly has no entries** -> Acceptable; it only happens for an empty local account result and prevents a higher-impact false empty state.
- **Offline users with an empty replica still see empty** -> Expected; without local or online data, there is no authoritative entry source. The page remains functional offline.
- **Residual `licenseKey` references in ringside code** -> Track as follow-up if needed; this change avoids broad contract churn around at-show passcode context.
