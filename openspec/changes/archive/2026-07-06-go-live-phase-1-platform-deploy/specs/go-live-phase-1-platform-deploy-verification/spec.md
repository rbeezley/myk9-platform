## ADDED Requirements

### Requirement: Phase 1 source verifier reports deploy pipeline readiness

The system SHALL provide a repeatable local verifier for Go Live Runbook Phase 1 source evidence. The verifier SHALL check that the production deploy workflow is CI-gated, constrained to successful `main` push CI runs, gated by `PRODUCTION_DEPLOY_ENABLED`, and wired to Vercel secrets without attempting a deploy.

#### Scenario: Deploy workflow source is staged

- **WHEN** the verifier runs against the repository
- **THEN** it reports the deploy workflow source as `ok` only when the expected workflow-run gate, branch gate, success gate, enable variable, Vercel secrets, and deploy command are present

### Requirement: Vercel auto-deploy disable remains gated

The verifier SHALL distinguish the current safe pre-disable state from the future gated state. If `apps/myk9show/vercel.json` does not yet set `git.deploymentEnabled.main=false`, the verifier SHALL report a warning that the config-as-code change is still gated by successful workflow validation.

#### Scenario: Git auto-deploy has not been disabled yet

- **WHEN** the Vercel config lacks `git.deploymentEnabled.main=false`
- **THEN** the verifier reports a warning, not Phase 1 completion

### Requirement: Kill-switch source defaults are verified locally

The verifier SHALL check that `showPresence`, `showLiveSync`, `showEditAwareness`, and `showConflictSurfacing` default to `true` in `apps/myk9show/src/config/features.ts`. Production Vercel environment values and flip rehearsals SHALL remain operator/shared-system gates.

#### Scenario: All source kill-switch defaults are true

- **WHEN** all four source flags are `true`
- **THEN** the verifier reports the source default check as `ok`

### Requirement: Auth email rate-limit procedure remains management-API based

The verifier SHALL check that the auth email runbook documents the Supabase Management API PATCH path with Resend SMTP fields and `rate_limit_email_sent: 100`, and warns against `supabase config push`.

#### Scenario: Auth rate-limit runbook is safe

- **WHEN** the runbook contains the required Management API, SMTP, rate-limit, and config-push warning text
- **THEN** the verifier reports the auth-email procedure source as `ok`

### Requirement: Tracking keeps operator gates open

The Go Live Runbook and OpsX tracker SHALL mark Phase 1 items complete only when source evidence plus operator/dashboard/API evidence prove completion. Repo-prepared work SHALL remain unchecked when secrets, repo variables, Management API PATCHes, production env proof, or flip rehearsals are still missing.

#### Scenario: Source verification is prepared but dashboard state is unknown

- **WHEN** the verifier passes locally but GitHub/Vercel/Supabase dashboard evidence is not recorded
- **THEN** Phase 1 runbook items remain unchecked and the tracker lists the exact remaining gates
