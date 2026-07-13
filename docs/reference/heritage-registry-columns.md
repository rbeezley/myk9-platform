# Heritage / Registry Columns (migrations 192–193)

Schema reference extracted from `CLAUDE.md`. Always read these via the `@/features/registries` helpers, never raw column access.

- `shows.landing_style` — `'default' | 'heritage'`. Read via `getShowLandingStyle(show)` from `@/features/registries`.
- `trials.registry_id` — sanctioning body (default `'AKC'`). Read via `getTrialRegistry(trial)`.
- `trials.confirmation_date` — when the Heritage confirmation email is sent. NULL = no formal step.
- `trials.timezone` — IANA name (default `'America/New_York'`). Read via `getTrialTimezone(trial)`.
- `entries.confirmation_email_sent_at / message_id / status` — idempotent send tracking (`'pending' | 'sent' | 'bounced' | 'failed'`).
