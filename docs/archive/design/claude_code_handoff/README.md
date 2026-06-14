# myK9Show Premiums — Remaining 6 Style Bundles

This zip contains the design handoffs for the **six remaining premium styles** to implement in `myk9-platform`. Heritage and Headline are already in production; this is everything else.

## Drop these into the repo

Unzip into `myk9-platform/docs/` so the structure matches Heritage:

```
myk9-platform/docs/
├── design_handoff_heritage/   (already exists, shipped)
├── design_handoff_headline/   (already exists, shipped)
├── design_handoff_monogram/   ← from this zip
├── design_handoff_banner/     ← from this zip
├── design_handoff_magazine/   ← from this zip
├── design_handoff_poster/     ← from this zip
├── design_handoff_gazette/    ← from this zip
└── design_handoff_field_guide/ ← from this zip
```

## What each bundle contains

| File | Purpose |
|---|---|
| `<Style> Landing Page.html` | Public trial-detail page · responsive web |
| `<Style> Entry Blank.html` | US Letter portrait mail-in form · print-ready |
| `<Style> Confirmation Email.html` | 600px email-safe HTML · table-based · inline styles |
| `<Style> Wizard Completion.html` | Final wizard step · matches `HeritageEntryReceived.tsx` props |
| `README.md` | Design system, tokens, motion vocabulary, rationale |
| `<Style> Reconciliation Notes.md` | **Read first** — codebase mapping, file paths, token shapes, migrations, tests, open questions |

## Suggested implementation order

Simplest → most divergent:

1. **Monogram** — adds nothing new architecturally; visual variation only. Reuses existing `buildMonogram()` helper.
2. **Banner** — adds `shows.brand_color` column + per-club color hook. ⚠️ schema change.
3. **Field Guide** — adds the chip component primitive. No schema change.
4. **Gazette** — adds masthead + 3-column body components. No schema change.
5. **Poster** — adds graphic-shape components (ink-blot, rotated square) + mix-blend-mode handling. No schema change.
6. **Magazine** — adds image-upload infrastructure: `magazine_cover_image_url` + `magazine_judge_portrait_urls` columns + Supabase Storage bucket + admin upload UI. ⚠️ largest scope; do last.

## Cross-cutting infrastructure (do once, before the six)

The reconciliation notes flag this in each bundle, but consolidating here:

- **Expand `shows.landing_style` constraint** to accept all 8 values (`'default','heritage','headline','monogram','banner','magazine','poster','gazette','fieldGuide'`). Single migration.
- **Generalize the cron** — rename `heritage-confirmation-emails` to `confirmation-emails`, rename `HERITAGE_CONFIRMATION_SECRET` to `CONFIRMATION_EMAIL_SECRET`, make the send function switch on `show.landing_style` to pick the email template.
- **Extract shared hooks** — `useCountdown`, `useReducedMotion`, `useRevealOnScroll` currently live under `features/heritage/hooks/`. Move to `features/_shared/hooks/` (or `apps/myk9show/src/hooks/`) so the new six can import without copy-paste.
- **Email-template registry** — `packages/email/src/index.ts` should export all 8 confirmation templates; the send function imports them and picks by style.

## Per-bundle prompt for Claude Code

For each style, point Claude Code at:

```
Read docs/design_handoff_<style>/<Style> Reconciliation Notes.md first — it's
the implementation contract. Then read README.md for the design system, and
the four HTML mocks as visual reference.

Follow the patterns established by features/heritage/ and features/headline/.
Prefer existing patterns for anything not explicitly specified.

Implement:
1. features/<style>/ tree per the reconciliation notes
2. packages/email/src/templates/<Style>ConfirmationEmail.tsx
3. packages/email/src/<style>Tokens.ts
4. Tests mirroring the Heritage test suite
5. Playwright visual snapshots at 375/768/1280

Migration changes are listed in the reconciliation notes — apply only those
flagged for this style.
```

## Open questions noted per style

Each reconciliation notes file ends with a "Open questions for engineering" section. Worth a 15-minute read across all six before starting — most are small but a few are architectural (Banner's `brand_color` column shape, Magazine's image-storage location, cron generalization).

## File counts

- 6 styles × 6 files = 36 files
- Total ~250kb unzipped
