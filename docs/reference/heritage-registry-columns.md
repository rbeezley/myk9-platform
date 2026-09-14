# Heritage / Registry Columns (migrations 192–193)

Schema reference extracted from `CLAUDE.md`. Always read these via the `@/features/registries` helpers, never raw column access.

- `shows.style` — one of the supported experience styles. Read via `getShowStyle(show)` from `@/features/registries`; it preserves the pre-migration `landing_style` fallback.
- `trials.registry_id` — sanctioning body (default `'AKC'`). Read via `getTrialRegistry(trial)`.
  **One registry per show** — see the rule below.
- `trials.confirmation_date` — when the Heritage confirmation email is sent. NULL = no formal step.
- `trials.timezone` — IANA name (default `'America/New_York'`). Read via `getTrialTimezone(trial)`.
- `entries.confirmation_email_sent_at / message_id / status` — idempotent send tracking (`'pending' | 'sent' | 'bounced' | 'failed'`).

## Domain rule: one sanctioning registry per show (MYK9-490)

Decided by Richard on 2026-09-14.

A single show may **not** carry trials from different sanctioning organizations. Several
**sports** under one organization are fine — an AKC show running AKC Scent Work alongside
AKC Obedience is an ordinary show. A cross-registry **cluster** (a club running AKC on
Saturday and UKC on Sunday) is **two shows**, not one.

### What a show's registry _is_

`trials.registry_id` is a denormalized projection of `shows.organization`: the trimmed
organization when it names a configured registry (`AKC` / `UKC` / `ASCA`), else `AKC`.
That projection predates the rule — it is what
`sync_trial_registry_from_show()` (migration `20260701120000`) has always applied — and it
is the single answer to "what registry is this show?". There is no second definition.

The derivation lives in exactly two places, kept deliberately in sync:

| Side   | Definition                                                     |
| ------ | -------------------------------------------------------------- |
| Client | `deriveRegistryId(organization)` in `@/features/registries`    |
| Server | `public.derive_registry_id(text)` (migration `20260915163500`) |

### How it is enforced

- **Database** — `trg_enforce_show_registry_on_trial` on `public.trials`
  (`BEFORE INSERT OR UPDATE OF registry_id, show_id`) refuses any trial whose
  `registry_id` disagrees with `derive_registry_id(shows.organization)`, raising
  **SQLSTATE `MK490`** with a message written for a secretary. A CHECK cannot express the
  rule: it spans rows.
  The trigger validates **new writes only** — it does not revalidate rows that already
  existed when it was installed.
- **Show-creation wizard** — the registry is never a per-trial input. It is derived once
  from the show's organization and stamped on every trial
  (`buildCreateShowPayload.ts`, `useShowCreationWizardActions.ts`), so a secretary cannot
  construct a mismatch and cannot reach `MK490` through the UI.
- **Changing a show's organization** re-registers every one of its trials through
  `sync_trial_registry_from_show()`, which writes exactly the value the guard derives.

### Seed fixtures

`Heartland Scent Work Classic` (`dededede-…010`) is AKC-only. The UKC and ASCA fixtures
that used to live inside it are their own shows under the same club —
`dededede-…011` (UKC Nosework) and `dededede-…012` (ASCA Scent Detection). See the seed
IDs table in `docs/qa/page-audit-2026-09-10.md` for which show to use for which case.
