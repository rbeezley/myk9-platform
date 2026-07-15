## ADDED Requirements

### Requirement: Successful main CI deploys only to staging

The system SHALL deploy the exact commit validated by a successful `main` push CI run to the Vercel `staging` environment and SHALL NOT update `myk9show.com` as part of that automatic workflow. The automatic workflow MUST NOT receive a Vercel access token capable of production deployment; it SHALL advance only the protected staging release ref consumed by Vercel Custom Environment branch tracking.

#### Scenario: Main CI succeeds

- **WHEN** the complete CI workflow succeeds for a push commit on `main`
- **THEN** that exact commit is deployed to `staging.myk9show.com`
- **AND** the current production deployment remains unchanged
- **AND** the automatic workflow has no Vercel production credential

#### Scenario: Successful main CI runs complete out of order

- **WHEN** an older staging deployment run finishes after a newer successful `main` CI run exists
- **THEN** the older run cannot update `staging.myk9show.com`
- **AND** only the newest successful `main` CI SHA is eligible to become shared staging

#### Scenario: Main CI fails or is cancelled

- **WHEN** the complete CI workflow does not succeed
- **THEN** neither staging nor production is deployed for that commit

### Requirement: Production release is explicit and exact-commit

The system SHALL release to production only through an operator-triggered workflow that identifies a full commit SHA, proves the SHA is reachable from `main`, proves successful main CI and a READY staging deployment for that SHA, and passes the protected GitHub production environment gate.

Git reachability and successful-CI validation MUST execute in a separate unprivileged preflight job that has no production environment or deployment secrets. The protected deployment job SHALL become eligible for secrets only after that preflight succeeds.

#### Scenario: Approved staged commit is released

- **WHEN** an operator selects an exact `main` commit with successful CI and READY staging evidence and the production environment gate is approved
- **THEN** the workflow deploys that exact source commit with production environment variables
- **AND** `myk9show.com` points to the resulting READY production deployment

#### Scenario: Commit lacks staging evidence

- **WHEN** production release is requested for a commit without a matching READY staging deployment
- **THEN** the workflow fails before invoking a production deployment

#### Scenario: Staging advanced after acceptance

- **WHEN** the accepted deployment ID or SHA no longer matches the deployment currently served by `staging.myk9show.com`
- **THEN** the workflow fails before invoking a production deployment
- **AND** requires new staging acceptance evidence

#### Scenario: Commit is not reachable from main

- **WHEN** production release is requested for a commit that is not reachable from `main`
- **THEN** the workflow fails before reading production secrets or deploying

#### Scenario: Unprivileged release preflight fails

- **WHEN** full-SHA format, main reachability, or successful-CI validation fails
- **THEN** the protected production deployment job does not start
- **AND** no production environment or deployment secret is made available to the failed preflight

### Requirement: Staging and production have isolated service configuration

The system MUST use separate Vercel environment variables and separate Supabase projects for staging and production. Staging test traffic MUST NOT write to production Auth, database, Storage, Realtime, Edge Functions, Stripe, email, webhook, or scheduled-job resources.

#### Scenario: Staging build is created

- **WHEN** myK9Show is built for the Vercel `staging` environment
- **THEN** it uses `VITE_APP_ENVIRONMENT=staging`, the staging Supabase project, and non-production service credentials

#### Scenario: Production build is created

- **WHEN** myK9Show is built for Vercel Production
- **THEN** it uses `VITE_APP_ENVIRONMENT=production`, the production Supabase project, and production service credentials
- **AND** no staging-only credential or endpoint is present

#### Scenario: Production deployment credential is requested

- **WHEN** any automatic staging, preview, or guides workflow runs
- **THEN** the team-scoped Vercel production token is unavailable
- **AND** that token is available only to the approval-protected production release job

### Requirement: Environment domains are unambiguous

The system SHALL serve staging at `staging.myk9show.com` and production at `myk9show.com`. Each domain SHALL resolve only to deployments from its corresponding Vercel environment.

#### Scenario: Operator opens staging

- **WHEN** the operator visits `staging.myk9show.com`
- **THEN** Vercel serves the latest accepted staging deployment and does not redirect to production

#### Scenario: Public user opens production

- **WHEN** a user visits `myk9show.com`
- **THEN** Vercel serves the last explicitly released production deployment

### Requirement: Production data refreshes into staging are selective and one-way

The system SHALL support an operator-approved, on-demand production-to-staging refresh that preserves troubleshooting-relevant identifiers or mappings, relationships, timestamps, configuration, and workflow state while replacing or removing personal contact data, production authentication material, payment-sensitive values, private message content, secrets, and passcodes. The refresh MUST fail closed for unclassified tables, columns, or schema drift; MUST sanitize and validate in an isolated scratch destination before staging import; and MUST NOT continuously synchronize environments or permit staging-to-production writes.

#### Scenario: Operator prepares realistic staging data

- **WHEN** an approved operator refreshes staging from a production snapshot
- **THEN** club, show, trial, class, entry, result, payment-status, timestamp, relationship, permission, and edge-case state needed for troubleshooting remains reproducible
- **AND** direct identifiers, contact details, credentials, sessions, sensitive payment values, private message content, secrets, and passcodes are sanitized according to the versioned masking manifest
- **AND** production Auth identities are replaced with designated staging test accounts
- **AND** staging outbound email, SMS, push, Stripe live mode, webhooks, cron, and other external side effects remain disabled or redirected to test sinks

#### Scenario: Staging refresh completes

- **WHEN** sanitization and import finish
- **THEN** referential integrity and representative troubleshooting queries pass
- **AND** the evidence records source snapshot time and sanitization version without exposing sensitive values
- **AND** no staging mutation can flow back to production

#### Scenario: Production schema contains an unclassified field

- **WHEN** the snapshot includes a table or column absent from the versioned masking manifest
- **THEN** sanitization fails before any import into shared staging
- **AND** the operator must classify the field, update tests, and obtain refresh approval again

#### Scenario: Sanitized export retains prohibited data

- **WHEN** residual-data scanning finds a prohibited identifier, credential, contact value, payment-sensitive value, secret, or passcode
- **THEN** the export is rejected and deleted from the scratch destination
- **AND** no raw or rejected production snapshot is restored directly into shared staging

#### Scenario: Sanitization blocks a specific investigation

- **WHEN** a club or exhibitor issue cannot be reproduced from the standard sanitized dataset
- **THEN** the operator may use a separately approved, access-restricted support-case copy containing only the minimum required records
- **AND** outbound side effects remain suppressed, access is logged, and the exceptional dataset is deleted when the investigation closes

### Requirement: Staging is not a production backup

The system MUST use production backup and restore facilities independently of staging. The initial recovery policy SHALL provide an RPO of 24 hours or less, an RTO of 8 hours or less, at least 7 days of recoverable history, an accountable owner, and a successful isolated restore drill before launch and at least quarterly thereafter. A staging refresh SHALL be treated as disposable testing data and SHALL NOT satisfy backup, retention, or disaster-recovery requirements.

#### Scenario: Production recovery is evaluated

- **WHEN** backup or recovery readiness is assessed
- **THEN** evidence comes from production backups or point-in-time recovery and a restore test
- **AND** the existence of staging data is not counted as recovery evidence

### Requirement: Development, preview, staging, and production remain distinct

The system SHALL treat local development, per-branch Preview deployments, shared staging, and public production as separate release contexts. Preview or local verification MUST NOT satisfy the shared staging acceptance requirement.

#### Scenario: Pull request is updated

- **WHEN** a non-main pull request branch is pushed
- **THEN** Vercel may create an isolated Preview deployment
- **AND** neither `staging.myk9show.com` nor `myk9show.com` changes

#### Scenario: Developer runs locally

- **WHEN** myK9Show runs on localhost with development configuration
- **THEN** that run is labeled development and is not recorded as staging acceptance evidence

### Requirement: Shared staging is protected from unintended public access

The system SHALL restrict `staging.myk9show.com` to intended testers using available Vercel protection and SHALL instruct search engines not to index staging content.

#### Scenario: Unauthorized visitor opens staging

- **WHEN** a visitor without authorized staging access requests `staging.myk9show.com`
- **THEN** the visitor cannot access staging application or test data

#### Scenario: Search crawler requests staging

- **WHEN** staging content is served to an authorized request or crawler-compatible response
- **THEN** the response includes an effective `noindex` directive

### Requirement: Release evidence and rollback are recorded

Every staging deployment and production release SHALL record the exact commit SHA, deployment URL/ID, status, trigger, and verification result. A production release SHALL also record the previous production deployment as the rollback target.

#### Scenario: Production verification fails

- **WHEN** post-release production verification detects a blocking failure
- **THEN** the operator can restore the recorded prior Vercel production deployment
- **AND** further production releases remain disabled until the incident is resolved

### Requirement: Offline-first clients remain environment-bound

The existing replication-backed show-day data paths SHALL remain unchanged, and an installed client MUST synchronize only with the Supabase project configured for the environment that built it.

#### Scenario: Staging client reconnects

- **WHEN** an offline staging client reconnects and flushes queued mutations
- **THEN** those mutations are sent only to the staging Supabase project
- **AND** no production data is changed

### Requirement: Shared-system mutations remain approval-gated

The implementation SHALL require explicit operator approval immediately before Vercel plan/domain/environment changes, GitHub environment protection changes, DNS writes, Supabase project/config/function writes, Stripe changes, or production releases.

#### Scenario: Repository preparation is complete

- **WHEN** workflow source, tests, and runbooks are ready but an external mutation has not been approved
- **THEN** the corresponding task remains incomplete and records the exact approval-gated action
