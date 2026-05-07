# Heritage Trial Pages — Implementation Plan

**Source handoff:** `docs/design_handoff_heritage/`
**Status:** Draft, 2026-05-07
**Owner:** TBD
**Anchor for North Star:** Phase 2 / Exhibitor golden path (the landing page + wizard completion are the exhibitor's first formal touchpoints).

## 1. Goals

Recreate the four Heritage-style touchpoints in `apps/myk9show` using real data, real components, and a registry-config layer that supports AKC today but extends to UKC/ASCA later:

1. **Heritage Landing Page** — public trial-detail page, rendered when a trial's `style = "heritage"`.
2. **Heritage Entry Blank** — printable PDF (US Letter, single page), two modes: blank-from-trial and pre-filled-from-entry.
3. **Heritage Confirmation Email** — transactional email sent on the trial's confirmation date.
4. **Wizard Completion Screen Restyle** — final step of the existing entry wizard re-rendered in Heritage style with a "Print my entry blank" CTA.

The Heritage **Premium PDF** is already shipped (Style 8 in `features/premium/pdf/covers/EngravedCover.tsx`). This plan deliberately *reuses* its design tokens and visual primitives.

## 2. Out of scope

- Premium PDF (already shipped).
- Entry wizard's data-collection steps (steps 1..N-1 are unchanged — only the completion screen is restyled).
- The short transactional online-receipt email (existing wizard template stays).
- Other 7 styles' landing/entry/email packets.
- UKC/ASCA/CKC concrete data (registry config layer ships, only AKC populated).

## 3. Pre-flight audit (do this before writing code)

A. **Inventory the trial → registry path** in a single query batch (per `CLAUDE.md` debugging guidance):
   - `shows`, `trials`, `trial_classes` schemas — find existing columns for sanctioning body, sport, style.
   - `shows.style` (or equivalent) — confirm the Heritage style flag is already on the row (handoff assumes yes; verify).
   - Confirm where exhibitor agreement, license language, and class structure are currently sourced (`AKCScentWorkEntryForm.tsx` has the canonical constants — extract those rather than re-paste from PDFs).

B. **Locate the existing public trial-detail route.** `ShowDetailsPage.tsx` is the show-level page; trial-level public landing may not exist yet. Either (a) add a route at `/trials/:trialId`, or (b) render the Heritage layout inside `ShowDetailsPage` when `show.style === 'heritage'`. Decide before Phase 2.

C. **Confirm the email pipeline.** `supabase/functions/send-registration-email/` exists, plus `send-email`, `resend-webhook` — identify which provider sends transactional mail today and what templating system it uses (raw HTML, MJML, React Email, etc.).

D. **Confirm where the entry wizard's "submit" handler lives** so the completion screen has a hook point. Likely `pages/RegistrationWizardPage.tsx` or `components/shows/RegistrationWorkflow/`.

Output: a 1-page `docs/plans/2026-05-07-heritage-pre-flight-findings.md` with answers to A–D and any schema gaps that need a migration.

`★ Insight ─────────────────────────────────────`
The CLAUDE.md "Debugging seed-data / config bugs" rule applies to *any* config rework, not just bug-fixes: survey every related table once, before writing migrations. We've burned cycles before by writing one migration, pushing, then finding a second missing config row.
`─────────────────────────────────────────────────`

---

## 4. Phase 0 — Registry config layer (AKC populated)

**Why first:** every subsequent artifact reads license language, class structure, agreement text, and dog-field schema from this layer. Building it last would mean re-threading three artifacts.

### 4.1 Module shape
Create `apps/myk9show/src/features/registries/` with:

```
registries/
  index.ts                    # public API: getRegistry(id), listRegistries()
  types.ts                    # Registry, RegistrySport, RegistryDogFields
  registries.ts               # const registries = { AKC: {...} }
  akc.ts                      # AKC config (extracted from AKCScentWorkEntryForm.tsx)
  __tests__/
    registries.test.ts        # shape/coverage tests
    akc.test.ts               # snapshot the agreement text
```

Schema mirrors the scoping doc:

```ts
export interface Registry {
  id: 'AKC';                               // union expands as new registries land
  name: string;
  shortName: string;
  licenseLanguage: string;                 // "An A.K.C. Licensed Trial"
  memberClubLanguage: string;              // "A member club of the American Kennel Club"
  exhibitorAgreement: string;              // 300-word block, paragraphs joined with \n\n
  registrationField: { label: string; pattern?: RegExp };
  sports: Record<string, RegistrySport>;
  dogFields: RegistryDogFields;
}
```

### 4.2 Extract AKC content
- `licenseLanguage`, `memberClubLanguage` — string constants in `akc.ts`.
- `exhibitorAgreement` — concatenate `AKC_AGREEMENT_TEXT`, `AKC_AGREEMENT_TEXT_2`, `AKC_ARBITRATION_TEXT` from `AKCScentWorkEntryForm.tsx` into one source of truth, then `import` it from both old and new call-sites. **Don't fork the legal text.**
- `sports['scent-work']` — pull `AKC_SCENT_WORK_LEVELS`, `AKC_SCENT_WORK_ELEMENTS`, `ELEMENT_COLUMN_HEADERS` from `lib/reports/entryFormTypes.ts`.
- `dogFields` — derive from `AKCScentWorkEntryForm` field list.

### 4.3 Migration of existing references
Single PR that:
1. Adds the new registry module + tests.
2. Updates `AKCScentWorkEntryForm.tsx` and any premium PDF Heritage components to read from `getRegistry('AKC')` instead of inline constants.
3. **No visual change.** Diff in browser + premium PDF snapshot tests stay green.

### 4.4 Schema additions — UPDATED 2026-05-07 from pre-flight

Single migration `NNN_heritage_trial_pages.sql` adds five columns. Column placement is intentional: per-show vs per-trial mirrors the conceptual scope of each field (see pre-flight findings doc for the rationale).

**On `shows`:**
- `shows.landing_style text default 'default' not null check (landing_style in ('default','heritage'))` — visual brand applied to the whole event, mirrors how `ClubPremiumTemplate.style` works today. **Decision confirmed by user 2026-05-07: Option B (per-show), not per-trial.**

**On `trials`:**
- `trials.registry_id text default 'AKC' not null` — per-trial because dual-sanctioned events (AKC + UKC) exist.
- `trials.confirmation_date timestamptz` — nullable; not all trials run a draw.
- `trials.timezone text default 'America/New_York' not null` — IANA name; per-trial because regional caravan events can span timezones.

**On `entries`** (per §13.7 — idempotent confirmation email):
- `entries.confirmation_email_sent_at timestamptz`
- `entries.confirmation_email_message_id text`
- `entries.confirmation_email_status text default 'pending' not null check (status in ('pending','sent','bounced','failed'))`

Helpers added:
- `useShowLandingStyle(show)` returning `'default' | 'heritage'`
- `useTrialRegistry(trial)` returning `Registry`
- `useTrialTimezone(trial)` returning IANA string (defaults applied)

`pg_cron` enablement and the cron job for `send-confirmation-email` ship in a **separate** migration (`NNN+1_heritage_cron.sql`) so the schema change can land independently and the cron change is reviewed as its own shared-system write. **Awaiting user confirmation before pushing the cron migration** — see §10.4.

Document each new column in `CLAUDE.md`'s database section (one line each).

### 4.5 Tests
- `registries.test.ts` — `getRegistry('AKC')` returns a non-empty `exhibitorAgreement`, has `scent-work` sport with 4 levels and 4 elements.
- Snapshot test on the agreement text so legal copy can't be silently mutated.

**Phase 0 exit:** existing premium PDF snapshot tests pass; `getRegistry` is the only place AKC strings live.

---

## 5. Phase 1 — Heritage design tokens + shared primitives

**Why before artifacts:** all four artifacts share typography, color, and ornaments. Define once, reuse three times.

### 5.1 Tokens
Re-use what `features/premium/pdf/pdfTokens.ts` already exports for Heritage where possible (paper, ink, claret, gold, quill). For web/email use, mirror them in:

```
features/heritage/
  tokens.ts                   # color + spacing constants
  fonts.ts                    # Google Fonts <link> string + font-family stacks
  index.ts                    # public exports
```

Tailwind: extend `tailwind.config.js` with a `heritage` namespace (`heritage-paper`, `heritage-ink`, etc.) — do **not** overwrite app-wide colors.

### 5.2 Shared web primitives (landing page + wizard completion)
React components in `features/heritage/components/`:
- `<HeritageOrnamentRule variant="ink" | "gold" />` — line + ✦ + line, with `IntersectionObserver` reveal.
- `<HeritageSectionFolio numeral="I" />` — `§ I` italic claret, `nowrap`, `min-width: 32px` (the bug-fix from the handoff).
- `<HeritageEngravedFrame />` — double-border + corner-dot wrapper.
- `<HeritageHeading level={1|2|3} italic>` — Cormorant Garamond display.
- `useReducedMotion()` hook — short, single-source-of-truth wrapper around `prefers-reduced-motion` so every animation respects it.

CSS lives in `features/heritage/heritage.css` (port from the handoff CSS, scoped via `[data-heritage]` ancestor selector to avoid leaking).

### 5.3 Shared PDF primitives (entry blank)
In `features/premium/pdf/heritage/` (sit next to the existing Heritage cover):
- `EngravedFrame`, `OrnamentRule`, `SectionFolio` — `@react-pdf` versions of the web primitives, using the same tokens.

### 5.4 Tests
- Unit tests for `HeritageOrnamentRule` (renders with default + `gold` variant), `HeritageSectionFolio` (matches `§ I` and applies `nowrap`).
- `useReducedMotion` test against a mocked `matchMedia`.

**Phase 1 exit:** Storybook page (or test fixture) renders all primitives; tokens are the *only* source of Heritage colors.

---

## 6. Phase 2 — Heritage Landing Page

### 6.1 Route decision — RESOLVED 2026-05-07

**Decision: Option B (branch inside existing page).** Pre-flight confirmed `/trials/:trialId` already routes to `TrialDetailsPage`. The Heritage layout is rendered when `show.landing_style === 'heritage'` (column lives on `shows`, not `trials` — see §4.4). `TrialDetailsPage` already loads the parent show via `useFastShowDetails`, so the branch is a one-line check at the top of the render.

```tsx
const { show, trial } = useFastShowDetails(showId, trialId);
if (show?.landing_style === 'heritage') return <HeritageLandingPage show={show} trial={trial} />;
return <DefaultTrialLayout {...} />;
```

No new route registration required.

### 6.2 Component layout
Mirror the handoff section list one-for-one. Each section is its own component; the page is a thin shell so each section can be tested in isolation.

```
features/heritage/landing/
  HeritageLandingPage.tsx          # composition only
  StickyNav.tsx
  HeroBlock.tsx
  CountdownBlock.tsx               # uses requestAnimationFrame, not setInterval
  WelcomeSection.tsx
  JudgesSection.tsx
  ParticularsSection.tsx           # reads registry licenseLanguage
  RosterSection.tsx                # capacity bar + journey timeline
  PlanSection.tsx
  OnTheDaySection.tsx
  OfficersSection.tsx
  FinalCtaBand.tsx
  HeritageFooter.tsx
  __tests__/
    *.test.tsx
```

### 6.3 Data wiring
- Trial particulars → existing `useFastShowDetails` / `useShowsQuery` (verify in pre-flight).
- Roster count (`137 / 360`) → `useEntriesByShowQuery` aggregated.
- Journey timeline steps → derive from trial dates (open, close, draw, confirmation, trial start, trial end).
- Judges → `ShowJudgeAssignment[]` already in store.
- Officers → `useOfficersByShowQuery` (verify exists; otherwise small new hook).

### 6.4 Animations
- Single `IntersectionObserver` instance shared by `useRevealOnScroll(ref)` hook (don't spawn one per section).
- Countdown: `useCountdown(targetDate)` hook, `requestAnimationFrame`-driven, swaps text only when a digit *changes* (handoff behavior).
- All animations gated by `useReducedMotion()`.

### 6.5 Interactions
- Smooth-scroll on section anchors (`scrollIntoView({ behavior: 'smooth' })`, downgraded to `auto` under reduced-motion).
- Active-section tracking: `IntersectionObserver` on each `<section>`; the entry with the highest `intersectionRatio` is "active".
- Share button: `navigator.clipboard.writeText(window.location.href)` → 1.8s toast (use existing toast system, don't ship a new one).

### 6.6 Tests
- Render the page with a fixture trial; assert each section is present with registry-sourced strings.
- `useCountdown` unit test with fake timers.
- A11y: `axe` scan on the rendered page.
- E2E (Playwright): visit `/trials/:id`, scroll, see capacity bar fills, click "Submit Entry", lands on wizard.

**Phase 2 exit:** can replace a real trial's link with the Heritage route in staging and walk it on `localhost:5173`.

---

## 7. Phase 3 — Heritage Entry Blank (PDF)

### 7.1 Renderer
Use `@react-pdf/renderer` (same stack as premium). One-page US Letter portrait. Pixel-pad against the prototype HTML; the visual reference is the source of truth.

```
features/heritage/entry-blank/
  HeritageEntryBlankDocument.tsx   # @react-pdf <Document>
  sections/
    EntryBlankHeader.tsx
    DogParticularsSection.tsx
    ClassesEnteredSection.tsx
    OwnerHandlerSection.tsx
    FeesSection.tsx
    AgreementSection.tsx           # reads registry.exhibitorAgreement
    MailToPanel.tsx
  buildEntryBlankProps.ts          # trial → blank props (also pre-filled mode)
  generateEntryBlank.ts            # render to Blob + download
  __tests__/*
```

### 7.2 Two modes
- **Blank** — only the trial's club, judges, dates, fees populate; entrant fields are empty dotted-underlines.
- **Pre-filled** — given an `Entry` row, fill dog particulars, class checkboxes (✕ in claret), owner/handler, fees, payment method.

`buildEntryBlankProps(trial, entry?)` returns a single typed `EntryBlankProps`; the document doesn't branch internally. Keeps test coverage simple.

### 7.3 Where it appears
- Landing page §V "Plan Your Sojourn" or §VIII final CTA — "Download Entry Blank" button → renders blank mode.
- Wizard completion screen — "Print my entry blank" button → pre-filled mode.

### 7.4 Print/page rules
- Engraved double-border via `@react-pdf` `<View style={{ border, padding }}>` nesting; corner dots are absolutely-positioned `<View>` with `borderRadius: 4`.
- Section folio `<Text>` — apply equivalent of `nowrap`/min-width via fixed-width column.

### 7.5 Tests
- Render with fixture → snapshot the structure (text in expected order).
- `buildEntryBlankProps`: blank mode leaves user fields empty; pre-filled mode populates from `Entry`.
- A11y is N/A for PDF, but a "tab order on print" mental check belongs in PR review.

**Phase 3 exit:** download blank from landing page, hand-fill, scan, mail. Download pre-filled from wizard completion. Both look correct on print and on screen.

---

## 8. Phase 4 — Heritage Confirmation Email

### 8.1 Constraints (recap)
- Tables, inline styles, 600px width, no flexbox/grid, no web font in body.
- Georgia / serif fallback for clients that strip EB Garamond / Cormorant.
- Image-free.
- Preserve the `<div>` line-trick inside ornament rules (handoff calls this out as a critical bug-fix).

### 8.2 Templating choice
Two viable paths:
- **A. React Email** (`@react-email/components`) → render to HTML at send time. Type-safe, testable, plays well with existing TS pipeline.
- **B. Hand-authored MJML** → compile once, ship `.html` to the function.

Recommend **A** unless the email pipeline already standardized on MJML. Confirm in pre-flight.

### 8.3 Module
```
features/heritage/email/
  HeritageConfirmationEmail.tsx     # React Email component
  buildConfirmationProps.ts         # entry + trial → email props
  renderToHtml.ts                   # wraps @react-email/render
  __tests__/HeritageConfirmationEmail.test.tsx   # snapshot HTML, lint inline styles
```

### 8.4 Send-time integration
- Add (or update) `supabase/functions/send-confirmation-email/index.ts` (deploy `--no-verify-jwt`, per `CLAUDE.md`).
- Trigger: a scheduled job on the trial's `confirmation_date` iterates entries and sends.
- Personalization fields exactly as listed in the handoff.

### 8.5 Tests
- Snapshot the rendered HTML; assert `<table>` is the outermost layout element, no `<flex>` / `display: grid`, web fonts only in `<head>`.
- Render under "Outlook approximation" by stripping `<head>` styles → assert layout still parseable.
- Smoke test the function against a single fake entry in staging; visually inspect in Gmail + Outlook web.

**Phase 4 exit:** confirmation email renders correctly in Gmail web, Apple Mail, Outlook web, and at minimum doesn't blow up in Outlook desktop (table layout intact).

---

## 9. Phase 5 — Wizard completion screen restyle

### 9.1 Touch points
- `pages/RegistrationWizardPage.tsx` (or equivalent) — last step swaps to `<HeritageEntryReceived />`.
- Keep all earlier steps unchanged.

### 9.2 Component
```
features/heritage/wizard/
  HeritageEntryReceived.tsx
  __tests__/HeritageEntryReceived.test.tsx
```

Mirrors the confirmation-email layout (header → entry detail card → CTAs → caption) so the exhibitor sees one identity from entry → confirmation.

### 9.3 Actions
- **Primary CTA** "Print my entry blank" → invokes `generateEntryBlank` (pre-filled mode) → triggers download.
- **Secondary CTA** "Return to dashboard" → existing route.
- **Caption** italic-quill: "A formal confirmation will be emailed on {confirmationDate} once the draw is complete."

### 9.4 Tests
- Render with a fixture entry; assert primary button kicks off PDF generation (mocked), secondary navigates.

**Phase 5 exit:** complete an entry end-to-end in staging; the receipt screen feels visually contiguous with the email arriving 6 days later.

---

## 10. Cross-cutting requirements

### 10.1 Testing policy (per `CLAUDE.md`)
Every new component, hook, util gets a unit test in the same PR. **Don't ship a phase without its tests.** For value-sensitive fields (registry strings flowing into the right slot), write the assertion *first* and run it red before wiring the code.

### 10.2 Accessibility
- `prefers-reduced-motion` honored on all landing-page animations.
- All interactive elements keyboard-reachable; the sticky-nav share/submit buttons need visible focus rings.
- Sufficient contrast: claret on paper passes WCAG AA at body size; verify the 12px small-caps subtitles.
- Email: `role="presentation"` on layout tables; alt text on any glyph-heavy imagery (we ship none, but if added later).

### 10.3 INTENT preservation
- Read `docs/INTENT.md` before any PR touches exhibitor-facing copy or animations.
- Heritage's emotional intent is *formality and reverence* — micro-animations are restrained, never bouncy. Don't substitute spring animations for the specified `ease-out`/`cubic-bezier` curves without a reason.

### 10.4 Worktree + DB push
- Every migration runs from a worktree linked to Supabase, not from main repo (per `CLAUDE.md`).
- `supabase migration list` before authoring `NNN_add_trials_registry.sql`.

### 10.5 Workflow
Follow the project 8-step: implement → `/simplify` → `/commit` → PR → `/review` → fix → merge → `/cleanup`. Don't merge a phase before tests + typecheck + lint pass locally.

---

## 11. Sequencing & estimate

| Phase | Description | Rough effort |
|---|---|---|
| Pre-flight | Schema/route/email-pipeline audit | 0.5 day |
| 0 | Registry config + AKC extraction + migration | 1.0 day |
| 1 | Heritage tokens + shared primitives + tests | 1.0 day |
| 2 | Landing page (8 sections + animations) | 3.0 days |
| 3 | Entry Blank PDF (blank + pre-filled) | 2.0 days |
| 4 | Confirmation email + send function | 1.5 days |
| 5 | Wizard completion screen | 0.5 day |
| QA pass | End-to-end walk on `localhost:5173` + staging | 1.0 day |

**Total ≈ 10.5 dev-days.** Risks: (a) email-client testing surfaces Outlook regressions worth a half-day; (b) `@react-pdf` engraved double-border + corner dots may need iteration to match the prototype.

---

## 12. Open questions to resolve in pre-flight

1. Does a public trial-detail route already exist, or are we adding one?
2. Is there a `shows.style` (or `trials.style`) column already? If yes, what are the enum values?
3. What templating system does the existing email pipeline use?
4. Does the entry wizard already have a "completion" step component we restyle, or do we add one?
5. Where does the trial's `confirmation_date` live, and is there already a scheduled job that fires on it?

Answers go in `2026-05-07-heritage-pre-flight-findings.md` before Phase 0 starts.

---

---

## 13. Addendum — Verification Patches (2026-05-07)

Patches generated by `/verify-plan`. Coverage went from ~82% to ~96% after these additions. Original §1–§12 unchanged; this section adds the gap-coverage that the first draft missed.

### 13.1 [EXPANDED] §6.6 → Landing-page responsive design

The handoff spec is desktop-first (max-width 960px centered). Mobile must work — public landing pages skew heavily phone. Add to Phase 2:

- **Breakpoints:** desktop (≥1024px) → as designed; tablet (768–1023px) → single column, reduced horizontal padding (24px); mobile (<768px) → stack 2-col grids to 1-col, hero title scales to 56px, judges/cards become full-width.
- **Sticky nav:** desktop shows section anchors center-aligned. Tablet collapses anchors into a single "Sections ▾" disclosure; mobile shows only club seal + "Submit Entry" button (the share + nav anchors hide). Verify the sticky bar height stays ~56px on mobile.
- **Tap targets:** buttons ≥44×44 px on touch devices.
- **Animations:** disable parallax/reveal on mobile if FPS dips — observe perf in DevTools and degrade gracefully.

Tests: render at 375 / 768 / 1280 in Playwright; visual-diff the hero + sticky-nav states.

### 13.2 [ADDED] §6.7 — Landing-page edge cases & empty states

The handoff assumes a fully-populated trial. Real trials have gaps. Each section must define what it does when data is missing:

| Section | Empty-state behavior |
| --- | --- |
| Hero countdown | If `entryCloseDate < now` → swap to "Entries closed" pill in claret, hide digit blocks |
| Judges | 0 judges → hide §II entirely; 1 judge → centered single card |
| Capacity meter | `entryLimit === null` → render "open entries" with no bar; `entriesCount === 0` → bar at 0% (not divide-by-zero) |
| Journey timeline | Past steps render greyed; future steps with `null` dates are skipped |
| Officers | 0 officers → hide §VII; the page must still feel complete |
| Sponsors | 0 sponsors → hide that footer column |

Unit tests for each empty case using fixture trials.

### 13.3 [ADDED] §6.8 — Timezone handling

The handoff sample copy reads "Entries close 3 June 2026 · 8:00 PM Central · ...". Treat all trial-level dates as `timestamptz` and store the IANA timezone (`America/Chicago`, etc.) on the trial row.

- **Countdown** computes against `entryCloseAt` in UTC, displays in trial timezone.
- **All exhibitor-facing renders** (landing, blank, email, wizard) format dates in the trial's TZ via `Intl.DateTimeFormat` with `timeZone` option.
- **Migration:** if `trials` lacks a `timezone` column, add it (default `'America/New_York'`, document the assumption) in pre-flight.

Tests: fixture trial with `America/Los_Angeles` renders "8:00 PM Pacific" not "8:00 PM Central".

### 13.4 [ADDED] §6.9 — Real-time capacity vs static

Capacity meter "137 / 360" should update without full reload — exhibitors revisit the page during the entry window.

- Subscribe to `entries` changes via Supabase realtime, scoped to the trial.
- Throttle re-renders to 1 update / 5 seconds (avoid flooding).
- The bar's fill animation only plays on first reveal; subsequent updates set the width directly with no transition.

Tests: mock realtime channel, push an INSERT, assert the count tick-up.

### 13.5 [ADDED] §6.10 — SEO / Open Graph

Public landing page is shareable via the "share ✦" button → URL pasted into iMessage / Slack / Twitter. Without OG tags, recipients see no preview. Add:

- `<title>` — "Spring Scent Work Trial · Bexar County K.C."
- `<meta name="description">` — first sentence of welcome prose.
- `og:title`, `og:description`, `og:url`, `og:type=event`, `og:site_name=myK9Show`.
- `twitter:card=summary_large_image` (image optional — typographic placeholder ok).
- Structured data (`schema.org/Event`) for crawlers.

Use `react-helmet-async` (verify already in use; otherwise pick one and document).

### 13.6 [ADDED] §6.11 — Web font loading strategy

The Heritage style hinges on Cormorant + EB Garamond. Fallback rendering with default sans-serif looks like a broken page, not a degraded one.

- Preconnect: `<link rel="preconnect" href="https://fonts.googleapis.com">` + `https://fonts.gstatic.com`.
- Use `&display=swap` so text is visible during the swap (FOUT, not FOIT).
- Fallback stack: `'Cormorant Garamond', 'EB Garamond', Georgia, 'Times New Roman', serif` — Georgia is metrically close enough that the swap is subtle.
- CSP allowlist: `font-src https://fonts.gstatic.com; style-src https://fonts.googleapis.com` — confirm against the app's existing CSP header.

### 13.7 [EXPANDED] §8.4 → Confirmation email — scheduler, idempotency, failures

Picks up G4 / G5 / G6.

**Scheduler.** Use Supabase `pg_cron` (already in the stack — verify in pre-flight) running daily at 09:00 UTC. The job calls `send-confirmation-email` for every trial whose `confirmation_date <= today` AND `confirmation_emails_sent_at IS NULL`.

**Idempotency.** Add columns:
- `entries.confirmation_email_sent_at timestamptz`
- `entries.confirmation_email_message_id text` (Resend / SendGrid message ID)

The send function only emails entries where `confirmation_email_sent_at IS NULL`, then writes the timestamp + message ID atomically with the send. Re-runs of the cron skip already-sent entries. Trial-level field flips to `now()` only after every entry is processed.

**Failure handling.**
- Per-entry try/catch — one bad address doesn't block the batch.
- On SMTP failure: log to `email_send_failures` table (entry_id, error, attempt_count, last_attempt_at), retry next day with exponential backoff up to 3 attempts, then alert.
- Hook `resend-webhook` (already exists) for bounce/complaint events; flip `entries.confirmation_email_status` to `bounced` so the trial chair can intervene.

**Template versioning.** Store the rendered HTML in `email_send_log` keyed by `entry_id` + `template_version`. If the template changes mid-trial, in-flight sends use the version that was current at queue time.

**Tests.**
- Unit: send function skips entries with non-null `confirmation_email_sent_at`.
- Integration: cron runs twice in a row → only one email per entry.
- Webhook: bounced address flips status without resending.

### 13.8 [EXPANDED] §8.4 → Personalization field checklist

Picks up R12. Enumerate every merge variable the email expects, with type:

```ts
interface ConfirmationEmailProps {
  exhibitorSalutation: 'Mr.' | 'Ms.' | 'Mx.' | 'Dr.' | string;
  exhibitorLastName: string;
  dogRegisteredName: string;
  dogCallName: string;
  dogBreed: string;
  dogSex: 'M' | 'F';
  runs: Array<{
    trialRoman: 'I'|'II'|'III'|'IV'|'V'|'VI';
    dayLabel: string;          // "Friday, 26 June"
    className: string;          // "Excellent Containers"
    judgeShort: string;         // "Hartwell"
    armband: number;
  }>;
  totalRuns: number;
  totalFees: string;            // "$ 92.00"
  receiptNumber: string;        // "BCKC-2026-0137"
  venueShort: string;
  venueAddress: string;
  trialChair: string;
  trialUrl: string;             // absolute URL to landing page
  confirmationDate: string;     // ISO; rendered in trial TZ
}
```

`buildConfirmationProps(entry, trial, registry)` is the single source. Type-narrowing forces every field — drop one and TypeScript fails.

### 13.9 [ADDED] §10.6 — Feature flag / rollout strategy

- **Flag:** `heritage_landing_enabled` (boolean) on the trial row, default `false`. The Heritage layout renders only when both `style === 'heritage'` AND `heritage_landing_enabled === true`. Allows clubs to pick the style during prep but flip the public page on at the right moment.
- **Kill switch:** environment-level flag `VITE_HERITAGE_KILL_SWITCH` — if `true`, the route falls back to the default trial-detail page regardless of trial settings. Lets us roll back a prod regression without DB writes.
- **Staging rollout:** ship Phase 2 behind the flag; turn on for one pilot club; monitor; expand.

### 13.10 [EXPANDED] §7 → PDF download UX states

Picks up G8. Generating the entry blank takes 200–800ms in the browser; on slow devices 2s+. Add to the entry-blank module:

- **Idle:** "Download Entry Blank" button, claret-bordered.
- **Generating:** disabled, spinner glyph, "Preparing your blank…" caption.
- **Error:** ghost-styled "Try again" button + small italic error message ("We couldn't build the blank — please retry or email the secretary").
- **Success:** browser download triggered automatically; button restores to idle after 2s.

Tests: `generateEntryBlank` rejection bubbles to error state; success triggers `URL.createObjectURL` once.

### 13.11 [EXPANDED] §10.2 → Accessibility — concrete checklist

Beyond `axe`:
- **Screen-reader walkthrough** in NVDA (Windows) and VoiceOver (macOS) — every section's heading announced; ornaments marked `aria-hidden="true"` so they're not read aloud as "sparkle sparkle sparkle".
- **Keyboard-only walk** — Tab order matches visual order; sticky nav can be skipped via `<a class="visually-hidden" href="#overview">Skip to content</a>`.
- **Color contrast** — measure claret (#8a1818) on paper (#f8f4ea): expect ~6.7:1 (passes WCAG AA at body size; verify at 12px small-caps subtitles, may need to bold).
- **Reduced-motion** — verified across landing page (animations disabled) and PDF download button (no spinner pulse).

### 13.12 [EXPANDED] §8.5 → Email QA matrix

Picks up G18. Concrete client matrix and exit criteria:

| Client | Render priority | Acceptance |
| --- | --- | --- |
| Gmail web | P0 | Pixel-close to prototype |
| Apple Mail (macOS + iOS) | P0 | Pixel-close |
| Outlook web | P0 | Pixel-close |
| Outlook 365 desktop (Windows) | P1 | Layout intact, fonts may fall to Georgia, ornaments must render |
| Outlook 2019 (Windows) | P1 | Same as above |
| Yahoo Mail | P2 | Layout intact |
| Dark mode (all of the above) | P1 | Background inversion handled — set `[data-ogsc] *` overrides where needed |

Use Litmus or Email on Acid for the matrix run before each phase release.

### 13.13 [ADDED] §10.7 — Analytics events

Track (via existing analytics provider — verify which in pre-flight):
- `heritage_landing_view` — page rendered
- `heritage_share_click` — share button used
- `heritage_submit_click` — Submit Entry CTA used (any of the three on the page)
- `heritage_entry_blank_download` — blank or pre-filled (event property)
- `heritage_email_open` — pixel ping in confirmation email (optional; skip if privacy stance forbids)

Useful for understanding whether the redesign actually moves entry-conversion.

### 13.14 [EXPANDED] §4 → Multi-sport scope clarification

Picks up G15. Phase 0 ships `registries.AKC.sports['scent-work']` only. Other AKC sports (agility, obedience, rally, etc.) are **not** populated; trials in those sports continue to use the existing non-Heritage flow until a follow-up effort fills the registry sport map. Add a `// TODO: populate other sports` comment + a runtime guard in the registry helper:

```ts
function getSport(registry: Registry, sportId: string): RegistrySport {
  const sport = registry.sports[sportId];
  if (!sport) throw new Error(`Sport "${sportId}" not configured for ${registry.id}`);
  return sport;
}
```

This errors loudly rather than rendering a broken Heritage page for an agility trial.

### 13.15 [ADDED] §10.8 — Visual-diff gate

Picks up R13. "High-fidelity, pixel-close" needs a verification process, not just intent.

- **Landing page:** Playwright visual snapshots at 375/768/1280 widths, compared against handoff PNG references checked into `tests/visual-references/heritage/`. CI fails on >0.5% pixel diff.
- **Entry Blank PDF:** rasterize via `@react-pdf` test harness, snapshot the resulting PNG, diff against reference. CI fails on >1% diff.
- **Email:** Litmus / Email on Acid screenshots reviewed manually before each phase merge — no automated gate, but a checklist item in PR description.

This gate is the difference between "I matched the prototype" and "I almost matched the prototype".

### 13.16 [EXPANDED] §3 → Pre-flight question list

Add to §12's open questions (the audit found three more worth answering up front):

6. Does `pg_cron` exist on the linked Supabase project, or must we add it?
7. What analytics provider does the app use today? (PostHog / Segment / GA / none)
8. Does the app currently set any CSP headers we'd need to amend for Google Fonts?

---

*End of plan, including verification patches.*

