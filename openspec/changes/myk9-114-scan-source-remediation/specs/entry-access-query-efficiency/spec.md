## ADDED Requirements

### Requirement: Statement-scoped entry access context

The system SHALL evaluate the current caller's active role scopes, judge
assignments, steward scopes, and ringside-passcode generation state once per
`view_authenticated_entry_results` statement and reuse that context across all
projected access-controlled fields.

#### Scenario: Full entry projection reuses authorization inputs

- **WHEN** an authenticated caller selects the full entry-results projection
- **THEN** the plan reads `user_roles`, `judge_assignments`, and
  `show_passcodes` through one explicitly materialized caller context rather
  than copied per-field authorization subplans

#### Scenario: Scoped replication read keeps predicate pushdown

- **WHEN** entry replication filters the view by show, class, or `updated_at`
  watermark
- **THEN** only the one-row caller context is materialized and the entry
  predicates remain eligible for pushdown

### Requirement: Entry access behavior is preserved

The optimized view SHALL return the same rows and protected field values as the
pre-change view for every supported caller tier.

#### Scenario: Manager access

- **WHEN** a site admin or an active secretary, trial secretary, or club admin
  reads entries for a show within their current scope
- **THEN** the view exposes the same manager-visible fields as before

#### Scenario: Assigned judge access

- **WHEN** an authenticated judge has a confirmed or invited assignment for an
  entry's class
- **THEN** the view exposes the same judge-visible scoring fields as before

#### Scenario: Steward access

- **WHEN** an active steward role matches the entry's show or its club scope
- **THEN** the view preserves the existing ringside visibility without granting
  manager-only fields

#### Scenario: Exhibitor and owner access

- **WHEN** an exhibitor is the handler, owner, co-owner, or has another active
  entry in the show
- **THEN** the view preserves the existing own-entry, queue, and released-result
  visibility rules

#### Scenario: Current ringside passcode claim

- **WHEN** a forge-proof ringside claim matches the entry's show and role and
  its generation matches the live passcode row
- **THEN** the view preserves the existing claim-based visibility for that role

#### Scenario: Revoked ringside passcode claim

- **WHEN** a ringside claim is missing its generation or its generation no
  longer matches the live passcode row
- **THEN** the view fails closed exactly as before

#### Scenario: Authenticated caller has no person or role rows

- **WHEN** an authenticated anonymous ringside caller has no matching person,
  role, steward, or judge-assignment rows
- **THEN** the caller context returns empty scopes without an error and grants
  only visibility supported by a current forge-proof passcode claim

#### Scenario: Role expires during later statements

- **WHEN** a role is inactive or expired before a new entry-results statement
  starts
- **THEN** the new statement excludes that role from the materialized context
  and does not reuse authorization state from an earlier statement

#### Scenario: Passcode regenerates between statements

- **WHEN** a passcode is regenerated after one entry-results statement
  completes
- **THEN** the next statement recomputes generation currency and fails the stale
  claim closed

### Requirement: Offline entry replication contract remains stable

The system SHALL preserve the entry-results view schema, grants, security
boundary, and synchronization watermark used by offline-first show-day reads.

#### Scenario: Existing replication consumer syncs unchanged

- **WHEN** `ReplicatedEntriesTable` performs a full or incremental sync
- **THEN** it reads the same view columns and `updated_at` watermark without a
  new direct-table fallback or application migration

#### Scenario: View privileges remain narrow

- **WHEN** the migration recreates the security-definer view and its internal
  helper
- **THEN** authenticated and service-role view access remains unchanged while
  the helper remains outside exposed API schemas and direct API-role invocation
  is denied

#### Scenario: Generated database types remain synchronized

- **WHEN** the private-schema internal helper is added to the migrated local
  database
- **THEN** the canonical public-schema Supabase database types remain unchanged
  and package/app typechecks pass without hand-edited re-export files

### Requirement: Scan remediation has attributable evidence

The change SHALL record the source and disposition of each MYK9-114 relation and
SHALL measure post-deployment scan behavior in a statistics window with a known
reset time.

#### Scenario: Pre-deployment evidence

- **WHEN** the implementation is prepared for review
- **THEN** the repository records the current reset timestamps, relation sizes,
  representative plan, per-read scan delta, and the secondary RBAC/embed sources

#### Scenario: Deterministic per-read bound

- **WHEN** one representative full-row account or valid-ringside read executes
  in an isolated database after a separate-session statistics reset
- **THEN** each hot authorization relation is read no more than a constant
  two times regardless of the number of projected protected fields

#### Scenario: Linked evidence collection is non-destructive by default

- **WHEN** the diagnostic runs against the linked database without a separate
  statistics-reset approval
- **THEN** it snapshots counters and plans without invoking any reset function

#### Scenario: Approved post-reset measurement

- **WHEN** the migration is deployed and statistics reset is explicitly
  approved
- **THEN** representative account and ringside reads are replayed and the new
  `user_roles`, `judge_assignments`, and `show_passcodes` scan counts and ratios
  are recorded against that known window

#### Scenario: Load-rehearsal handoff

- **WHEN** deterministic scan amplification is removed
- **THEN** the measurement query and remaining direct-embed caveat are provided
  to MYK9-109 for its realistic 50-plus-device rehearsal
