## Why

myK9Show currently uses Vercel's Production target for both the public `myk9show.com` domain and the pre-launch staging configuration. That makes “production” ambiguous and allows every successful `main` build to update the public site before an explicit staging acceptance decision. Separating staging from production supports fall 2026 launch readiness by making releases deliberate, testable, and easier to operate safely.

Requested outcome:

> “I do want a staging site (staging.myk9show.com) that we can first push to and test. Then if our changes are good push to production which would be the public site myk9show.com.”

## What Changes

- Upgrade the Vercel team from Hobby to Pro and create a custom `staging` environment for the existing myK9Show project.
- Make successful `main` CI runs deploy to `staging.myk9show.com`, not directly to the public production domain.
- Add an explicit, operator-triggered production promotion workflow that deploys a selected, already-staged `main` commit to `myk9show.com` only after staging acceptance.
- Create a separate production Supabase project; retain the current Supabase project as staging so test activity cannot alter public production data.
- Separate staging and production Vercel environment variables, Supabase credentials, Stripe configuration, auth URLs, Edge Functions, scheduled jobs, and operational evidence.
- Add source verification, focused workflow/config tests, smoke checks, rollback procedures, and environment labeling that make the active target unambiguous.
- Update deployment architecture, go-live runbooks, and tracking documentation.

This does not duplicate an existing product surface. It changes deployment infrastructure and operator workflow; a link between existing pages cannot provide environment or data isolation.

Non-goals:

- No new end-user page, dialog, or navigation surface.
- No application feature or show-day workflow changes.
- No production cutover until staging and production data-plane checks pass and the operator explicitly approves shared-system mutations.
- No automatic promotion from staging to production.

## Capabilities

### New Capabilities

- `staging-production-release-promotion`: Defines isolated staging and production environments, exact-commit staging deployment, explicit production promotion, evidence, and rollback requirements.

### Modified Capabilities

- `go-live-phase-1-platform-deploy-verification`: Extends source readiness verification from a single CI-gated production path to separate staging deployment and operator-approved production promotion paths.

## Impact

Tracking: [MYK9-21](https://linear.app/myk9-platform/issue/MYK9-21/separate-staging-and-production-deployment-environments)

- GitHub Actions workflows and repository environments.
- Vercel plan, custom environment, domains, aliases, environment variables, and deployment commands.
- Supabase project topology, migrations, Auth configuration, Edge Functions, secrets, Storage, Realtime, cron/scheduled jobs, and environment-specific URLs.
- Stripe test/live configuration and webhook destinations.
- Existing deployment verification scripts and tests.
- Deployment architecture and go-live operational documentation.
- Shared-system changes require explicit approval immediately before each Vercel, DNS, GitHub environment, Supabase, Stripe, or production mutation.
