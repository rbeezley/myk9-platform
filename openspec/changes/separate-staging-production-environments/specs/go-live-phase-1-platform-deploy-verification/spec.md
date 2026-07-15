## MODIFIED Requirements

### Requirement: Phase 1 source verifier reports deploy pipeline readiness

The system SHALL provide a repeatable local verifier for Go Live Runbook Phase 1 source evidence. The verifier SHALL check that successful `main` CI runs deploy the exact validated SHA to the Vercel `staging` environment, that production release is operator-triggered and exact-SHA constrained, that both workflows use the required Vercel credentials and enable gates, and that source verification does not attempt a deploy.

#### Scenario: Staging and production workflow source is ready

- **WHEN** the verifier runs against the repository
- **THEN** it reports deploy workflow source as `ok` only when the successful-CI gate, `main` branch gate, exact-SHA checkout, staging target, production dispatch, staging-evidence precondition, protected production environment, enable variables, Vercel secrets, and deployment commands are present

### Requirement: Vercel auto-deploy disable remains gated

The verifier SHALL require `apps/myk9show/vercel.json` to disable Git-triggered deployment from `main`, because staging and production are deployed only through the repository workflows. A missing or invalid guard SHALL fail source verification.

#### Scenario: Git auto-deploy guard is missing

- **WHEN** the app Vercel config lacks `git.deploymentEnabled.main=false`
- **THEN** the verifier reports a failure and Phase 1 deployment readiness is incomplete

### Requirement: Kill-switch source defaults are verified locally

The verifier SHALL check that `showPresence`, `showLiveSync`, `showEditAwareness`, and `showConflictSurfacing` default to `true` in `apps/myk9show/src/config/features.ts`. Staging and production Vercel environment values and flip rehearsals SHALL remain operator/shared-system gates.

#### Scenario: All source kill-switch defaults are true

- **WHEN** all four source flags are `true`
- **THEN** the verifier reports the source default check as `ok`

### Requirement: Auth email rate-limit procedure remains management-API based

The verifier SHALL check that the auth email runbook documents the Supabase Management API PATCH path with Resend SMTP fields and `rate_limit_email_sent: 100`, and warns against `supabase config push`. The runbook SHALL distinguish staging and production Supabase project configuration and evidence.

#### Scenario: Auth rate-limit runbook is safe

- **WHEN** the runbook contains the required Management API, SMTP, rate-limit, config-push warning, and environment-specific project text
- **THEN** the verifier reports the auth-email procedure source as `ok`

### Requirement: Tracking keeps operator gates open

The Go Live Runbook, OpenSpec tasks, and tracking documents SHALL mark environment-separation items complete only when repository evidence plus Vercel, GitHub, DNS, Supabase, Stripe, and live smoke evidence prove completion. Repo-prepared work SHALL remain unchecked when any external configuration, isolation proof, promotion rehearsal, or rollback evidence is missing.

#### Scenario: Source verification is ready but external state is unknown

- **WHEN** the verifier passes locally but environment and data-plane evidence is not recorded
- **THEN** environment-separation tasks remain incomplete and the tracker lists the exact remaining approval gates
