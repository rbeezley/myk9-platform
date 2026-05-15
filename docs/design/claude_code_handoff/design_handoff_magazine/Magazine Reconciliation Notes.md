# Magazine — Codebase Reconciliation Notes

Companion to `README.md`. Magazine introduces **photographic asset infrastructure** which no other style has needed — this doc covers both the standard four-artifact port and the image-handling schema additions.

---

## Where Magazine files should land

Mirror the established pattern. Magazine adds an `images/` folder for asset-slot infrastructure:

```
apps/myk9show/src/features/magazine/
  components/
    MagazineCover.tsx               ← NEW: 4:5 photo slot + gradient fallback + caption
    MagazineJudgePortrait.tsx       ← NEW: 4:5 judge photo + initials overlay
    MagazinePullQuote.tsx           ← Bordered gold-gradient pull quote
    MagazineDropCap.tsx             ← Wraps lead paragraph with float drop cap
    MagazineSectionFolio.tsx        ← Smallcaps eyebrow with gold-gradient flanking rules
    MagazineHeading.tsx             ← Cormorant Garamond display + italic emphasis
    MagazineGoldRule.tsx            ← Inline gradient hairline component
  email/
    buildConfirmationProps.ts
  entry-blank/
    MagazineEntryBlankDocument.tsx
    MagazineEntryBlankButton.tsx
    buildEntryBlankProps.ts
    sections/
    types.ts
    index.ts
  hooks/
    (reuse shared hooks)
    useMagazineImageAssets.ts       ← NEW: resolves cover + portrait URLs with gradient fallback
  images/                            ← NEW directory
    magazineImageSchema.ts           ← Type defs for the four photo slots
    placeholderGradients.ts          ← Reusable gradient defs for fallback rendering
  landing/
    MagazineLandingPage.tsx
    useMagazineLandingData.ts
    types.ts
    sections/
      MagazineMasthead.tsx
      CoverSpread.tsx
      IssueStrip.tsx
      WelcomeSection.tsx              ← Has drop cap + pull quote
      JudgesSection.tsx               ← Uses MagazineJudgePortrait
      ParticularsSection.tsx
      RosterSection.tsx
      PlanSection.tsx
      OnTheDaySection.tsx
      OfficersSection.tsx
      FinalEditorialBand.tsx
      MagazineFooter.tsx
  wizard/
    MagazineEntryReceived.tsx
  fonts.ts
  magazine.css
  index.ts
  tokens.ts

packages/email/src/
  magazineTokens.ts
  templates/MagazineConfirmationEmail.tsx
  __tests__/MagazineConfirmationEmail.test.ts
```

## Image asset schema (NEW)

This is the only style where the schema needs extending. Add to `shows` table:

```sql
alter table public.shows
  add column magazine_cover_image_url text,
  add column magazine_judge_portrait_urls jsonb default '[]'::jsonb;

comment on column public.shows.magazine_cover_image_url is
  'Cover photograph for Magazine landing style. Optional. When null, the cover renders a gradient placeholder with the club monogram. 4:5 aspect ratio preferred; will be cropped to fit.';

comment on column public.shows.magazine_judge_portrait_urls is
  'Array of judge portrait URLs aligned by index to trials.judges_data. Optional per judge. Each slot falls back to an initials-on-gradient placeholder. 4:5 aspect ratio.';
```

The Magazine style is the **only** style that reads these columns. Other styles ignore them entirely.

Image asset rules:
- Stored in Supabase Storage; the columns hold full URLs (not paths)
- Max 4MB upload, validated client-side and server-side
- Cropped server-side to 4:5 aspect on upload (Sharp or equivalent)
- Three sizes generated: 1600w (hero), 800w (judge portrait), 320w (placeholder fallback during loading)
- Public-access bucket; no auth gating (these are publishing assets, not user data)

Admin UI: a new section on the show-edit page, gated by `show.landing_style === 'magazine'`. Drag-drop or file-picker upload, preview, replace, remove. **Out of scope for the design handoff** — covered as engineering's contract, not the visual design.

## Token map

### `apps/myk9show/src/features/magazine/tokens.ts`

```ts
export const magazineColors = {
  paper: '#f6f1e8',
  paperDeep: '#ece4d3',
  ink: '#1a1a1a',
  soft: '#2e2820',
  mute: '#7a6e58',
  quill: '#5c4f3a',
  gold1: '#c9a87c',
  gold2: '#a8814f',
  gold3: '#4a3826',
} as const;

export const magazineGradients = {
  goldRule: 'linear-gradient(90deg, #c9a87c, #a8814f)',
  goldEmphasis: 'linear-gradient(90deg, #c9a87c, #a8814f)',
  coverFallback: 'linear-gradient(135deg, #c9a87c 0%, #a8814f 45%, #4a3826 100%)',
  portraitFallback: 'linear-gradient(160deg, #c9a87c 0%, #8a6a45 60%, #4a3826 100%)',
  finalBand: 'linear-gradient(135deg, #4a3826 0%, #2e2820 60%, #1a1a1a 100%)',
} as const;

export const magazineTypography = {
  display: "'Cormorant Garamond', 'EB Garamond', Georgia, serif",
  body: "'Source Serif 4', Georgia, serif",
  meta: "'Inter Tight', system-ui, sans-serif",
} as const;

export const magazineDurations = {
  heroStagger: 150,
  heroFade: 900,
  coverFade: 1200,
  coverFadeDelay: 300,
  capacityBarFill: 1800,
  capacityBarDelay: 400,
} as const;
```

### `packages/email/src/magazineTokens.ts`

```ts
export const MZ = {
  INK: '#1a1a1a',
  PAPER: '#f6f1e8',
  PAPER_DEEP: '#ece4d3',
  GOLD1: '#c9a87c',
  GOLD2: '#a8814f',
  GOLD3: '#4a3826',
  QUILL: '#5c4f3a',
  MUTE: '#7a6e58',
  DISPLAY: "'Cormorant Garamond', Georgia, serif",
  BODY: "'Source Serif 4', Georgia, serif",
  META: "'Inter Tight', Arial, sans-serif",
} as const;
```

The Deno edge function needs a parallel `MZ` block.

## Gradient text in email — Outlook caveat

The web landing uses `-webkit-background-clip: text` to paint gold-gradient text on the italic emphasis spans. **Outlook strips this** and falls back to whatever `color` is set. The email template:

- Always uses solid color (`color: var(--mz-gold-3)`) on italic emphasis — never gradient-clipped
- Uses a 2px `linear-gradient` `<div>` for the gold rule, NOT `background-clip` on text
- Inlines all `<style>` declarations into element `style=""` attrs

Test snapshot in `__tests__/MagazineConfirmationEmail.test.ts` should explicitly assert:
- No `background-clip: text` anywhere in rendered HTML
- No `-webkit-background-clip` in inline styles
- All gold emphasis text uses `color: #4a3826` directly

## Wizard completion: prop-interface parity

`MagazineEntryReceived.tsx` uses **same** `HeritageEntryReceivedProps` interface, no extensions. The Magazine style doesn't need monogram letters or brand color overrides — its identity is gradient + Cormorant, both universal.

## Migration changes required

### 1. Expand `shows.landing_style` constraint

Add `'magazine'`. (If batched with the other remaining styles in Option B per the Headline notes, this is a no-op.)

### 2. Add image columns (above)

`magazine_cover_image_url` and `magazine_judge_portrait_urls` per the schema above.

### 3. Email template registration

Add `MagazineConfirmationEmail` export. Update send-function switch.

### 4. Supabase Storage bucket

```sql
insert into storage.buckets (id, name, public)
values ('magazine-images', 'magazine-images', true)
on conflict (id) do nothing;

create policy "Public read magazine images"
  on storage.objects for select
  using (bucket_id = 'magazine-images');

create policy "Authenticated upload magazine images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'magazine-images');

create policy "Owners delete magazine images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'magazine-images' and owner = auth.uid());
```

(Adjust to match how other show-related assets are stored if there's an existing pattern.)

## Tests to mirror

| Heritage test file | Magazine equivalent |
|---|---|
| `__tests__/HeritageOrnamentRule.test.tsx` | `MagazineGoldRule.test.tsx` |
| `__tests__/HeritageSectionFolio.test.tsx` | `MagazineSectionFolio.test.tsx` |
| `__tests__/HeritageHeading.test.tsx` | `MagazineHeading.test.tsx` |
| — | `MagazineCover.test.tsx` (renders image when URL present; renders gradient + monogram fallback when null; aspect ratio preserved at all viewports) |
| — | `MagazineJudgePortrait.test.tsx` (same pattern as cover; initials displayed correctly) |
| — | `MagazineDropCap.test.tsx` (wraps first letter only; respects `prefers-reduced-motion`; falls back gracefully when paragraph is empty) |
| — | `MagazinePullQuote.test.tsx` |
| `__tests__/landingUtils.test.ts` | `magazine/landing/__tests__/landingUtils.test.ts` |
| `email/__tests__/HeritageConfirmationEmail.test.ts` | `email/__tests__/MagazineConfirmationEmail.test.ts` + Outlook-gradient assertions (above) |
| `wizard/__tests__/HeritageEntryReceived.test.tsx` | `wizard/__tests__/MagazineEntryReceived.test.tsx` |

Plus `useMagazineImageAssets.test.ts`:
- Returns cover URL when set
- Returns null cover when unset (component decides fallback)
- Returns judge portrait array aligned to judges_data length
- Pads missing portraits with nulls so indexes align
- Validates URLs are HTTPS (security check)

Plus Playwright visual snapshots at 375/768/1280 in `tests/visual-references/magazine/`, **including one variant with images uploaded and one without** to catch fallback rendering.

## Open questions for engineering

1. **Image storage location** — does the platform already have a "show assets" bucket? If so, Magazine images should live there, not in a Magazine-specific bucket. The schema above is a placeholder.
2. **Image upload UX** — where in the show-edit flow does the magazine-image picker appear? My recommendation: a "Magazine assets" tab that appears only when `landing_style === 'magazine'`. Out of scope for design; engineering's call.
3. **Image processing** — Sharp / ImageMagick / Cloudflare Images / Supabase transformations? Each has different ergonomics. Recommend Supabase's built-in `width/height/resize=cover` URL params if available.
4. **Drop cap on Safari iOS** — `float: left` with `font-size: 88px` interacts strangely with iOS's text scaling. Test on iPhone before shipping; may need `font-size-adjust` workaround.
5. **Cover image aspect** — 4:5 is portrait-ish. Some clubs may upload landscape banners. Cropping to 4:5 will chop them. Should the admin UI offer a crop step at upload, or just chop center?

## Files in the design handoff

| File | Implementation target |
|---|---|
| `Magazine Landing Page.html` | `features/magazine/landing/MagazineLandingPage.tsx` + sections |
| `Magazine Entry Blank.html` | `features/magazine/entry-blank/MagazineEntryBlankDocument.tsx` |
| `Magazine Confirmation Email.html` | `packages/email/src/templates/MagazineConfirmationEmail.tsx` |
| `Magazine Wizard Completion.html` | `features/magazine/wizard/MagazineEntryReceived.tsx` |
| `README.md` | Design system, tokens, motion vocabulary, photographic-asset rationale |
| `Magazine Reconciliation Notes.md` | This file — image schema, storage policies, Outlook fallback |
