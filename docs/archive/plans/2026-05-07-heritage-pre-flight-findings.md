# Heritage Trial Pages — Pre-flight Findings

**Date:** 2026-05-07
**Source:** queries against the linked Supabase project + repo grep
**Companion to:** `2026-05-07-heritage-trial-pages-plan.md`

This document answers the 8 open questions from §3 / §12 / §13.16 of the plan, then lists three plan deltas the findings force.

---

## Answers

### Q1. Does a public trial-detail route already exist?

**Yes.** [`apps/myk9show/src/routes/publicRoutes.tsx`](apps/myk9show/src/routes/publicRoutes.tsx) registers two routes that resolve to `TrialDetailsPage`:

```tsx
<Route path="/shows/:showId/trials/:trialId" element={<TrialDetailsPage />} />
<Route path="/trials/:trialId" element={<TrialDetailsPage />} />
```

The flat `/trials/:trialId` is exactly the route the handoff suggests. **Decision:** branch *inside* `TrialDetailsPage` based on the trial's `landing_style` (recommended Option B in §6.1). No new route needed. This avoids splitting the public surface in two.

### Q2. Is there a `style` column on `shows` or `trials`?

**No.** Grep across `supabase/migrations/*.sql` returns zero matches for any `style` / `premium_style` / `landing_style` column on those tables.

A `PremiumStyle` *TypeScript* enum does exist in [`apps/myk9show/src/types/premium-types.ts`](apps/myk9show/src/types/premium-types.ts) — `'monogram' | 'banner' | 'headline' | 'magazine' | 'poster' | 'gazette' | 'fieldGuide' | 'heritage'` — and it's used on `ClubPremiumTemplate.style` and `GeneratedPremium.style`. **The premium PDF style is per-club-template, not per-trial.**

**Action:** Phase 0 must add `trials.landing_style text default 'default'` (migration NNN). Reuse the `PremiumStyle` enum values for consistency — Heritage trials get `'heritage'`. Trials default to `'default'`, which routes to the existing layout.

### Q3. What templating system does the email pipeline use?

**There are two patterns in this repo, and the plan must use the newer one.**

- **Newer (preferred):** [`packages/email/`](packages/email) — a workspace package using `@react-email/components` ^0.0.36 and `@react-email/render` ^1.0.5. Existing templates: `RegistrationConfirmation.tsx`, `ResetPassword.tsx`, `ConfirmEmail.tsx`. Shared primitives in `EmailLayout.tsx`, `EmailButton.tsx`. Has a vitest test suite.
- **Older (legacy, do not extend):** [`supabase/functions/send-registration-email/index.ts`](supabase/functions/send-registration-email/index.ts) hand-builds HTML in a `buildRegistrationEmailHtml(...)` function with template literals. **This is the "transactional receipt" the handoff explicitly calls out as out of scope.**

Sender: **Resend** (`RESEND_API_KEY` env var, `notifications@myk9show.com` from-address). `resend-webhook` function exists for bounce/complaint handling.

**Decision:** Phase 4 ships `packages/email/src/templates/HeritageConfirmation.tsx` next to the existing templates. Reuse `EmailLayout` if its constraints fit Heritage's table-only layout; otherwise build a parallel `HeritageEmailLayout` so we don't fight a layout meant for a different aesthetic.

`★ Insight ─────────────────────────────────────`
This finding changes Phase 4 the most. The plan called Phase 4 a 1.5-day effort that included setting up React Email and a new send function. **React Email is already plumbed**, including the test pattern and the Resend integration. Net effect: Phase 4 drops to ~1.0 day, but we inherit the constraint that the new template must coexist with the existing `EmailLayout` voice — verify that doesn't push us toward modifying shared primitives.
`─────────────────────────────────────────────────`

### Q4. Does the entry wizard already have a completion step?

**Yes — and the exhibitor flow already includes it.** [`RegistrationWorkflow.constants.tsx`](apps/myk9show/src/components/shows/RegistrationWorkflow/RegistrationWorkflow.constants.tsx) declares:

```ts
exhibitor: { steps: ['class-selection', 'payment', 'confirmation'], ... }
```

The `'confirmation'` step is the wizard's third step today, rendered via `WorkflowStepContent.tsx` based on `currentStepId`. **The plan was correct that we restyle the completion screen — but it's a re-skin of an existing step, not a new step.** No constants change required.

### Q5. Where does `confirmation_date` live, and is there a scheduled job?

**Neither exists.** No `confirmation_date` / `confirmation_at` / `draw_date` column on any table. No scheduled job sending confirmation emails today.

**Action:** Phase 0 also adds:
- `trials.confirmation_date timestamptz` — nullable; clubs that don't run a draw simply never trigger.
- `trials.timezone text default 'America/New_York'` — IANA name; required for the countdown + email date formatting.
- A new edge function `send-confirmation-email` (deploy `--no-verify-jwt`).
- A new `pg_cron` schedule (see Q6) to fire it daily.

### Q6. Is `pg_cron` enabled on the linked project?

**No.** Grep finds only a *comment* in `migrations/025_frontend_logs.sql` ("This is a comment-only reminder; enable pg_cron separately if desired"). No `create extension cron` statement in any migration; no `cron.schedule(...)` calls anywhere.

**Action:** Phase 0 migration enables the extension and registers the schedule:

```sql
-- Heritage Phase 0 migration (excerpt)
create extension if not exists pg_cron with schema extensions;

select cron.schedule(
  'heritage-confirmation-emails',
  '0 9 * * *',  -- daily 09:00 UTC
  $$ select net.http_post(
    url := current_setting('app.settings.confirmation_email_endpoint'),
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'))
  ); $$
);
```

**Risk:** enabling `pg_cron` is a project-level change. Confirm with the user before pushing — falls under `CLAUDE.md` Auto-Mode shared-system-writes guidance.

### Q7. What analytics provider does the app use?

**None.** `package.json` has zero matches for posthog / segment / mixpanel / amplitude / google-analytics / gtag / plausible.

**Action:** §13.13 (analytics events) drops from the plan. If the user wants conversion tracking later, that's a separate effort. Don't introduce an analytics provider as a side-effect of this work.

### Q8. CSP / Google Fonts — does the existing config allow the Heritage fonts?

**Yes, already.** [`apps/myk9show/vercel.json`](apps/myk9show/vercel.json) and [`apps/myk9show/src/config/security.ts`](apps/myk9show/src/config/security.ts) both contain:

```
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
```

[`apps/myk9show/index.html`](apps/myk9show/index.html) already preconnects to both Google Fonts hosts and loads `Fraunces`, `JetBrains Mono`, `Montserrat`. **Adding `EB Garamond` and `Cormorant Garamond` requires no CSP change** — only a single `<link>` extension in `index.html`.

**Recommendation:** to keep the bundle lean on non-Heritage trials, consider lazy-loading the two Heritage fonts on first render of `HeritageLandingPage` rather than adding them to `index.html`. The Google Fonts API supports concatenation but parses every `<link>` synchronously; loading two extra families globally hits every public visitor.

### Q9 (bonus). Is there a `react-helmet` or equivalent for `<head>` mutation?

**No matches.** No `react-helmet` / `HelmetProvider` / `<Helmet>` usage anywhere in `apps/myk9show/src`.

**Recommendation:** React 19 (already on the project — see `packages/email/package.json` peerDep `^19.1.0`) hoists `<title>`, `<meta>`, and `<link>` tags rendered inside any component into `<head>` natively. **Use the React 19 native pattern for the SEO patch (§13.5).** No new dependency.

---

## Plan deltas

These three deltas need to be applied to `2026-05-07-heritage-trial-pages-plan.md` before implementation starts:

### Delta 1 — Phase 2 routing strategy: Option B confirmed

§6.1 should commit to **Option B** (branch inside `TrialDetailsPage` on `trial.landing_style === 'heritage'`). No new route. Update the file to remove the Option A discussion.

### Delta 2 — Phase 0 migration scope expanded

The single migration in §4.4 was `add_trials_registry`. It now does five things in one file (or two files if we want to keep the cron change isolated). Migration `NNN_heritage_trial_pages.sql`:

1. `alter table public.trials add column registry_id text default 'AKC' not null;`
2. `alter table public.trials add column landing_style text default 'default' not null check (landing_style in ('default','heritage'));`
3. `alter table public.trials add column confirmation_date timestamptz;`
4. `alter table public.trials add column timezone text default 'America/New_York' not null;`
5. (Separate migration, shared-system flag) `create extension if not exists pg_cron;` + the cron job — push only after explicit confirmation.

Plus on `entries` (per §13.7):
- `entries.confirmation_email_sent_at timestamptz`
- `entries.confirmation_email_message_id text`
- `entries.confirmation_email_status text default 'pending' check (...)`

### Delta 3 — Phase 4 simplified

§8 should:
- Drop the React-Email-vs-MJML decision (React Email is the standard).
- Note that `packages/email/` is the destination, not a new function-local module.
- Note that the new send function (`send-confirmation-email`) is **net-new** and **distinct from** the existing `send-registration-email` (the transactional receipt the handoff said is out of scope).
- Reuse `RESEND_API_KEY`, `FROM_EMAIL` patterns from `send-registration-email/index.ts`.

### Delta 4 — Drop §13.13 (analytics)

No analytics provider is in use; do not introduce one. Remove or mark deferred.

### Delta 5 — Adjust §13.5 (SEO/OG)

Use React 19 native head-tag hoisting; do **not** add `react-helmet-async` as a dependency.

---

## Schema decisions to confirm with user

1. **`trials.landing_style` vs `shows.landing_style`** — the handoff says "the club's selected style" implying it could be at the club-template level (where `PremiumStyle` lives today). Trials feels right because exhibitors land per-trial, and a club could host trials of different sizes/seasons; but if the user wants per-club consistency, the column moves to `shows`.

2. **Default value of `landing_style`** — `'default'` is safe. If we want existing trials to opt in by club admins flipping a setting, that's the right starting point.

3. **`pg_cron` enablement** — touches the linked Supabase project; needs the user's go-ahead.

4. **`packages/email/` shared primitives** — reuse `EmailLayout` or build `HeritageEmailLayout`? Recommend the latter to keep the existing template's voice intact and to give Heritage its own table structure.

---

## Effort revision

The plan estimated 10.5 dev-days. After findings:

| Phase | Original | Revised | Delta reason |
| --- | --- | --- | --- |
| Pre-flight | 0.5 | **done** | this doc |
| 0 | 1.0 | 1.5 | extra columns + pg_cron |
| 1 | 1.0 | 1.0 | unchanged |
| 2 | 3.0 | 2.5 | route already exists |
| 3 | 2.0 | 2.0 | unchanged |
| 4 | 1.5 | 1.0 | React Email already plumbed |
| 5 | 0.5 | 0.5 | unchanged |
| QA | 1.0 | 1.0 | unchanged |
| Drop §13.13 | — | (-0.25) | analytics deferred |

**New total: ~9.25 dev-days.**

---

## Status

Ready to start Phase 0. Awaiting user confirmation on (a) `pg_cron` enablement and (b) `trials` vs `shows` for the `landing_style` column before pushing the migration.
