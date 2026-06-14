# Plan — Poster Style (end-to-end)

Poster is the **sixth** premium-style implementation, planned to run **in parallel** with Magazine / Gazette / Field Guide via 4 separate Claude Code conversations against 4 separate worktrees. This plan is written to be **read cold** by a new conversation — assume no memory of how Banner, Monogram, Heritage, or Headline landed.

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

You MAY append exports to `packages/email/src/index.ts` and `packages/email/src/types.ts` (alphabetical insertion; conflicts trivial).

Document required dispatch changes in your PR description under **Phase 3 wiring instructions**.

## Visual register

Contemporary graphic-design poster: massive condensed display, red ink-blot in the upper right, olive square rotating into the lower left, monospace running strips top and bottom. The *loudest* style in the system. The ink-blot and rotating square are **load-bearing** — not decoration.

| Token | Value | Purpose |
|---|---|---|
| `--po-cream` | `#f3ede0` | Page background |
| `--po-cream-warm` | `#e9dfc8` | Alt-section background |
| `--po-ink` | `#1f1d18` | Body type, footer, dark band |
| `--po-ink-soft` | `#3a342a` | Body copy |
| `--po-mute` | `#7a7466` | Captions, labels |
| `--po-hair` | `#cabe9f` | Internal hairlines |
| `--po-red` | `#c83b1a` | **Hero accent** — circle, totals, italic emphasis |
| `--po-red-deep` | `#8a2810` | Gradient stop inside the ink-blot |
| `--po-olive` | `#3d3a2a` | Rotating square, dark-band variant |

Three colors only — cream, ink, red — with olive as the dark modulator. No grays. Restraint is the discipline.

Display: **Archivo Black** at 56–224px, letter-spacing tight (`-0.035em` to `-0.05em`). Body: Inter 400/500/600. Mono: IBM Plex Mono tracked tight at `0.04em` (NOT 0.32em). Body-display: Inter Tight 800 at sub-headline sizes.

**Archivo Black is the entire identity.** Never below 18px. Never for body copy.

### Critical PDF caveat — Archivo Black

`pdfFonts.ts` documents that **Archivo Black + @react-pdf crashes the glyph-metrics parser** (CFF outlines). Existing `MONOGRAM_TOKENS`/Poster premium-PDF code already falls back to Inter Tight 700 for that reason.

**For the entry-blank PDF**, substitute **Inter Tight 800/900** wherever Archivo Black is called for. The web landing/wizard can use Archivo Black freely. The PDF must not. Comment the substitution at the top of `entry-blank/sections/pdfPrimitives.tsx`.

## Clone-from-this-style instruction

**Clone Headline.** Headline is the closest sans tradition (loud sans, marker accents, single bright color discipline). Workflow:

1. `cp -r apps/myk9show/src/features/headline apps/myk9show/src/features/poster` then retoken
2. Don't bring over the Headline-specific marker-highlight component — Poster's analog is the **ink-blot + rotating square** SVG/CSS elements, not text highlights.
3. Same email + entry-blank PDF clone path from Headline

**Reuse, don't fork:**
- `apps/myk9show/src/features/heritage/entry-blank/buildEntryBlankProps.ts`
- Shared hooks from `features/_shared/hooks/`

## Source-of-truth files (read before coding)

| File | Purpose |
|---|---|
| `docs/design/claude_code_handoff/design_handoff_poster/Poster Reconciliation Notes.md` | **Read first.** File paths, token map, graphic-elements spec. |
| `.../design_handoff_poster/README.md` | Visual system, motion |
| `.../design_handoff_poster/Poster Landing Page.html` | Landing mock — pay attention to the ink-blot positioning |
| `.../design_handoff_poster/Poster Confirmation Email.html` | Email mock |
| `.../design_handoff_poster/Poster Entry Blank.html` | PDF mock |
| `.../design_handoff_poster/Poster Wizard Completion.html` | Wizard mock |

## Migration

**No migration required.** Poster tokens are fixed at the design-system level.

## File tree to add (style-local only)

```
apps/myk9show/src/features/poster/
├── components/
│   ├── PosterHeading.tsx                   (Archivo Black display)
│   ├── PosterSectionHead.tsx
│   ├── PosterInkBlot.tsx                   (load-bearing SVG/CSS, mix-blend-mode: multiply)
│   ├── PosterRotatingSquare.tsx            (320px, rotate 8deg, blend multiply)
│   └── PosterMonoStrip.tsx                 (top/bottom running mono strips)
├── landing/
│   ├── PosterLandingPage.tsx
│   ├── usePosterLandingData.ts
│   ├── types.ts
│   ├── utils/dateFormat.ts
│   ├── sections/
│   │   ├── StickyNav.tsx                   (mono strip)
│   │   ├── HeroBlock.tsx                   (stacked vertical Archivo Black + ink-blot)
│   │   ├── WelcomeSection.tsx
│   │   ├── ParticularsSection.tsx
│   │   ├── JudgesSection.tsx
│   │   ├── RosterSection.tsx
│   │   ├── PlanSection.tsx
│   │   ├── OnTheDaySection.tsx
│   │   ├── OfficersSection.tsx
│   │   ├── FinalCtaSection.tsx
│   │   └── PosterFooter.tsx
│   └── __tests__/
├── wizard/
│   ├── PosterEntryReceived.tsx
│   └── __tests__/
├── entry-blank/
│   ├── PosterEntryBlankDocument.tsx
│   ├── PosterEntryBlankButton.tsx
│   ├── index.ts                            (re-exports Heritage buildEntryBlankProps)
│   ├── sections/
│   │   ├── pdfPrimitives.tsx               (Inter Tight 800/900 substitute for Archivo)
│   │   ├── EntryBlankHeader.tsx
│   │   ├── DogParticularsSection.tsx
│   │   ├── ClassesEnteredSection.tsx
│   │   ├── OwnerHandlerSection.tsx
│   │   ├── FeesSection.tsx
│   │   ├── AgreementSection.tsx
│   │   └── MailToPanel.tsx
│   └── __tests__/
├── __tests__/
│   ├── PosterHeading.test.tsx
│   ├── PosterInkBlot.test.tsx
│   ├── PosterRotatingSquare.test.tsx
│   └── PosterMonoStrip.test.tsx
├── fonts.ts                                (Archivo Black + Inter + Inter Tight + IBM Plex Mono)
├── poster.css                              (scoped under [data-poster])
├── index.ts
└── tokens.ts

packages/email/src/
├── posterTokens.ts                         NEW
├── templates/PosterConfirmationEmail.tsx   NEW
├── index.ts                                APPEND
└── types.ts                                APPEND

supabase/functions/send-confirmation-email/
├── poster-email.ts                         NEW
└── poster-email.test.ts                    NEW
```

**Approximate scope: ~35–40 files, ~3500–4500 lines.**

## PDF font registrations

Verify in `apps/myk9show/src/features/premium/pdf/pdfFonts.ts`:
- `Inter Tight` already registered ✓ (Banner)
- `IBM Plex Mono` already registered ✓ (aliased to JetBrains Mono)
- `Inter` already registered ✓
- **Archivo Black: DO NOT register.** Use `Inter Tight 800/900` as the PDF substitute per the caveat above.

## Tests to ship (~30 minimum)

Mirror Banner PR #188's coverage shape:

| File | Coverage | ~Lines |
|---|---|---|
| `__tests__/PosterHeading.test.tsx` | Levels, sizes, color prop | 60 |
| `__tests__/PosterInkBlot.test.tsx` | Position, size, blend mode | 50 |
| `__tests__/PosterRotatingSquare.test.tsx` | Rotation, position, blend mode | 40 |
| `__tests__/PosterMonoStrip.test.tsx` | Renders strip content, mono tracking | 40 |
| `landing/__tests__/usePosterLandingData.test.ts` | Data assembly | 120 |
| `wizard/__tests__/PosterEntryReceived.test.tsx` | Prop branches, button states, navigation | 150 |
| `entry-blank/__tests__/PosterEntryBlankDocument.test.tsx` | Section folios, agreement, header | 80 |
| `supabase/functions/send-confirmation-email/poster-email.test.ts` | Output shape, XSS escaping, NO Archivo Black in PDF output | 200 |

## Open questions to resolve BEFORE writing code

1. **Ink-blot rendering** — CSS gradient + border-radius:50% with mix-blend-mode? Or inline SVG? Recommend **CSS** (simpler, scales cleaner). Test on Safari for blend-mode quirks.
2. **Rotating square animation** — static or slowly rotating? Recommend **static** (Poster motion vocabulary is restrained; the rotation is a baked-in 8deg, not animated).
3. **PDF Archivo substitute** — Inter Tight 800 or 900? Recommend **900** for the masthead, **800** for body display.
4. **Email graphic elements** — the ink-blot and rotating square don't survive email clients. Should the email omit them entirely or render flat-color rectangles? Recommend **omit** — the email becomes typography-only, which is honest about the medium.

## Effort estimate

~6–9 hours.

---

## Starter prompt to paste into the new Poster conversation

```
Read docs/plan-poster-style.md in this repo end-to-end — it's the contract for shipping the Poster premium style end-to-end. This conversation runs in parallel with three siblings (Magazine / Gazette / Field Guide).

Critical constraint: DO NOT touch the 6 dispatch files listed in the plan. Build only style-local files. Document required dispatch changes in your PR description under "Phase 3 wiring instructions" — a final integration session wires all 4 styles at once.

Critical PDF caveat: Archivo Black crashes @react-pdf's glyph parser. For the entry-blank PDF use Inter Tight 800/900 as a substitute. The web landing/wizard can use Archivo Black freely.

Start by:
1. Confirming you're on a fresh branch `claude/poster-style` off main, in a worktree under .claude/worktrees/
2. Reading the plan doc + reconciliation notes + 4 design HTML mocks
3. Cloning `features/headline/` as the structural template
4. Building style-local files only; commit each phase as you go
5. Running pnpm typecheck + vitest before pushing

CI is billing-blocked until 2026-06-01 — local typecheck + tests are the source of truth.
```
