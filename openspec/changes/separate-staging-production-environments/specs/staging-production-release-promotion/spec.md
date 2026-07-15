## ADDED Requirements

### Requirement: Successful main CI deploys only to staging

The system SHALL deploy the exact commit validated by a successful `main` push CI run to the Vercel `staging` environment and SHALL NOT update `myk9show.com` as part of that automatic workflow.

#### Scenario: Main CI succeeds

- **WHEN** the complete CI workflow succeeds for a push commit on `main`
- **THEN** that exact commit is deployed to `staging.myk9show.com`
- **AND** the current production deployment remains unchanged

#### Scenario: Main CI fails or is cancelled

- **WHEN** the complete CI workflow does not succeed
- **THEN** neither staging nor production is deployed for that commit

### Requirement: Production release is explicit and exact-commit

The system SHALL release to production only through an operator-triggered workflow that identifies a full commit SHA, proves the SHA is reachable from `main`, proves successful main CI and a READY staging deployment for that SHA, and passes the protected GitHub production environment gate.

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

### Requirement: Staging and production have isolated service configuration

The system MUST use separate Vercel environment variables and separate Supabase projects for staging and production. Staging test traffic MUST NOT write to production Auth, database, Storage, Realtime, Edge Functions, Stripe, email, webhook, or scheduled-job resources.

#### Scenario: Staging build is created

- **WHEN** myK9Show is built for the Vercel `staging` environment
- **THEN** it uses `VITE_APP_ENVIRONMENT=staging`, the staging Supabase project, and non-production service credentials

#### Scenario: Production build is created

- **WHEN** myK9Show is built for Vercel Production
- **THEN** it uses `VITE_APP_ENVIRONMENT=production`, the production Supabase project, and production service credentials
- **AND** no staging-only credential or endpoint is present

### Requirement: Environment domains are unambiguous

The system SHALL serve staging at `staging.myk9show.com` and production at `myk9show.com`. Each domain SHALL resolve only to deployments from its corresponding Vercel environment.

#### Scenario: Operator opens staging

- **WHEN** the operator visits `staging.myk9show.com`
- **THEN** Vercel serves the latest accepted staging deployment and does not redirect to production

#### Scenario: Public user opens production

- **WHEN** a user visits `myk9show.com`
- **THEN** Vercel serves the last explicitly released production deployment

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
