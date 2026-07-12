## ADDED Requirements

### Requirement: FORCE RLS is a continuously enforced invariant

Every repository-owned public table that enables Row Level Security SHALL eventually enable FORCE ROW LEVEL SECURITY. The repository SHALL provide a migration-state checker that derives the final state from migration source without relying on a static table allowlist, and deployment verification SHALL query `pg_class` for `relrowsecurity = true AND relforcerowsecurity = false`. Intentional exceptions MUST be named and justified.

#### Scenario: Existing five-table drift is remediated

- **WHEN** the remediation migration is applied
- **THEN** `secretary_tasks`, `club_premium_templates`, `premium_generations`, `unified_ringside_overrides`, and `login_attempts` have FORCE RLS enabled

#### Scenario: A future migration drifts

- **WHEN** a new public table enables RLS without eventually forcing it
- **THEN** the repository invariant test fails without adding the table to a static list

### Requirement: Advisor accounting is object-complete

The remediation SHALL save machine-readable before and after advisor exports and map every ERROR, WARN, and INFO entry to a fix, an extension-owned exclusion, or a documented exception. Function findings SHALL be keyed by schema plus identity-argument signature so overloads are distinct, and repository migrations SHALL NOT alter extension-owned objects.

#### Scenario: Advisor entry remains unclassified

- **WHEN** a repository-owned before-export entry has no matching fix or exception record
- **THEN** verification fails even if aggregate advisor counts decrease

#### Scenario: Overloaded functions are inventoried

- **WHEN** two functions share a name but have different identity arguments
- **THEN** each has its own privilege disposition and generated SQL target

### Requirement: Function execution grants are least privilege

Security-definer functions SHALL revoke inherited `PUBLIC` and direct `anon` execution unless an inventoried anonymous flow requires it, then restore only the exact roles and signatures required by verified call sites. Service-only and trigger-only functions SHALL not remain executable by client roles.

#### Scenario: Intentional anonymous RPC remains usable

- **WHEN** call-site and authorization evidence classifies an RPC as required by an anonymous flow
- **THEN** the exact signature retains only the grants required for that flow

#### Scenario: Internal RPC loses inherited execution

- **WHEN** an RPC is service-only or trigger-only
- **THEN** `PUBLIC` and `anon` cannot execute it after remediation

### Requirement: Advisor exceptions have narrow evidence

The two result views SHALL retain their release and role-visibility contracts unless an invoker-view plus narrowly granted security-definer function design passes the complete access matrix and representative query-plan comparison. The three no-policy INFO tables SHALL have no `anon` or `authenticated` table privileges, no client query call sites, and only their intended hardened service/function paths. Mutable search paths and public storage-listing warnings SHALL be changed only with source and live-use evidence.

#### Scenario: Results-view exception is retained

- **WHEN** the narrower design cannot preserve anon, account, passcode, owner/co-owner, official, release-state, stale-passcode, column, and performance behavior
- **THEN** the current view remains with a time-bounded exception and regression evidence

#### Scenario: Service-only no-policy table is dispositioned

- **WHEN** `login_attempts`, `show_money_locks`, or `show_passcodes` has no client grants or call sites and is reachable only by its intended hardened path
- **THEN** the INFO finding is documented without adding a permissive placeholder policy

#### Scenario: Public listing is unused

- **WHEN** repository and live-call evidence proves bucket listing is unused while object retrieval is required
- **THEN** public listing is removed without breaking public object retrieval
