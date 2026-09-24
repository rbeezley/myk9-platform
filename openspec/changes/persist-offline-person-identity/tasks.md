## 1. Durable identity

- [x] 1.1 Add a validated, auth-user-scoped person-identity cache following the RBAC lifecycle seam; verify unit tests cover read/write, corruption, account switch, and sign-out cleanup.
- [x] 1.2 Hydrate `AuthContext` from cached person identity and refresh/clear it from authoritative profile results; verify the provider restores it while the profile lookup is paused offline.

## 2. Entry-state integration

- [x] 2.1 Extend the shared entry read-state model and My Shows presentation so unresolved identity, confirmed missing identity, unconfirmed reads, known rows, and confirmed empty are distinct.
- [x] 2.2 Keep the four named `getUserEntries` consumers on the durable `useEntriesPersonId()` authority: `useHasAnyEntryForShow`, `useExhibitorUpcomingShows`, `useAccountEnteredShowIds`, and `useMyEntryBalanceSummary`.
- [x] 2.3 Add provider-level cold-offline coverage with a persisted session, paused profile lookup, durable `personId`, exactly four entry-read calls, and a no-cache unresolved case.

## 3. Verification and delivery

- [x] 3.1 Run focused auth/entry tests, app typecheck, a shuffled affected-suite run, and `pnpm qa:code-quality-ratchet` for any existing-file growth.
- [ ] 3.2 Run fresh adversarial Luna review against the narrowed final head and address every actionable finding.
- [ ] 3.3 Open the MYK9-601 PR with offline evidence and confirm required CI reaches a mergeable or clearly reported state; merge only with separate authorization.

## 4. Staging evidence

- [ ] 4.1 Record a cold-offline staging replay after deployment; keep the issue In Progress until the required stale-banner/no-money evidence is available.
