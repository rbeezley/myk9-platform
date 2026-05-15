# Plan — Gazette Style (end-to-end)

Gazette is the **seventh** premium-style implementation, planned to run **in parallel** with Magazine / Poster / Field Guide via 4 separate Claude Code conversations against 4 separate worktrees. Written cold for a new conversation.

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

1947 small-town newspaper broadsheet: Playfair Display masthead with edition meta, 3-column body, drop-cap leads, dotted-rule classifieds, sepia paper tone, brown accent. Tone: *The New York Times* circa 1947 meets a working kennel-club newsletter. The most *text-dense* style.

The hero is a 3-column article body with a drop cap, **not a giant headline**. Gazette whispers in column inches where Poster shouts in scale.

| Token | Value | Purpose |
|---|---|---|
| `--gz-paper` | `#f7f1e3` | Warm ivory page background (with subtle 45° letterpress texture at 0.018 opacity) |
| `--gz-paper-warm` | `#ede5d2` | Inset / footer |
| `--gz-ink` | `#2a2520` | Body type, rules, masthead |
| `--gz-soft` | `#3d352c` | Body copy |
| `--gz-brown` | `#6b4f3a` | **Accent** — italic emphasis, kickers, classifieds tags |
| `--gz-hair` | `#b8a98a` | Hairlines, dotted rules |
| `--gz-deep` | `#1a1611` | Final-ad band background |

Display: Playfair Display 700/900 (italic 400/700 — note italic drops to 400 for the "classical newspaper" look; italic 700 reads too "feature article"). Body: Source Serif 4 (variable optical), 15px main, 13–14px in classifieds. Meta: IBM Plex Mono 500/600 tracked 0.18em–0.32em.

Body sets `font-feature-settings: "onum" 1` for old-style figures. **Numbers in masthead and headlines stay lining (default).**

Signature elements: masthead with edition strip ("*The* … *Gazette*"), 3-column drop-cap body (`column-count: 3` + `column-rule: 1px solid`), "Continued on §02" pseudo-page-break between sections, classifieds boxes (bordered cards with category caps), double-rule sectioning (`4px double` between major sections), schedule with hall column.

Almost no motion — title rises 6px on load over 800ms, capacity bar fills over 1.4s, nothing else moves.

## Clone-from-this-style instruction

**Clone Heritage.** Heritage is the closest classical-serif tradition (warm + literary + serif-heavy). Workflow:

1. `cp -r apps/myk9show/src/features/heritage apps/myk9show/src/features/gazette` then retoken
2. The Welcome section needs the most surgery: Heritage has a single column; Gazette needs `column-count: 3` with column-rule + drop cap + "Continued on §02" tail
3. Replace Heritage's ornament glyph (✦) with Gazette's section-letter doubles ("SECTION A · WELCOME")

**Reuse, don't fork:**
- `apps/myk9show/src/features/heritage/entry-blank/buildEntryBlankProps.ts`
- Shared hooks from `features/_shared/hooks/`

## Source-of-truth files (read before coding)

| File | Purpose |
|---|---|
| `docs/design/claude_code_handoff/design_handoff_gazette/Gazette Reconciliation Notes.md` | **Read first.** |
| `.../README.md` | Visual system, motion, classifieds box spec |
| `.../Gazette Landing Page.html` | Landing mock — pay attention to the 3-column body |
| `.../Gazette Confirmation Email.html` | Email mock |
| `.../Gazette Entry Blank.html` | PDF mock |
| `.../Gazette Wizard Completion.html` | Wizard mock |

## Migration

**No migration required.** Gazette tokens are fixed.

## File tree to add (style-local only)

```
apps/myk9show/src/features/gazette/
├── components/
│   ├── GazetteHeading.tsx                  (Playfair Display, italic accent in brown)
│   ├── GazetteSectionHead.tsx              (double-rule + "SECTION A · TITLE")
│   ├── GazetteMasthead.tsx                 (edition strip + Playfair title + sub-strip)
│   ├── GazetteDropCap.tsx                  (72px Playfair, gz-ink)
│   ├── GazetteClassifiedBox.tsx            (bordered card with category caps)
│   └── GazetteDoubleRule.tsx               (4px double horizontal rule)
├── landing/
│   ├── GazetteLandingPage.tsx
│   ├── useGazetteLandingData.ts
│   ├── types.ts
│   ├── utils/dateFormat.ts
│   ├── sections/
│   │   ├── StickyNav.tsx                   (thin edition strip)
│   │   ├── MastheadSection.tsx             (the recognizable element)
│   │   ├── LeadArticleSection.tsx          (3-column drop-cap body — replaces Heritage Welcome)
│   │   ├── ParticularsSection.tsx
│   │   ├── JudgesSection.tsx
│   │   ├── RosterSection.tsx
│   │   ├── ScheduleSection.tsx             (3-col time/event/hall)
│   │   ├── ClassifiedsSection.tsx          (hotel, vet, awards, hospitality)
│   │   ├── OfficersSection.tsx
│   │   ├── FinalCtaSection.tsx
│   │   └── GazetteFooter.tsx
│   └── __tests__/
├── wizard/
│   ├── GazetteEntryReceived.tsx
│   └── __tests__/
├── entry-blank/
│   ├── GazetteEntryBlankDocument.tsx
│   ├── GazetteEntryBlankButton.tsx
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
│   ├── GazetteHeading.test.tsx
│   ├── GazetteMasthead.test.tsx
│   ├── GazetteDropCap.test.tsx
│   └── GazetteClassifiedBox.test.tsx
├── fonts.ts                                (Playfair Display + Source Serif 4 + IBM Plex Mono)
├── gazette.css                             (scoped under [data-gazette])
├── index.ts
└── tokens.ts

packages/email/src/
├── gazetteTokens.ts                        NEW
├── templates/GazetteConfirmationEmail.tsx  NEW
├── index.ts                                APPEND
└── types.ts                                APPEND

supabase/functions/send-confirmation-email/
├── gazette-email.ts                        NEW
└── gazette-email.test.ts                   NEW
```

**Approximate scope: ~35–40 files, ~3500–4500 lines.**

## PDF font registrations

Verify in `pdfFonts.ts`:
- `Playfair Display` already registered ✓
- `Source Serif 4` already registered ✓
- `IBM Plex Mono` already registered ✓ (aliased to JetBrains Mono)

Likely no `pdfFonts.ts` changes needed. Confirm with grep before assuming.

## Tests to ship (~30 minimum)

| File | Coverage | ~Lines |
|---|---|---|
| `__tests__/GazetteHeading.test.tsx` | Levels, italic brown accent, sizes | 60 |
| `__tests__/GazetteMasthead.test.tsx` | Edition strip, Playfair italic "*The* … *Gazette*", sub-strip with motto | 80 |
| `__tests__/GazetteDropCap.test.tsx` | First-letter extraction, font + size, ink color | 40 |
| `__tests__/GazetteClassifiedBox.test.tsx` | Category caps, italic title, body, dotted meta line | 60 |
| `landing/__tests__/useGazetteLandingData.test.ts` | Data assembly, judge dedup | 120 |
| `wizard/__tests__/GazetteEntryReceived.test.tsx` | Mirror Banner shape | 150 |
| `entry-blank/__tests__/GazetteEntryBlankDocument.test.tsx` | Section letters (A/B/C…), drop cap, header | 80 |
| `supabase/functions/send-confirmation-email/gazette-email.test.ts` | Output shape, XSS escaping, old-style figures | 200 |

## Open questions to resolve BEFORE writing code

1. **3-column body fallback** — `column-count: 3` collapses to single column under what breakpoint? Recommend **900px** (matches Banner / Monogram). Mobile single column with no column-rule.
2. **"Continued on §02" tail** — render literally as text or skip? Recommend **literal text** with anchor link to `#particulars` — preserves the newspaper feel.
3. **Letterpress texture opacity** — handoff explicitly warns against raising it. Lock at 0.018 in `gazette.css` and add a comment.
4. **Old-style figures in PDF** — does @react-pdf support `font-feature-settings`? **Recommend testing in a probe PDF early**; if not, fall back to lining figures with a comment.
5. **Edition meta in email** — render "VOL LXXIX · NO 3" header in the email or omit? Recommend **omit** — Outlook strips edition-strip layouts; the email leads with the show title directly.

## Effort estimate

~6–9 hours.

---

## Starter prompt to paste into the new Gazette conversation

```
Read docs/plan-gazette-style.md in this repo end-to-end — it's the contract for shipping the Gazette premium style end-to-end. This conversation runs in parallel with three siblings (Magazine / Poster / Field Guide).

Critical constraint: DO NOT touch the 6 dispatch files listed in the plan. Build only style-local files. Document required dispatch changes in your PR description under "Phase 3 wiring instructions" — a final integration session wires all 4 styles at once.

Start by:
1. Confirming you're on a fresh branch `claude/gazette-style` off main, in a worktree under .claude/worktrees/
2. Reading the plan doc + reconciliation notes + 4 design HTML mocks
3. Cloning `features/heritage/` as the structural template
4. Welcome section needs the most surgery — 3-column body with drop cap and "Continued on §02" tail
5. Test old-style figures in a probe PDF early — if @react-pdf doesn't support font-feature-settings, fall back to lining figures
6. Build style-local files only; commit each phase as you go
7. Run pnpm typecheck + vitest before pushing

CI is billing-blocked until 2026-06-01 — local typecheck + tests are the source of truth.
```
