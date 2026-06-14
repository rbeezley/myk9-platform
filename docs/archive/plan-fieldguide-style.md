# Plan — Field Guide Style (end-to-end)

Field Guide is the **eighth** premium-style implementation, planned to run **in parallel** with Magazine / Poster / Gazette via 4 separate Claude Code conversations against 4 separate worktrees. Written cold for a new conversation.

## Scope: style-local only

To make 4 parallel conversations merge cleanly, **build ONLY the per-style files.** A separate integration session wires dispatch.

### DO NOT touch these 6 dispatch files

```
supabase/functions/send-confirmation-email/email-style-registry.ts
supabase/functions/send-confirmation-email/email-style-registry.test.ts
supabase/functions/send-confirmation-email/index.ts
apps/myk9show/src/pages/ShowDetailsPage.tsx
apps/myk9show/src/components/shows/RegistrationWorkflow/WorkflowStepContent.tsx
```

You MAY append exports to `packages/email/src/index.ts` and `packages/email/src/types.ts`.

Document required dispatch changes in your PR description under **Phase 3 wiring instructions**.

## Visual register

Utility reference document: chip-tagged headers, dense data tables with alternating row backgrounds, §-numbered sections, IBM Plex Sans + Mono throughout, parchment paper with indicator-orange accents. Tone: USGS field guide meets technical spec sheet meets API documentation. The most *functional* style.

**No italics. No drop caps. No display serifs.** The hero is a quick-reference grid of six data cells, not a title. Where Magazine wants you to *read*, Field Guide wants you to *scan*.

| Token | Value | Purpose |
|---|---|---|
| `--fg-paper` | `#f6f1e6` | Page background — pale parchment |
| `--fg-paper-warm` | `#ebe4cf` | Alternating row, header cell background |
| `--fg-paper-deep` | `#1f2a24` | Dark band (top strip, footer, mail-to) |
| `--fg-ink` | `#1f2a24` | Body type, rules — same as paper-deep |
| `--fg-soft` | `#3a4339` | Body copy |
| `--fg-mute` | `#6b6e5e` | Captions, mono labels |
| `--fg-hair` | `#c4bba0` | Table hairlines |
| `--fg-orange` | `#c96442` | **Indicator accent** — chips, totals, CTA, status |
| `--fg-orange-deep` | `#8a3e21` | Folio numbers, links, deeper accent text |
| `--fg-cyan` | `#3a6e72` | **Secondary indicator** — sparingly, 2–3× per page max |

Display: IBM Plex Sans 700 (titles 22–56px, tight tracking `-0.02em` to `-0.025em`). Body: IBM Plex Sans 400/500/600 — 14px main, 13px in tables. Mono: IBM Plex Mono 500/600 tracked tight `0.04em` — every label, folio, chip, ID code, time, status. **Serif: IBM Plex Serif 500/700** used only in welcome prose + agreement block. The single concession to long-form readability.

### Critical PDF caveat — IBM Plex Mono

`pdfFonts.ts` already aliases `IBM Plex Mono` to `JetBrains Mono` (per the v4/v5 glyph-table bug that crashes @react-pdf). **Use the `IBM Plex Mono` family name in the PDF code** — the alias handles substitution transparently.

`IBM Plex Sans` and `IBM Plex Serif` need verification — if not yet registered, append to `pdfFonts.ts`.

### Chip system (the signature element)

```css
.chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 6px;
  font-family: var(--fg-mono); font-weight: 500; font-size: 10.5px;
  /* + border, color from token */
}
```

Used everywhere a label could be: section folios, status indicators, judge panel summaries, chip-tagged headers. Build this as a primitive — call it `FieldGuideChip`.

## Clone-from-this-style instruction

**Clone Banner** (sans-only, functional discipline, monolithic display) **OR Headline** (loud sans, monospace running strips). Banner is closer tonally — Field Guide and Banner share the "no italics, no serifs" discipline. Specifically: clone Banner's `BannerContentRow`, `BannerFlagBar`, `BannerSectionHead` primitives — Field Guide's analogs (`FieldGuideContentRow`, `FieldGuideDarkBand`, `FieldGuideSectionHead`) are direct cousins.

Workflow:

1. `cp -r apps/myk9show/src/features/banner apps/myk9show/src/features/fieldGuide` then retoken
2. Strip Banner's per-club brand color machinery — Field Guide is not per-club configurable (use the fixed `--fg-orange` everywhere)
3. Drop italic everywhere — Banner has no italics, but double-check the wizard and email copy
4. Add the chip primitive (`FieldGuideChip`)
5. The hero is **not** a flag bar — it's a 6-cell data grid. Banner's `FlagMasthead` should not survive the clone.

**Reuse, don't fork:**
- `apps/myk9show/src/features/heritage/entry-blank/buildEntryBlankProps.ts`
- Shared hooks from `features/_shared/hooks/`

## Source-of-truth files (read before coding)

| File | Purpose |
|---|---|
| `docs/design/claude_code_handoff/design_handoff_field_guide/Field Guide Reconciliation Notes.md` | **Read first.** Chip spec, table-row patterns. |
| `.../README.md` | Visual system, chip taxonomy |
| `.../Field Guide Landing Page.html` | Landing mock — 6-cell data grid hero |
| `.../Field Guide Confirmation Email.html` | Email mock |
| `.../Field Guide Entry Blank.html` | PDF mock |
| `.../Field Guide Wizard Completion.html` | Wizard mock |

## Migration

**No migration required.** Field Guide tokens are fixed.

## File tree to add (style-local only)

```
apps/myk9show/src/features/fieldGuide/
├── components/
│   ├── FieldGuideHeading.tsx               (IBM Plex Sans 700)
│   ├── FieldGuideSectionHead.tsx           (§02 + folio + chip)
│   ├── FieldGuideChip.tsx                  (the signature primitive)
│   ├── FieldGuideDataGrid.tsx              (6-cell hero quick-reference)
│   ├── FieldGuideDarkBand.tsx              (top strip, mail-to, footer)
│   └── FieldGuideTable.tsx                 (alternating-row data table)
├── landing/
│   ├── FieldGuideLandingPage.tsx
│   ├── useFieldGuideLandingData.ts
│   ├── types.ts
│   ├── utils/dateFormat.ts
│   ├── sections/
│   │   ├── TopStrip.tsx                    (dark band with chip-tagged kicker)
│   │   ├── DataGridHero.tsx                (6-cell grid, NOT a flag bar)
│   │   ├── WelcomeSection.tsx              (IBM Plex Serif prose, the only serif)
│   │   ├── ParticularsSection.tsx          (dense table)
│   │   ├── JudgesSection.tsx               (chip-tagged judge cards)
│   │   ├── RosterSection.tsx
│   │   ├── PlanSection.tsx
│   │   ├── ScheduleSection.tsx             (chip-tagged time/event)
│   │   ├── OfficersSection.tsx
│   │   ├── FinalCtaSection.tsx
│   │   └── FieldGuideFooter.tsx
│   └── __tests__/
├── wizard/
│   ├── FieldGuideEntryReceived.tsx
│   └── __tests__/
├── entry-blank/
│   ├── FieldGuideEntryBlankDocument.tsx
│   ├── FieldGuideEntryBlankButton.tsx
│   ├── index.ts                            (re-exports Heritage buildEntryBlankProps)
│   ├── sections/
│   │   ├── pdfPrimitives.tsx
│   │   ├── EntryBlankHeader.tsx
│   │   ├── DogParticularsSection.tsx
│   │   ├── ClassesEnteredSection.tsx
│   │   ├── OwnerHandlerSection.tsx
│   │   ├── FeesSection.tsx
│   │   ├── AgreementSection.tsx            (IBM Plex Serif prose)
│   │   └── MailToPanel.tsx                 (dark band)
│   └── __tests__/
├── __tests__/
│   ├── FieldGuideHeading.test.tsx
│   ├── FieldGuideChip.test.tsx             (mandatory — signature primitive)
│   ├── FieldGuideDataGrid.test.tsx
│   ├── FieldGuideDarkBand.test.tsx
│   └── FieldGuideTable.test.tsx
├── fonts.ts                                (IBM Plex Sans + Mono + Serif)
├── fieldGuide.css                          (scoped under [data-field-guide])
├── index.ts
└── tokens.ts

packages/email/src/
├── fieldGuideTokens.ts                     NEW
├── templates/FieldGuideConfirmationEmail.tsx NEW
├── index.ts                                APPEND
└── types.ts                                APPEND

supabase/functions/send-confirmation-email/
├── fieldGuide-email.ts                     NEW
└── fieldGuide-email.test.ts                NEW
```

**Approximate scope: ~35–40 files, ~3500–4500 lines.**

Note: the directory is `fieldGuide/` (camelCase, no underscore) since `PremiumStyle` and `EmailStyle` use `'fieldGuide'`. The design handoff folder is `design_handoff_field_guide/` — that's design-side; the code side stays camelCase.

## PDF font registrations

Verify in `pdfFonts.ts`:
- `IBM Plex Mono` already registered ✓ (aliased to JetBrains Mono — the bug workaround)
- `IBM Plex Sans` — unverified, likely needs to be added
- `IBM Plex Serif` — unverified, likely needs to be added

**Append** to `pdfFonts.ts` if not present (additive, low merge conflict):

```ts
Font.register({
  family: 'IBM Plex Sans',
  fonts: [
    { src: `${FS}/ibm-plex-sans@5/files/ibm-plex-sans-latin-400-normal.woff`, fontWeight: 400 },
    { src: `${FS}/ibm-plex-sans@5/files/ibm-plex-sans-latin-500-normal.woff`, fontWeight: 500 },
    { src: `${FS}/ibm-plex-sans@5/files/ibm-plex-sans-latin-700-normal.woff`, fontWeight: 700 },
  ],
});
Font.register({
  family: 'IBM Plex Serif',
  fonts: [
    { src: `${FS}/ibm-plex-serif@5/files/ibm-plex-serif-latin-500-normal.woff`, fontWeight: 500 },
    { src: `${FS}/ibm-plex-serif@5/files/ibm-plex-serif-latin-700-normal.woff`, fontWeight: 700 },
  ],
});
```

## Tests to ship (~30 minimum)

| File | Coverage | ~Lines |
|---|---|---|
| `__tests__/FieldGuideHeading.test.tsx` | Levels, IBM Plex Sans 700, sizes | 60 |
| `__tests__/FieldGuideChip.test.tsx` | **Signature primitive — full coverage.** Default chip, orange/cyan variants, with-icon, tight mono tracking | 100 |
| `__tests__/FieldGuideDataGrid.test.tsx` | 6-cell grid, label + value rendering, missing-data fallback | 60 |
| `__tests__/FieldGuideDarkBand.test.tsx` | Dark band, paper text, padding | 50 |
| `__tests__/FieldGuideTable.test.tsx` | Alternating row backgrounds, hairlines | 60 |
| `landing/__tests__/useFieldGuideLandingData.test.ts` | Data assembly | 120 |
| `wizard/__tests__/FieldGuideEntryReceived.test.tsx` | Mirror Banner shape, NO italics anywhere | 150 |
| `entry-blank/__tests__/FieldGuideEntryBlankDocument.test.tsx` | §-numbered folios, chip rendering, NO italics | 80 |
| `supabase/functions/send-confirmation-email/fieldGuide-email.test.ts` | Output shape, XSS escaping, NO italics, NO serifs except agreement | 200 |

**Critical assertion** in the email + wizard tests: assert the rendered output contains **zero** `font-style: italic` declarations. Field Guide's discipline is "no italics anywhere" and a regression copy-paste from another style would silently violate it.

## Open questions to resolve BEFORE writing code

1. **Chip color variants** — orange (status), cyan (extra info), neutral (default)? Recommend **all three** since the design handoff lists them.
2. **6-cell data grid responsive** — under 900px, collapse to 2×3 or 3×2? Recommend **2×3** (matches a phone's portrait reading rhythm).
3. **Cyan usage budget** — handoff says "at most 2–3× per page." Build a check or trust the design? Recommend **trust the design** but add a code comment at each cyan-chip call site.
4. **Email serif** — the welcome prose uses IBM Plex Serif on web. Outlook may not have it. Fall back stack: `'IBM Plex Serif', Georgia, serif`. Test render in Litmus or Email-on-Acid before deploy.

## Effort estimate

~6–9 hours.

---

## Starter prompt to paste into the new Field Guide conversation

```
Read docs/plan-fieldguide-style.md in this repo end-to-end — it's the contract for shipping the Field Guide premium style end-to-end. This conversation runs in parallel with three siblings (Magazine / Poster / Gazette).

Critical constraint: DO NOT touch the 6 dispatch files listed in the plan. Build only style-local files. Document required dispatch changes in your PR description under "Phase 3 wiring instructions" — a final integration session wires all 4 styles at once.

Critical visual discipline: NO ITALICS ANYWHERE. NO DISPLAY SERIFS. The only serif is IBM Plex Serif in the welcome prose and agreement block. Write a test that asserts zero `font-style: italic` in the rendered email + wizard output.

Start by:
1. Confirming you're on a fresh branch `claude/fieldguide-style` off main, in a worktree under .claude/worktrees/
2. Reading the plan doc + reconciliation notes + 4 design HTML mocks
3. Cloning `features/banner/` as the structural template (then stripping per-club brand-color machinery)
4. Build the FieldGuideChip primitive FIRST and write its test — it's the signature element used in 10+ places
5. The hero is a 6-cell data grid, NOT a flag bar — Banner's FlagMasthead should not survive the clone
6. Append IBM Plex Sans + Serif font registrations to apps/myk9show/src/features/premium/pdf/pdfFonts.ts if not present
7. Build style-local files only; commit each phase as you go
8. Run pnpm typecheck + vitest before pushing

CI is billing-blocked until 2026-06-01 — local typecheck + tests are the source of truth.
```
