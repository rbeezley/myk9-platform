## 1. Durable identity

- [x] 1.1 Add a validated, auth-user-scoped person-identity cache following the RBAC lifecycle seam; verify unit tests cover read/write, corruption, account switch, and sign-out cleanup.
- [x] 1.2 Hydrate `AuthContext` from cached person identity and refresh/clear it from authoritative profile results; verify a cold-offline provider test is red before and green after.

## 2. Entry-state integration

- [x] 2.1 Extend entry identity state so unresolved and confirmed-missing are distinct, and verify its focused state-table tests.
- [x] 2.2 Verify all four account-level entry consumers execute `getUserEntries` from durable identity on cold offline boot and do not render unresolved identity as “no entries.”

## 3. Verification and delivery

- [x] 3.1 Run focused auth/entry tests, app typecheck, one shuffled affected-suite run, and `pnpm qa:code-quality-ratchet` for any existing-file growth.
- [x] 3.2 Validate the OpenSpec change, complete adversarial review with at least two Luna lenses, and address every actionable finding.
- [ ] 3.3 Open the MYK9-601 PR with offline evidence and confirm required CI reaches a mergeable or clearly reported state; merge only with separate authorization.

## 4. Staging evidence

- [ ] 4.1 Record a cold-offline staging replay after deployment; keep the issue In Progress until the required stale-banner/no-money evidence is available.
