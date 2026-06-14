# Plan — Magazine Style (end-to-end)

Magazine is the **fifth** premium-style implementation, planned to run **in parallel** with Poster / Gazette / Field Guide via 4 separate Claude Code conversations against 4 separate worktrees. This plan is written to be **read cold** by a new conversation — assume no memory of how Banner, Monogram, Heritage, or Headline landed.

## Scope: style-local only

To make 4 parallel conversations merge cleanly with zero conflicts, **this conversation builds ONLY the per-style files**. A separate integration session wires all 4 dispatch files at once after these PRs merge.

### DO NOT touch these 6 dispatch files

```
supabase/functions/send-confirmation-email/email-style-registry.ts
supabase/functions/send-confirmation-email/email-style-registry.test.ts
supabase/functions/send-confirmation-email/index.ts
apps/myk9show/src/pages/ShowDetailsPage.tsx
apps/myk9show/src/components/shows/RegistrationWorkflow/WorkflowStepContent.tsx
```

You MAY append exports to these two files (additive only, append at the bottom in alphabetical order by style name; conflicts here are trivial to resolve):

```
packages/email/src/index.ts
packages/email/src/types.ts
```

If something tempts you to wire dispatch (e.g. "this won't render unless I add the branch to ShowDetailsPage"), DON'T. Document the required dispatch changes in your PR description under a section called **Phase 3 wiring instructions**. The integration session will read those and execute them in one pass.

## Visual register

Editorial spread: oversized italic display serif, warm gold gradient hairlines, drop-cap openings, multi-column body, feature-photograph slots. Tone: *Kinfolk* meets a print quarterly. Most *photographic* of the eight styles — placeholder gradient rectangles labeled "Cover photograph · Club to supply" appear when no image is uploaded.

| Token | Value | Purpose |
|---|---|---|
| `--mz-paper` | `#f6f1e8` | Warm cream background |
| `--mz-paper-deep` | `#ece4d3` | Inset surfaces, footer |
| `--mz-ink` | `#1a1a1a` | Body type, rules |
| `--mz-gold-1/2/3` | `#c9a87c` / `#a8814f` / `#4a3826` | Gradient stops + italic emphasis |
| `--mz-quill` | `#5c4f3a` | Deks, italic muted |
| `--mz-mute` | `#7a6e58` | Captions, labels |

Display: Cormorant Garamond 500 / italic (72–112px). Body: Source Serif 4 (variable optical). Labels: Inter Tight 500 (the only sans, used sparingly). **Do not substitute Cormorant body for Source Serif** — Cormorant at body sizes loses its hairlines.

Signature elements: 2-column hero spread with photo slot, `column-count: 2` Welcome body with drop cap, gold-gradient pull quote with attribution.

## Clone-from-this-style instruction

**Clone Heritage.** Heritage is the closest tonally (warm + literary + serif-heavy + same data shape). Workflow:

1. `cp -r apps/myk9show/src/features/heritage/landing apps/myk9show/src/features/magazine/landing` then rename/retoken
2. Same for `heritage/wizard/`, `heritage/entry-blank/`, `heritage/components/`
3. For the email pipeline: clone `packages/email/src/templates/HeritageConfirmationEmail.tsx` + `heritageTokens.ts` + `supabase/functions/send-confirmation-email/heritage-email.ts` (the buildHtml function — it's the legacy default builder; copy its shape)

**Reuse, don't fork:**
- `apps/myk9show/src/features/heritage/entry-blank/buildEntryBlankProps.ts` — re-export through the Magazine entry-blank barrel. This is the proven shared data layer.
- `apps/myk9show/src/features/_shared/hooks/useCountdown`, `useReducedMotion`, `useRevealOnScroll`

## Source-of-truth files (read before coding)

| File | Purpose |
|---|---|
| `docs/design/claude_code_handoff/design_handoff_magazine/Magazine Reconciliation Notes.md` | **Read this first, in full.** File paths, token map, open questions. |
| `.../design_handoff_magazine/README.md` | Visual system, motion vocabulary |
| `.../design_handoff_magazine/Magazine Landing Page.html` | Visual contract for landing |
| `.../design_handoff_magazine/Magazine Confirmation Email.html` | Email mock |
| `.../design_handoff_magazine/Magazine Entry Blank.html` | PDF mock |
| `.../design_handoff_magazine/Magazine Wizard Completion.html` | Wizard-step mock |

## Migration

**No migration required.** Magazine is not per-club-configurable (unlike Banner's `brand_color`). All tokens are fixed at the design-system level.

## File tree to add (style-local only)

```
apps/myk9show/src/features/magazine/
├── components/
│   ├── MagazineHeading.tsx                 (Cormorant Garamond display, italic accent)
│   ├── MagazineSectionHead.tsx             (extracted primitive — see PR #188 BannerSectionHead)
│   ├── MagazineDropCap.tsx                 (88px Cormorant, gold-3, floats first paragraph)
│   ├── MagazinePullQuote.tsx               (italic + gold-gradient stripe)
│   ├── MagazineGoldRule.tsx                (gradient hairline)
│   └── MagazineFeaturePhoto.tsx            (image slot with gradient placeholder fallback)
├── landing/
│   ├── MagazineLandingPage.tsx
│   ├── useMagazineLandingData.ts           (clone useHeritageLandingData)
│   ├── types.ts
│   ├── utils/dateFormat.ts                 (clone Heritage's)
│   ├── sections/
│   │   ├── StickyNav.tsx
│   │   ├── HeroSpread.tsx                  (2-col, photo slot right)
│   │   ├── WelcomeSection.tsx              (column-count: 2 + drop cap + pull quote)
│   │   ├── ParticularsSection.tsx
│   │   ├── JudgesSection.tsx
│   │   ├── RosterSection.tsx
│   │   ├── PlanSection.tsx
│   │   ├── OnTheDaySection.tsx
│   │   ├── OfficersSection.tsx
│   │   ├── FinalCtaSection.tsx
│   │   └── MagazineFooter.tsx
│   └── __tests__/
├── wizard/
│   ├── MagazineEntryReceived.tsx           (clone HeritageEntryReceived shape)
│   └── __tests__/
├── entry-blank/
│   ├── MagazineEntryBlankDocument.tsx
│   ├── MagazineEntryBlankButton.tsx
│   ├── index.ts                            (re-exports Heritage buildEntryBlankProps)
│   ├── sections/
│   │   ├── pdfPrimitives.tsx
│   │   ├── EntryBlankHeader.tsx
│   │   ├── DogParticularsSection.tsx
│   │   ├── ClassesEnteredSection.tsx
│   │   ├── OwnerHandlerSection.tsx
│   │   ├── FeesSection.tsx
│   │   ├── AgreementSection.tsx
│   │   └── MailToPanel.tsx
│   └── __tests__/
├── __tests__/
│   ├── MagazineHeading.test.tsx
│   ├── MagazineDropCap.test.tsx
│   ├── MagazinePullQuote.test.tsx
│   └── MagazineGoldRule.test.tsx
├── fonts.ts                                (Cormorant Garamond + Source Serif 4 + Inter Tight)
├── magazine.css                            (scoped under [data-magazine])
├── index.ts                                (public barrel)
└── tokens.ts

packages/email/src/
├── magazineTokens.ts                       NEW
├── templates/MagazineConfirmationEmail.tsx NEW
├── __tests__/                              (optional — primitive coverage is sufficient)
├── index.ts                                APPEND export + type export only
└── types.ts                                APPEND MagazineConfirmationProps + MagazineRunRow

supabase/functions/send-confirmation-email/
├── magazine-email.ts                       NEW (Deno builder, local palette copy)
└── magazine-email.test.ts                  NEW
```

**Approximate scope: ~35–40 files, ~3500–4500 lines.** Same shape as Banner PR #188.

## PDF font registrations

These are NEEDED for the entry-blank PDF. **Append** to `apps/myk9show/src/features/premium/pdf/pdfFonts.ts` at the bottom (additive, easy to merge):

- `Cormorant Garamond` — already registered (Heritage uses it). Reuse.
- `Source Serif 4` — already registered (Magazine premium PDF was scaffolded). Verify.
- `Inter Tight` — already registered (Banner). Reuse.

You likely don't need to touch `pdfFonts.ts` at all — confirm with `grep "Magazine\|Cormorant\|Source Serif\|Inter Tight" apps/myk9show/src/features/premium/pdf/pdfFonts.ts`.

## Tests to ship (~30 minimum)

| File | Coverage | ~Lines |
|---|---|---|
| `__tests__/MagazineHeading.test.tsx` | Levels 1–4, italic accent, custom size, class concat | 60 |
| `__tests__/MagazineDropCap.test.tsx` | First-character extraction, font + size, gold-3 color | 40 |
| `__tests__/MagazinePullQuote.test.tsx` | Quote + attribution rendering, gradient stripe | 40 |
| `__tests__/MagazineGoldRule.test.tsx` | Renders, gradient direction | 25 |
| `landing/__tests__/useMagazineLandingData.test.ts` | Data assembly, judge dedup, fee formatting | 120 |
| `wizard/__tests__/MagazineEntryReceived.test.tsx` | Mirror PR #188 BannerEntryReceived shape | 150 |
| `entry-blank/__tests__/MagazineEntryBlankDocument.test.tsx` | Mirror PR #188 BannerEntryBlankDocument shape | 80 |
| `supabase/functions/send-confirmation-email/magazine-email.test.ts` | Output shape, XSS escaping, no broken column-clip | 200 |

## Open questions to resolve BEFORE writing code

1. **Cover photograph slot** — render a gradient placeholder when no image exists, or hide entirely? **Recommend placeholder** (design intent: visible cost of not uploading art).
2. **Multi-column body fallback** — what if welcome text is < 2 paragraphs? Render single column, no column-rule.
3. **Drop cap font fallback** — Cormorant Garamond 500 at 88px. If the font fails to load, what shows? Fall back to Source Serif 4 700 at 88px (same metrics, ugly but legible).
4. **Pull quote sourcing** — extract from `experiencePublishedContent.supplemental.pullQuote` if available, else hide the pull-quote element.

## Effort estimate

~6–9 hours, one focused session — same shape as Banner PR #188.

---

## Starter prompt to paste into the new Magazine conversation

```
Read docs/plan-magazine-style.md in this repo end-to-end — it's the contract for shipping the Magazine premium style end-to-end. This conversation runs in parallel with three siblings (Poster / Gazette / Field Guide).

Critical constraint: DO NOT touch the 6 dispatch files listed in the plan. Build only style-local files. Document required dispatch changes in your PR description under "Phase 3 wiring instructions" — a final integration session wires all 4 styles at once.

Start by:
1. Confirming you're on a fresh branch `claude/magazine-style` off main, in a worktree under .claude/worktrees/
2. Reading the plan doc + reconciliation notes + 4 design HTML mocks
3. Cloning `features/heritage/` as the structural template
4. Building style-local files only; commit each phase as you go
5. Running pnpm typecheck + vitest before pushing

CI is billing-blocked until 2026-06-01 — local typecheck + tests are the source of truth.
```
