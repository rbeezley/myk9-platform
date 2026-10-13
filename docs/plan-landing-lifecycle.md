# Landing Page Lifecycle Rebuild Implementation Plan

> **Status:** Active

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the pre-launch waitlist landing page at `/` with a launch page that recruits clubs first. A two-sided timeline tells the life of one show: what you do on the left, what the other side is doing ("Meanwhile") on the right. An audience switch opens on "I'm running a show" and offers "I'm entering a show". Explainer slides animate the key screenshots.

**Design reference:** canvas version **D**, "A's hero + B's timeline + audience switch" (https://claude.ai/artifact/VaDuhw1AHVTZroApgs9VJb, file `project/Combined.dc.html`). It is a mockup: copy, ordering, sizes and explainer coordinates carry over; its code does not. Two of its techniques are replaced here: the moving spotlight becomes cross-faded fixed boxes (opacity only), and scroll progress uses IntersectionObserver against the real document scroll, which the canvas frame could not demonstrate.

**Architecture:** New sections live in `apps/myk9show/src/components/landing/lifecycle/`. Both stories (club and exhibitor) are typed data in `lifecycleStories.ts`, so copy rules, image budgets and explainer geometry are tested against data and rendered output. `LifecycleTimeline` holds the audience state and renders one `TimelineStep` per step. `useTimelineProgress` reports which steps the reader has reached; dots and line segments fill up to the reader's position and un-fill when they scroll back up, while step content reveals once. `ScreenshotExplainer` cross-fades a highlight box and caption per step, with Pause and Next, auto-advancing only while on screen. `components/landing/v2/` is deleted at the end, except `ClubOnboarding`, which moves into the new folder.

**Tech Stack:** React 19 + TypeScript, react-router `Link`, plain CSS scoped under `.landing-v2` (tokens from `src/styles/landing.css` and `src/index.css`), vitest + the custom `render` from `src/test/utils/testUtils.tsx`, Playwright (`src/test/e2e/`).

**Spec:** [`docs/qa/landing-page-ux-audit.md`](qa/landing-page-ux-audit.md) (findings, measured against scroll-craft's taste/feel/verify checklists and [`docs/INTENT.md`](INTENT.md)), plus the owner's canvas review on 2026-10-13 recorded in the decisions below.

## Decisions taken

| #   | Decision                                                                                                                                                                                                                                               | In this plan                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Both waitlist forms go. Today a "Club / secretary" signup inserts into `platform_waitlist`, and a DB trigger sends an early-access invite (`send-waitlist-invite`). After launch, clubs use the existing `ClubOnboarding` request flow.                | Remove the forms. Leave the table, trigger and edge function in place and unused. File a follow-up to delete them.               |
| D2  | Product claims on the current page that cannot be traced to a shipped, user-visible feature are dropped, not reworded.                                                                                                                                 | Task 1 decides each claim from evidence. "Thirteen years of placements" is already DROPPED (no legacy results were imported).    |
| D3  | The page names no launch date and no version number.                                                                                                                                                                                                   | Timeless copy                                                                                                                    |
| D4  | The Ziva & Tera photo stays, as a full-width band (A's hero), without the caption pill.                                                                                                                                                                | Keep                                                                                                                             |
| D5  | Online entries are off for some shows (per-show switch, MYK9-979).                                                                                                                                                                                     | Copy says "enter online where the club accepts it"                                                                               |
| D6  | **The homepage recruits clubs first (owner, 2026-10-13).** Most exhibitors arrive on a specific show page through their club's link, and with few clubs signed up "Find a show" leads to a short list.                                                 | "Bring your club" is the primary CTA in header, hero and close; the switch opens on the club story. Revisit when `/shows` fills. |
| D7  | **Layout is canvas version D (owner, 2026-10-13):** A's hero, B's two-sided timeline, the audience switch, compact quiet steps, and show day as the one peak on a white panel.                                                                         | Tasks 4 to 6                                                                                                                     |
| D8  | **Motion explains, it does not decorate.** Explainer slides on three screenshots (club show day, exhibitor show day, exhibitor entries). Scroll progress: dots and line fill to the reader's position and un-fill on scroll up; content rises in once. | Tasks 3 and 5                                                                                                                    |

**Duplication check (CLAUDE.md § consolidate):** No new route and no new form. "Find a show" links the existing public `/shows`. "Bring your club" anchors to the re-housed `ClubOnboarding` (`#get-started`, which `Home.tsx` already deep-links). The rebuild deletes about 900 lines of `landing/v2` components plus the CSS rules only they used.

## Global Constraints

- No em dashes (`—`) and no arrow glyphs (`→`) anywhere in rendered landing copy.
- Text never below 14px; body copy 16px or more (INTENT § Readable font sizes).
- Every link, button and input is at least 44px tall.
- Text contrast is at least 4.5:1, or at least 3:1 for text 24px and up, measured on the rendered section ground. Never dim text with `opacity`. Tokens that exist under `.landing-v2`: `--ink-900` (headings), `--stone-700` (body), `--stone-500` (muted, #6b6358), `--terracotta-600` (#9c4127), `--terracotta-700`, `--ivory-50` (canvas), `--border`. There is no `--ink-soft` or `--canvas`.
- At most two font families on rendered landing text: Playfair Display (display) and Montserrat (text).
- Hero: H1 at most 2 lines at 390px and at 1440px; lede at most 20 words; primary CTA visible without scrolling at 390x844.
- CTA order everywhere (D6): **Bring your club** is the filled primary; **Find a show** is the outlined secondary. Exactly these two labels; no "Browse shows", "Join the waitlist" or "Run your next trial".
- Motion animates only `transform` and `opacity` (plus colour on the dots), under 300ms for UI state and up to 700ms for the line fill, no `transition: all`, no scroll-jacking, no video, no generated imagery.
- Auto-advancing explainers have visible Pause and Next controls (WCAG 2.2.2). They advance only while on screen, and start paused under reduced motion. Their caption is `aria-live="off"` while playing and `"polite"` while paused, so screen readers are not interrupted every few seconds.
- Under `prefers-reduced-motion: reduce`: no transitions, all content revealed immediately, explainers paused. Dots still change colour, since that is state, not motion.
- No words "waitlist", "pre-launch", "launching" or a version string on the rendered page.
- Screenshots are real product captures of seeded `@myk9t.com` demo data, with real-looking names (no "Unknown" dog, no "Test Exhibitor"). Each image is 250 KB or less, has `width`/`height` set, and has `loading="lazy"` (hero photo excepted). Display width follows capture shape: phone captures never wider than 300px.
- Keep every new file under 500 lines. Run `pnpm qa:code-quality-ratchet` before pushing.
- Page length 8 to 14 viewport heights at 390x844.

## Review Focus

1. **Scrolling back up.** The dots and line describe where the reader is, so they must un-fill when the reader scrolls back above a step, while revealed content stays revealed. _Test:_ Task 3 unit test `un-reaches a step when its dot returns below the middle`; Task 7 e2e `dots follow the reader both ways`.
2. **Switching audience mid-page.** Clicking the switch replaces every title, body and screenshot. Progress must stay correct and nothing may flash hidden. _Test:_ Task 5 `switching audience keeps revealed steps visible`; Task 7 e2e clicks the switch at step 4 and asserts dots 1 to 4 are still filled.
3. **Explainers off screen.** Three explainers on one page must not all tick at once, and must not tick in background tabs. _Test:_ Task 4 `does not advance while off screen`.
4. **Old deep links.** `/#get-started` must still land on the club request form; `/#closing` and `/#features` must fail soft. _Test:_ Task 6 Home tests.
5. **PR smoke already asserts on this page.** `src/test/e2e/simple-connectivity.spec.ts:13` expects a link named "Browse shows", and `a11y-smoke.spec.ts` runs axe on `/`. _Test:_ Task 6 Step 10 updates the spec; Task 7 Step 3 runs both.
6. **PWA precache bloat.** `vite.config.ts` precaches `**/*.png,webp`. _Test:_ Task 2 adds `globIgnores: ['landing/**']` and proves it in a real build.
7. [ADDED] **Explainer mid-sequence when the audience switches.** Club show day has 5 explainer steps and exhibitor show day has 3, and both render in the same slot. Without a reset, a reader on club step 4 who switches reads `steps[3]` of a 3-item list and the page crashes. _Test:_ Task 5 `switching audience mid-explainer does not crash`.
8. [ADDED] **Signed-in return from sign-up.** `ClubOnboarding` sends new club officers to sign in or sign up, then back to `/?onboarding=true#get-started`. `HomeRedirect` (`src/routerComponents.tsx:33`) renders `Home` for a signed-in user on that URL, with the app header present. The landing page must work there: one header pinned under the app header, and the club form in view. _Test:_ Task 8 Step 3 walks it in a browser; Task 6 Step 9b pins the header offset per case.
9. [ADDED] **The blank 48px band above the header (audit Low finding).** `AppHeader` returns null for a guest on `/` (`AppHeader.tsx:120`), but `SidebarLayout`'s `<main>` still pads for it (`SidebarLayout.tsx:220`), and `.l-hdr` sticks at `--app-top-inset`. _Test:_ Task 6 Step 9b, and Task 7 `guest header sits at the top with no blank band`.
10. [ADDED] **Broken share preview.** `index.html` points `og:image`/`twitter:image` at `/og-image.jpg`, which does not exist. Production serves the SPA's HTML for it (checked 2026-10-13), so links shared to Facebook or iMessage show no image. _Test:_ Task 2 makes the file; Task 7 `og image is a real image`.
11. [ADDED] **Hero weight on show-ground signal.** `hero-ziva-tera.jpg` is 1963x1711 and 800 KB, loaded eagerly. _Test:_ Task 2 asserts the resized variants are 250 KB or less; Task 6 serves them through `srcSet`.

---

### Task 1: Verify claims, finalise screenshots

No code. This produces the evidence the copy in Task 2 depends on.

**Files:**

- Create: `docs/qa/landing-lifecycle-evidence.md`

- [ ] **Step 1: Decide each claim.** For each row, find the shipped user-visible surface (route plus component). Record KEEP with the path, or DROP with the reason.

| Claim used in the copy                                                    | Where to look                                                                                                                            |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Exhibitors follow their classes on show day "even with one bar of signal" | My Entries offline behaviour: `src/features/show-today/`, replication scopes for exhibitor data. If not offline-capable, drop the phrase |
| Judges score at the ring with no signal; scores sync when it returns      | `/at-show` (INTENT § `/at-show`). KEEP                                                                                                   |
| Entries are checked against class limits                                  | Judge-day capacity enforcement (server-side since 2026-07-12)                                                                            |
| Start from last year's show                                               | Show clone in the create-show wizard                                                                                                     |
| Placements worked out from scores; club chooses when results go public    | Placement calculation + results visibility control (`/shows/:id/results-control`)                                                        |
| Every Q stays on the dog's record                                         | Dog record / entry history surfaces                                                                                                      |
| Thirteen years of placements                                              | **DROP (owner, 2026-10-13):** no legacy results were imported                                                                            |

- [ ] **Step 2: Recapture and freshness-check screenshots.** Use the `screenshot-docs` skill. Compare each against the current UI, and recapture any that drifted. **Recapture J-04 with a named demo dog and handler** (the guide copy shows "Unknown" and "Test Exhibitor"). The list:

| Id   | Shape   | Used for                     | Size at capture |
| ---- | ------- | ---------------------------- | --------------- |
| S-02 | desktop | club step 1                  | 1280x800        |
| S-07 | desktop | club step 2                  | 1280x800        |
| S-12 | desktop | club step 3                  | 1280x800        |
| J-04 | tablet  | club step 4 (explainer)      | 768x1024        |
| S-20 | desktop | club step 5                  | 1280x800        |
| E-01 | desktop | exhibitor step 1             | 1280x800        |
| E-02 | desktop | exhibitor step 2 (explainer) | 1280x800        |
| E-12 | phone   | exhibitor step 3             | 390x844         |
| E-13 | phone   | exhibitor step 4 (explainer) | 390x844         |
| E-17 | phone   | exhibitor step 5             | 390x844         |
| E-16 | phone   | exhibitor step 6             | 390x844         |

- [ ] **Step 3: Re-measure explainer boxes** on any recaptured image (percent of image width and height, box edges on the target control). Record them in the evidence file. The canvas values in Task 2 are for the current captures.

- [ ] **Step 4: Write `docs/qa/landing-lifecycle-evidence.md`** with the KEEP/DROP table, the screenshot list (file, captured date, recaptured yes/no) and any re-measured boxes.

- [ ] **Step 5: Commit**

```bash
git add docs/qa/landing-lifecycle-evidence.md
git commit -m "docs(landing): claim evidence and screenshot list for lifecycle rebuild"
```

---

### Task 2: Story data, assets and copy guards

**Files:**

- Create: `apps/myk9show/src/components/landing/lifecycle/lifecycleStories.ts`
- Create: `apps/myk9show/src/components/landing/lifecycle/__tests__/lifecycleStories.test.ts`
- Create: `apps/myk9show/public/landing/stages/*.png`
- Create: [ADDED] `apps/myk9show/public/hero-ziva-tera-1600.jpg`, `apps/myk9show/public/hero-ziva-tera-800.jpg`, `apps/myk9show/public/og-image.jpg`
- Modify: `apps/myk9show/vite.config.ts:60` (add `globIgnores`)

**Interfaces (produced):**

```ts
export type Audience = 'club' | 'exhibitor';
export type StepId = 'setup' | 'entries' | 'before' | 'showday' | 'results' | 'after';
export type ShotShape = 'phone' | 'tablet' | 'desktop';
export type Shot = {
  src: `/landing/stages/${string}.png`;
  alt: string;
  width: number;
  height: number;
  shape: ShotShape;
};
export type ExplainerStep = {
  x: number;
  y: number;
  w: number;
  h: number; // percent of the image; w === 0 means "no highlight, dim only"
  caption: string;
  badge?: { text: string; tone: 'amber' | 'green' };
};
export type StoryStep = {
  id: StepId;
  title: string;
  body: string;
  shot: Shot | null;
  explainer?: readonly ExplainerStep[];
  meanwhile: string;
  meanwhileShot: Shot | null;
  peak?: true;
};
export const DEFAULT_AUDIENCE: Audience; // 'club' (D6)
export const AUDIENCE_LABEL: Record<Audience, string>; // switch button text
export const PEAK_LEAD: Record<Audience, string>;
export const STORY_HEADING: Record<Audience, string>;
export const MEANWHILE_LABEL: Record<Audience, string>;
export const STORIES: Record<Audience, readonly StoryStep[]>;
export const BANNED_COPY: readonly RegExp[];
```

- [ ] **Step 1: Copy and size the assets.** Copy each Task 1 capture to `public/landing/stages/<id-lowercase>.png` (for example `s-02.png`). Cap desktop captures at 1200px wide, and leave phone and tablet captures at their size:

```bash
cd apps/myk9show/public/landing/stages
for f in s-02 s-07 s-12 s-20 e-01 e-02; do sips -Z 1200 "$f.png" >/dev/null; done
du -k *.png   # every file must be <= 250
sips -g pixelWidth -g pixelHeight *.png
```

[ADDED] Make two lighter hero variants and the missing share image from the same photo. The source is 1963x1711. The share image is 1200 wide and cropped to 630 tall, centred:

```bash
cd apps/myk9show/public
sips -s format jpeg -s formatOptions 72 -Z 1600 hero-ziva-tera.jpg --out hero-ziva-tera-1600.jpg
sips -s format jpeg -s formatOptions 72 -Z 800 hero-ziva-tera.jpg --out hero-ziva-tera-800.jpg
sips -s format jpeg -s formatOptions 75 --resampleWidth 1200 hero-ziva-tera.jpg --out og-image.jpg
sips --cropToHeightWidth 630 1200 og-image.jpg
du -k hero-ziva-tera-1600.jpg hero-ziva-tera-800.jpg og-image.jpg   # each <= 250
sips -g pixelWidth -g pixelHeight og-image.jpg   # expect 1200 x 630
```

If `-Z 1600` at quality 72 comes out over 250 KB, step the quality down by 5 until it fits. `.jpg` is not in the precache `globPatterns`, so none of these reach the service worker.

- [ ] **Step 2: Write the failing test** `__tests__/lifecycleStories.test.ts`:

```ts
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AUDIENCE_LABEL,
  BANNED_COPY,
  DEFAULT_AUDIENCE,
  MEANWHILE_LABEL,
  PEAK_LEAD,
  STORIES,
  STORY_HEADING,
  type Audience,
  type Shot,
  type StoryStep,
} from '../lifecycleStories';

const appRoot = resolve(__dirname, '../../../../..');
const publicDir = resolve(appRoot, 'public');
const AUDIENCES: Audience[] = ['club', 'exhibitor'];

const shotsOf = (s: StoryStep) => [s.shot, s.meanwhileShot].filter((x): x is Shot => x !== null);
const copyOf = (s: StoryStep) => [
  s.title,
  s.body,
  s.meanwhile,
  ...shotsOf(s).map(x => x.alt),
  ...(s.explainer ?? []).flatMap(e => [e.caption, e.badge?.text ?? '']),
];

describe('STORIES', () => {
  it('opens on the club story (homepage recruits clubs first)', () => {
    expect(DEFAULT_AUDIENCE).toBe('club');
  });

  it('tells the same six steps, in the same order, for both audiences', () => {
    const ids = ['setup', 'entries', 'before', 'showday', 'results', 'after'];
    for (const a of AUDIENCES) expect(STORIES[a].map(s => s.id)).toEqual(ids);
  });

  it('has exactly one peak per audience, and it is show day', () => {
    for (const a of AUDIENCES) {
      expect(STORIES[a].filter(s => s.peak).map(s => s.id)).toEqual(['showday']);
    }
  });

  it('points every screenshot at a real file of 250 KB or less with real alt text', () => {
    for (const a of AUDIENCES) {
      for (const shot of STORIES[a].flatMap(shotsOf)) {
        const file = resolve(publicDir, `.${shot.src}`);
        expect(existsSync(file), shot.src).toBe(true);
        expect(statSync(file).size, shot.src).toBeLessThanOrEqual(250 * 1024);
        expect(shot.alt.length, shot.src).toBeGreaterThan(10);
      }
    }
  });

  it('keeps every explainer box inside its image and gives each a caption', () => {
    for (const a of AUDIENCES) {
      for (const s of STORIES[a]) {
        if (!s.explainer) continue;
        expect(s.shot, `${a}/${s.id} explainer needs a shot`).not.toBeNull();
        expect(s.explainer.length).toBeGreaterThanOrEqual(2);
        for (const e of s.explainer) {
          expect(e.x).toBeGreaterThanOrEqual(0);
          expect(e.y).toBeGreaterThanOrEqual(0);
          expect(e.x + e.w).toBeLessThanOrEqual(100);
          expect(e.y + e.h).toBeLessThanOrEqual(100);
          expect(e.caption.length).toBeGreaterThan(5);
        }
      }
    }
  });

  it('contains no banned copy anywhere in the data', () => {
    const labels = [
      ...Object.values(AUDIENCE_LABEL),
      ...Object.values(PEAK_LEAD),
      ...Object.values(STORY_HEADING),
      ...Object.values(MEANWHILE_LABEL),
    ];
    const all = [...labels, ...AUDIENCES.flatMap(a => STORIES[a].flatMap(copyOf))];
    for (const text of all) for (const re of BANNED_COPY) expect(text).not.toMatch(re);
  });

  // [ADDED] Review Focus 10 and 11: share image exists; hero variants are light enough for show-ground signal.
  it('ships a real share image and light hero variants', () => {
    for (const [name, maxKb] of [
      ['og-image.jpg', 250],
      ['hero-ziva-tera-1600.jpg', 250],
      ['hero-ziva-tera-800.jpg', 120],
    ] as const) {
      const file = resolve(publicDir, name);
      expect(existsSync(file), name).toBe(true);
      expect(statSync(file).size, name).toBeLessThanOrEqual(maxKb * 1024);
      expect(readFileSync(file).subarray(0, 3).toString('hex'), name).toBe('ffd8ff'); // a JPEG, not HTML
    }
  });

  it('keeps landing screenshots out of the service-worker precache', () => {
    const config = readFileSync(resolve(appRoot, 'vite.config.ts'), 'utf8');
    expect(config).toMatch(/globIgnores:\s*\[[^\]]*'landing\/\*\*'/);
  });
});
```

- [ ] **Step 3: Run it red.** Run `cd apps/myk9show && pnpm vitest run src/components/landing/lifecycle/__tests__/lifecycleStories.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 4: Write `lifecycleStories.ts`.** Fill `width`/`height` from Step 1, apply Task 1's KEEP/DROP decisions, and use Task 1's re-measured boxes where an image was recaptured.

```ts
// Copy, screenshots and explainer steps for the landing page's show-lifecycle timeline.
// Every claim here must have a KEEP row in docs/qa/landing-lifecycle-evidence.md.
// Copy rules are enforced by BANNED_COPY in lifecycleStories.test.ts and on the rendered
// page in Home.test.tsx. Design reference: canvas version D (docs/plan-landing-lifecycle.md).

export type Audience = 'club' | 'exhibitor';
export type StepId = 'setup' | 'entries' | 'before' | 'showday' | 'results' | 'after';
export type ShotShape = 'phone' | 'tablet' | 'desktop';
export type Shot = {
  src: `/landing/stages/${string}.png`;
  alt: string;
  width: number;
  height: number;
  shape: ShotShape;
};
export type ExplainerStep = {
  x: number;
  y: number;
  w: number;
  h: number;
  caption: string;
  badge?: { text: string; tone: 'amber' | 'green' };
};
export type StoryStep = {
  id: StepId;
  title: string;
  body: string;
  shot: Shot | null;
  explainer?: readonly ExplainerStep[];
  meanwhile: string;
  meanwhileShot: Shot | null;
  peak?: true;
};

export const BANNED_COPY: readonly RegExp[] = [
  /—/,
  /→/,
  /waitlist/i,
  /pre-launch/i,
  /launching/i,
  /\bv\d+\.\d+/,
];

// INTENT: clubs first at launch (owner decision 2026-10-13). Flip when /shows has enough shows.
export const DEFAULT_AUDIENCE: Audience = 'club';

export const AUDIENCE_LABEL: Record<Audience, string> = {
  club: 'I’m running a show',
  exhibitor: 'I’m entering a show',
};
export const STORY_HEADING: Record<Audience, string> = {
  club: 'Your show, step by step',
  exhibitor: 'Your show weekend, step by step',
};
export const MEANWHILE_LABEL: Record<Audience, string> = {
  club: 'Meanwhile, your exhibitors',
  exhibitor: 'Meanwhile, the club',
};
export const PEAK_LEAD: Record<Audience, string> = {
  club: 'Then show day arrives, and the venue has no signal.',
  exhibitor: 'Then it’s show day.',
};

const desktop = (id: string, alt: string): Shot => ({
  src: `/landing/stages/${id}.png`,
  alt,
  width: 1200,
  height: 750,
  shape: 'desktop',
});
const phone = (id: string, alt: string): Shot => ({
  src: `/landing/stages/${id}.png`,
  alt,
  width: 390,
  height: 844,
  shape: 'phone',
});
const tablet = (id: string, alt: string): Shot => ({
  src: `/landing/stages/${id}.png`,
  alt,
  width: 768,
  height: 1024,
  shape: 'tablet',
});

const SHOTS = {
  's-02': desktop('s-02', 'Create Show wizard, first step'),
  's-07': desktop('s-07', 'Entry Management showing entries that need review'),
  's-12': desktop('s-12', 'Check-in sheet report'),
  's-20': desktop('s-20', 'Results visibility settings for a show'),
  'j-04': tablet('j-04', 'Judge scoresheet on a tablet with the timer running'),
  'e-01': desktop('e-01', 'Upcoming shows list with entry status'),
  'e-02': desktop('e-02', 'Public show page with the Enter this show button'),
  'e-12': phone('e-12', 'Class running order with armband number on a phone'),
  'e-13': phone('e-13', 'My Entries on a phone with the Show Today banner'),
  'e-17': phone('e-17', 'Class results with the placement table on a phone'),
  'e-16': phone('e-16', 'Entry card with a Q result badge on a phone'),
} as const;

const CLUB_SHOW_DAY: readonly ExplainerStep[] = [
  {
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    caption: 'The venue has no signal. The judge keeps going.',
    badge: { text: 'No signal', tone: 'amber' },
  },
  {
    x: 8,
    y: 18.5,
    w: 84,
    h: 24,
    caption: 'Time the search',
    badge: { text: 'No signal', tone: 'amber' },
  },
  {
    x: 27.5,
    y: 52.5,
    w: 14,
    h: 5.5,
    caption: 'Tap Q, NQ, Absent or Excused',
    badge: { text: 'No signal', tone: 'amber' },
  },
  {
    x: 50,
    y: 59.8,
    w: 42.5,
    h: 6.6,
    caption: 'Saved on the tablet',
    badge: { text: '3 scores waiting', tone: 'amber' },
  },
  {
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    caption: 'Signal comes back. Every score syncs on its own.',
    badge: { text: 'Back online · 3 synced', tone: 'green' },
  },
];
const EXHIBITOR_ENTRIES: readonly ExplainerStep[] = [
  { x: 11, y: 67, w: 78, h: 16, caption: 'Dates, venue and trials, all on the show page' },
  { x: 11, y: 85.5, w: 16, h: 10, caption: 'One button to enter' },
  { x: 50.5, y: 87.5, w: 15, h: 6, caption: 'You always know when entries close' },
];
const EXHIBITOR_SHOW_DAY: readonly ExplainerStep[] = [
  { x: 5, y: 32.5, w: 90, h: 23, caption: 'Show day is here: your first class time and entries' },
  { x: 10, y: 44.8, w: 49, h: 7, caption: 'One tap to today’s classes' },
  { x: 5, y: 87, w: 90, h: 12.5, caption: 'Each dog’s classes for the day' },
];

export const STORIES: Record<Audience, readonly StoryStep[]> = {
  club: [
    {
      id: 'setup',
      title: 'Set up the show',
      body: 'Classes, levels and qualifying rules for AKC, UKC and ASCA are built in. Start from last year’s show and change what is new.',
      shot: SHOTS['s-02'],
      meanwhile: 'Exhibitors can find your show and read the premium list as soon as you publish.',
      meanwhileShot: SHOTS['e-01'],
    },
    {
      id: 'entries',
      title: 'Entries open',
      body: 'Entries arrive in one list, already checked against class limits. Nothing to re-type.',
      shot: SHOTS['s-07'],
      meanwhile: 'Exhibitors enter online in a few minutes, with their dogs saved.',
      meanwhileShot: SHOTS['e-02'],
    },
    {
      id: 'before',
      title: 'Before show day',
      body: 'Running orders, check-in sheets and armbands come from the entries you already have.',
      shot: SHOTS['s-12'],
      meanwhile: 'Exhibitors see their armband and their place in the running order.',
      meanwhileShot: SHOTS['e-12'],
    },
    {
      id: 'showday',
      peak: true,
      title: 'Show day',
      body: 'Judges score at the ring on a tablet, even with no signal. Scores catch up on their own when the connection comes back.',
      shot: SHOTS['j-04'],
      explainer: CLUB_SHOW_DAY,
      meanwhile: 'Exhibitors check in and follow their classes from their phones.',
      meanwhileShot: SHOTS['e-13'],
    },
    {
      id: 'results',
      title: 'Results',
      body: 'Placements are worked out from the scores. You choose when results go public.',
      shot: SHOTS['s-20'],
      meanwhile: 'Each exhibitor sees their dog’s placement the moment you release it.',
      meanwhileShot: SHOTS['e-17'],
    },
    {
      id: 'after',
      title: 'After the show',
      body: 'Every result is already recorded. Nothing to re-key.',
      shot: null,
      meanwhile: 'Every Q stays on each dog’s record, show after show.',
      meanwhileShot: SHOTS['e-16'],
    },
  ],
  exhibitor: [
    {
      id: 'setup',
      title: 'Find a show',
      body: 'Browse upcoming scent work shows by registry and date. Every show page has the premium list, classes and judges.',
      shot: SHOTS['e-01'],
      meanwhile: 'The club sets up the show, with AKC, UKC or ASCA rules already built in.',
      meanwhileShot: SHOTS['s-02'],
    },
    {
      id: 'entries',
      title: 'Enter in a few minutes',
      body: 'Pick your classes and enter online where the club accepts it. Your dogs are saved for next time.',
      shot: SHOTS['e-02'],
      explainer: EXHIBITOR_ENTRIES,
      meanwhile: 'Entries arrive in one list, already checked against class limits.',
      meanwhileShot: SHOTS['s-07'],
    },
    {
      id: 'before',
      title: 'Know where to be',
      body: 'See your armband number and where your dog sits in the running order.',
      shot: SHOTS['e-12'],
      meanwhile: 'Running orders, check-in sheets and armbands come straight from the entries.',
      meanwhileShot: SHOTS['s-12'],
    },
    {
      id: 'showday',
      peak: true,
      title: 'Show day',
      body: 'Check in and follow your classes from your phone, even with one bar of signal.',
      shot: SHOTS['e-13'],
      explainer: EXHIBITOR_SHOW_DAY,
      meanwhile: 'Judges score at the ring on a tablet, even with no signal at all.',
      meanwhileShot: SHOTS['j-04'],
    },
    {
      id: 'results',
      title: 'There’s your placement',
      body: 'Your dog’s placement shows up as soon as the club releases results.',
      shot: SHOTS['e-17'],
      meanwhile:
        'Placements are worked out from the scores, and the club chooses when to release them.',
      meanwhileShot: SHOTS['s-20'],
    },
    {
      id: 'after',
      title: 'Every Q on your dog’s record',
      body: 'Qualifying runs stay on your dog’s record, show after show.',
      shot: SHOTS['e-16'],
      meanwhile: 'The results are already recorded, with nothing to re-type.',
      meanwhileShot: null,
    },
  ],
};
```

If Task 1 drops "even with one bar of signal", end that body at "from your phone." The test does not need to change.

- [ ] **Step 5: Keep landing images out of the PWA precache.** In `apps/myk9show/vite.config.ts`, next to `globPatterns` (line 60), add:

```ts
        globIgnores: ['landing/**'],
```

- [ ] **Step 6: Run green.** Same command; expected PASS (8 tests).

- [ ] **Step 7: Prove the precache exclusion in a real build**

```bash
cd apps/myk9show && pnpm build > ../../.logs/landing-build.log 2>&1; echo "EXIT=$?"
grep -c "landing/stages" dist/sw.js   # expected: 0
```

- [ ] **Step 8: Commit**

```bash
git add apps/myk9show/src/components/landing/lifecycle apps/myk9show/public/landing apps/myk9show/vite.config.ts
git commit -m "feat(landing): club and exhibitor show stories, screenshots and copy guards"
```

---

### Task 3: `useTimelineProgress` hook

**Files:**

- Create: `apps/myk9show/src/components/landing/lifecycle/useTimelineProgress.ts`
- Test: `apps/myk9show/src/components/landing/lifecycle/__tests__/useTimelineProgress.test.tsx`

**Interfaces:**

- Consumes: `StepId` (Task 2).
- Produces: `export function useTimelineProgress(ids: readonly string[]): { reached: number; isRevealed: (id: string) => boolean }`. The hook watches elements `#<id>-dot` (progress) and `#<id>` (reveal). `reached` is how many steps, counted from the top, have their dot at or above the middle of the viewport. It goes back down when the reader scrolls up. `isRevealed` turns true once a step is 8% visible and never turns back.

- [ ] **Step 1: Write the failing test**

```tsx
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTimelineProgress } from '../useTimelineProgress';

type Entry = Partial<IntersectionObserverEntry> & { target: Element };
type Observer = {
  cb: (e: Entry[]) => void;
  options: IntersectionObserverInit;
  unobserve: ReturnType<typeof vi.fn>;
};
let observers: Observer[] = [];

const el = (id: string) => document.getElementById(id)!;
const rect = (top: number) => ({ top }) as DOMRectReadOnly;
// A stable array: a fresh literal per render would rebuild the observers on every render.
const IDS = ['a', 'b', 'c'] as const;

describe('useTimelineProgress', () => {
  beforeEach(() => {
    document.body.innerHTML = ['a', 'b', 'c']
      .map(id => `<div id="${id}"><span id="${id}-dot"></span></div>`)
      .join('');
    observers = [];
    vi.stubGlobal(
      'IntersectionObserver',
      vi.fn(function (this: unknown, cb: Observer['cb'], options: IntersectionObserverInit) {
        const o = { cb, options, unobserve: vi.fn() };
        observers.push(o);
        return { observe: vi.fn(), unobserve: o.unobserve, disconnect: vi.fn() };
      })
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks(); // [ADDED] the reduced-motion case spies on matchMedia
  });

  // The progress observer is the one with a negative bottom margin (top half of the viewport).
  const progress = () => observers.find(o => String(o.options.rootMargin).includes('-50%'))!;
  const reveal = () => observers.find(o => o !== progress())!;

  it('counts steps whose dot has reached the middle of the viewport', () => {
    const { result } = renderHook(() => useTimelineProgress(IDS));
    expect(result.current.reached).toBe(0);
    act(() =>
      progress().cb([
        { target: el('a-dot'), isIntersecting: false, boundingClientRect: rect(-40) }, // scrolled past
        { target: el('b-dot'), isIntersecting: true, boundingClientRect: rect(200) }, // in the top half
        { target: el('c-dot'), isIntersecting: false, boundingClientRect: rect(900) }, // below the middle
      ])
    );
    expect(result.current.reached).toBe(2);
  });

  it('un-reaches a step when its dot returns below the middle', () => {
    const { result } = renderHook(() => useTimelineProgress(IDS));
    act(() =>
      progress().cb([
        { target: el('a-dot'), isIntersecting: true, boundingClientRect: rect(100) },
        { target: el('b-dot'), isIntersecting: true, boundingClientRect: rect(300) },
      ])
    );
    expect(result.current.reached).toBe(2);
    act(() =>
      progress().cb([{ target: el('b-dot'), isIntersecting: false, boundingClientRect: rect(700) }])
    );
    expect(result.current.reached).toBe(1);
  });

  it('reveals a step once and stops watching it', () => {
    const { result } = renderHook(() => useTimelineProgress(IDS));
    expect(result.current.isRevealed('a')).toBe(false);
    act(() => reveal().cb([{ target: el('a'), isIntersecting: true, intersectionRatio: 0.1 }]));
    expect(result.current.isRevealed('a')).toBe(true);
    expect(reveal().unobserve).toHaveBeenCalledWith(el('a'));
    act(() => reveal().cb([{ target: el('a'), isIntersecting: false, intersectionRatio: 0 }]));
    expect(result.current.isRevealed('a')).toBe(true);
  });

  it('reveals everything and fills every step when IntersectionObserver is missing', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { result } = renderHook(() => useTimelineProgress(IDS));
    expect(result.current.reached).toBe(3);
    expect(['a', 'b', 'c'].every(result.current.isRevealed)).toBe(true);
  });

  it('reveals everything immediately under reduced motion', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      q =>
        ({
          matches: q.includes('reduce'),
          media: q,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as MediaQueryList
    );
    const { result } = renderHook(() => useTimelineProgress(IDS));
    expect(['a', 'b', 'c'].every(result.current.isRevealed)).toBe(true);
  });
});
```

- [ ] **Step 2: Run red.** Run `pnpm vitest run src/components/landing/lifecycle/__tests__/useTimelineProgress.test.tsx`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
import { useCallback, useEffect, useState } from 'react';
import { useReducedMotion } from '@/features/_shared/hooks/useReducedMotion';

// Scroll progress for the lifecycle timeline.
// - `reached`: steps (from the top) whose dot is at or above the viewport's middle. It follows
//   the reader both ways, so dots and line segments un-fill when they scroll back up.
// - `isRevealed`: a step's content rises in once, the first time 8% of it is visible.
// INTENT: progress and reveal carry meaning (where you are in the show); nothing here
// hijacks scroll, and reduced motion shows everything at once (docs/plan-landing-lifecycle.md D8).
export function useTimelineProgress(ids: readonly string[]) {
  const reducedMotion = useReducedMotion();
  const supported = typeof IntersectionObserver !== 'undefined';
  const [reachedById, setReachedById] = useState<Record<string, boolean>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!supported) return;
    const progress = new IntersectionObserver(
      entries => {
        setReachedById(prev => {
          const next = { ...prev };
          for (const e of entries) {
            const id = e.target.id.replace(/-dot$/, '');
            next[id] = e.isIntersecting || e.boundingClientRect.top < 0;
          }
          return next;
        });
      },
      { rootMargin: '0px 0px -50% 0px', threshold: 0 }
    );
    const reveal = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.08) {
            setRevealed(prev => ({ ...prev, [e.target.id]: true }));
            reveal.unobserve(e.target);
          }
        }
      },
      { threshold: [0, 0.08] }
    );
    for (const id of ids) {
      const dot = document.getElementById(`${id}-dot`);
      const row = document.getElementById(id);
      if (dot) progress.observe(dot);
      if (row) reveal.observe(row);
    }
    return () => {
      progress.disconnect();
      reveal.disconnect();
    };
  }, [ids, supported]);

  // Count from the top: a step counts only if every step above it is reached too.
  let reached = 0;
  if (!supported) reached = ids.length;
  else
    for (const id of ids)
      if (reachedById[id]) reached += 1;
      else break;

  const isRevealed = useCallback(
    (id: string) => !supported || reducedMotion || !!revealed[id],
    [supported, reducedMotion, revealed]
  );

  return { reached, isRevealed };
}
```

- [ ] **Step 4: Run green.** Same command; expected PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/landing/lifecycle/useTimelineProgress.ts apps/myk9show/src/components/landing/lifecycle/__tests__/useTimelineProgress.test.tsx
git commit -m "feat(landing): timeline progress that follows the reader, reveal once"
```

---

### Task 4: `ScreenshotExplainer`

**Files:**

- Create: `apps/myk9show/src/components/landing/lifecycle/ScreenshotExplainer.tsx`
- Test: `apps/myk9show/src/components/landing/lifecycle/__tests__/ScreenshotExplainer.test.tsx`

**Interfaces:**

- Consumes: `Shot`, `ExplainerStep` (Task 2).
- Produces: `export function ScreenshotExplainer(props: { shot: Shot; steps: readonly ExplainerStep[]; intervalMs?: number }): JSX.Element`. It renders a `<figure>` with the image, one absolutely positioned highlight per step (only the current one at opacity 1), an optional badge, and a caption row with "N of M", the caption, and Pause/Play and Next buttons.

- [ ] **Step 1: Write the failing test**

```tsx
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { ScreenshotExplainer } from '../ScreenshotExplainer';
import type { ExplainerStep, Shot } from '../lifecycleStories';

const shot: Shot = {
  src: '/landing/stages/j-04.png',
  alt: 'Judge scoresheet on a tablet',
  width: 768,
  height: 1024,
  shape: 'tablet',
};
const steps: ExplainerStep[] = [
  {
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    caption: 'No signal at the venue',
    badge: { text: 'No signal', tone: 'amber' },
  },
  { x: 10, y: 20, w: 50, h: 10, caption: 'Time the search' },
  {
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    caption: 'Back online, synced',
    badge: { text: 'Back online', tone: 'green' },
  },
];
let onScreen: ((e: Partial<IntersectionObserverEntry>[]) => void) | null = null;

const setReducedMotion = (reduce: boolean) =>
  vi.spyOn(window, 'matchMedia').mockImplementation(
    q =>
      ({
        matches: reduce && q.includes('reduce'),
        media: q,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as MediaQueryList
  );

describe('ScreenshotExplainer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'IntersectionObserver',
      vi.fn(function (this: unknown, cb: typeof onScreen) {
        onScreen = cb;
        return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
      })
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const show = () => act(() => onScreen?.([{ isIntersecting: true }]));

  it('advances through the steps while on screen', () => {
    setReducedMotion(false);
    render(<ScreenshotExplainer shot={shot} steps={steps} intervalMs={1000} />);
    show();
    expect(screen.getByText('No signal at the venue')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText('Time the search')).toBeInTheDocument();
    expect(screen.getByText('2 of 3')).toBeInTheDocument();
  });

  it('does not advance while off screen', () => {
    setReducedMotion(false);
    render(<ScreenshotExplainer shot={shot} steps={steps} intervalMs={1000} />);
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
  });

  it('stops on Pause and steps on Next', () => {
    setReducedMotion(false);
    render(<ScreenshotExplainer shot={shot} steps={steps} intervalMs={1000} />);
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Time the search')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('starts paused under reduced motion', () => {
    setReducedMotion(true);
    render(<ScreenshotExplainer shot={shot} steps={steps} intervalMs={1000} />);
    show();
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('announces captions only when paused', () => {
    setReducedMotion(false);
    render(<ScreenshotExplainer shot={shot} steps={steps} intervalMs={1000} />);
    show();
    const caption = screen.getByText('No signal at the venue');
    expect(caption).toHaveAttribute('aria-live', 'off');
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(caption).toHaveAttribute('aria-live', 'polite');
  });

  it('shows exactly one highlight at a time, by opacity', () => {
    setReducedMotion(false);
    const { container } = render(
      <ScreenshotExplainer shot={shot} steps={steps} intervalMs={1000} />
    );
    const boxes = container.querySelectorAll('[data-explainer-box]');
    expect(boxes).toHaveLength(3);
    expect(Array.from(boxes).filter(b => b.getAttribute('data-active') === 'true')).toHaveLength(1);
  });

  it('renders the image with dimensions and lazy loading', () => {
    setReducedMotion(false);
    render(<ScreenshotExplainer shot={shot} steps={steps} />);
    const img = screen.getByRole('img', { name: shot.alt });
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('width', '768');
  });
});
```

- [ ] **Step 2: Run red.** Run `pnpm vitest run src/components/landing/lifecycle/__tests__/ScreenshotExplainer.test.tsx`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```tsx
import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/features/_shared/hooks/useReducedMotion';
import type { ExplainerStep, Shot } from './lifecycleStories';

const MAX_W = { phone: '300px', tablet: '420px', desktop: '640px' } as const;

// Explainer slide over one screenshot: a highlight box and caption per step, cross-faded
// by opacity (no layout animation). Auto-advances only while on screen and not paused.
// INTENT: motion here teaches what the screen does; Pause/Next satisfy WCAG 2.2.2, and
// reduced motion starts paused (docs/plan-landing-lifecycle.md D8).
export function ScreenshotExplainer({
  shot,
  steps,
  intervalMs = 2600,
}: {
  shot: Shot;
  steps: readonly ExplainerStep[];
  intervalMs?: number;
}) {
  const reducedMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(reducedMotion);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (reducedMotion) setPaused(true);
  }, [reducedMotion]);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), {
      threshold: 0.4,
    });
    io.observe(node);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (paused || !visible) return;
    const t = window.setInterval(() => setIndex(i => (i + 1) % steps.length), intervalMs);
    return () => window.clearInterval(t);
  }, [paused, visible, steps.length, intervalMs]);

  // [ADDED] Review Focus 7: a parent may swap in a shorter step list; never read past its end.
  const safeIndex = index % steps.length;
  const current = steps[safeIndex]!;
  return (
    <figure ref={ref} className="lc-explainer" style={{ maxWidth: MAX_W[shot.shape] }}>
      <div className="lc-explainer-frame">
        <img
          src={shot.src}
          alt={shot.alt}
          width={shot.width}
          height={shot.height}
          loading="lazy"
          decoding="async"
        />
        {steps.map((s, i) => (
          <div
            key={i}
            aria-hidden="true"
            data-explainer-box
            data-active={i === safeIndex ? 'true' : 'false'}
            className={s.w === 0 ? 'lc-explainer-dim' : 'lc-explainer-box'}
            style={
              s.w === 0
                ? undefined
                : { left: `${s.x}%`, top: `${s.y}%`, width: `${s.w}%`, height: `${s.h}%` }
            }
          />
        ))}
        {current.badge && (
          <span aria-hidden="true" className="lc-explainer-badge" data-tone={current.badge.tone}>
            {current.badge.text}
          </span>
        )}
      </div>
      <figcaption className="lc-explainer-caption">
        <span className="lc-explainer-count">
          {safeIndex + 1} of {steps.length}
        </span>
        <span className="lc-explainer-text" aria-live={paused ? 'polite' : 'off'}>
          {current.caption}
        </span>
        <button type="button" className="lc-explainer-btn" onClick={() => setPaused(p => !p)}>
          {paused ? 'Play' : 'Pause'}
        </button>
        <button
          type="button"
          className="lc-explainer-btn"
          onClick={() => {
            setPaused(true);
            setIndex(i => (i + 1) % steps.length);
          }}
        >
          Next
        </button>
      </figcaption>
    </figure>
  );
}
```

- [ ] **Step 4: Run green.** Same command; expected PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/landing/lifecycle/ScreenshotExplainer.tsx apps/myk9show/src/components/landing/lifecycle/__tests__/ScreenshotExplainer.test.tsx
git commit -m "feat(landing): screenshot explainer slides with pause and next"
```

---

### Task 5: Timeline, audience switch and CSS

**Files:**

- Create: `apps/myk9show/src/components/landing/lifecycle/LifecycleTimeline.tsx` (switch, column labels, steps)
- Create: `apps/myk9show/src/components/landing/lifecycle/TimelineStep.tsx`
- Create: `apps/myk9show/src/components/landing/lifecycle/lifecycle.css`
- Test: `apps/myk9show/src/components/landing/lifecycle/__tests__/LifecycleTimeline.test.tsx`

**Interfaces:**

- Consumes: Task 2 exports, `useTimelineProgress` (Task 3), `ScreenshotExplainer` (Task 4).
- Produces: `export function LifecycleTimeline(): JSX.Element`, which renders `<section id="how-it-works">`. Each step row is `<div id={step.id} data-revealed>`, and each dot is `<span id={`${step.id}-dot`} data-reached>`.

- [ ] **Step 1: Write the failing test**

```tsx
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { LifecycleTimeline } from '../LifecycleTimeline';
import { STORIES } from '../lifecycleStories';

vi.mock('../useTimelineProgress', () => ({
  useTimelineProgress: () => ({ reached: 2, isRevealed: () => true }),
}));

const titles = () => screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent);

describe('LifecycleTimeline', () => {
  it('opens on the club story', () => {
    render(<LifecycleTimeline />);
    expect(titles()).toEqual(STORIES.club.map(s => s.title));
    expect(screen.getByRole('button', { name: 'I’m running a show' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('switches every step to the exhibitor story', () => {
    render(<LifecycleTimeline />);
    fireEvent.click(screen.getByRole('button', { name: 'I’m entering a show' }));
    expect(titles()).toEqual(STORIES.exhibitor.map(s => s.title));
    expect(screen.getByRole('button', { name: 'I’m entering a show' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByText('Meanwhile, the club')).toBeInTheDocument();
  });

  it('switching audience keeps revealed steps visible', () => {
    const { container } = render(<LifecycleTimeline />);
    fireEvent.click(screen.getByRole('button', { name: 'I’m entering a show' }));
    const rows = container.querySelectorAll('[data-revealed]');
    expect(Array.from(rows).every(r => r.getAttribute('data-revealed') === 'true')).toBe(true);
  });

  it('fills dots up to the reached step only', () => {
    render(<LifecycleTimeline />);
    const reached = STORIES.club.map(s =>
      document.getElementById(`${s.id}-dot`)!.getAttribute('data-reached')
    );
    expect(reached).toEqual(['true', 'true', 'false', 'false', 'false', 'false']);
  });

  it('marks show day as the peak with its lead line and an explainer', () => {
    render(<LifecycleTimeline />);
    const peak = document.getElementById('showday')!;
    expect(peak).toHaveAttribute('data-peak', 'true');
    expect(
      within(peak).getByText('Then show day arrives, and the venue has no signal.')
    ).toBeInTheDocument();
    expect(within(peak).getByRole('button', { name: /Pause|Play/ })).toBeInTheDocument();
  });

  // [ADDED] Review Focus 7
  it('switching audience mid-explainer does not crash and restarts the explainer', () => {
    render(<LifecycleTimeline />);
    const peak = () => document.getElementById('showday')!;
    for (let i = 0; i < 4; i++)
      fireEvent.click(within(peak()).getByRole('button', { name: 'Next' }));
    expect(within(peak()).getByText('5 of 5')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'I’m entering a show' }));
    expect(within(peak()).getByText('1 of 3')).toBeInTheDocument();
  });

  it('caps phone screenshots at phone width', () => {
    render(<LifecycleTimeline />);
    fireEvent.click(screen.getByRole('button', { name: 'I’m entering a show' }));
    const runOrder = screen.getByRole('img', { name: STORIES.exhibitor[2]!.shot!.alt });
    expect(runOrder.closest('[data-shape]')).toHaveAttribute('data-shape', 'phone');
  });
});
```

- [ ] **Step 2: Run red.** Run `pnpm vitest run src/components/landing/lifecycle/__tests__/LifecycleTimeline.test.tsx`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement `TimelineStep.tsx`**

```tsx
import { ScreenshotExplainer } from './ScreenshotExplainer';
import type { Shot, StoryStep } from './lifecycleStories';

function Screenshot({ shot, side }: { shot: Shot; side: 'main' | 'meanwhile' }) {
  return (
    <div className="lc-shot" data-shape={shot.shape} data-side={side}>
      <img
        src={shot.src}
        alt={shot.alt}
        width={shot.width}
        height={shot.height}
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}

export function TimelineStep({
  step,
  number,
  lead,
  reached,
  revealed,
}: {
  step: StoryStep;
  number: number;
  lead: string;
  reached: boolean;
  revealed: boolean;
}) {
  return (
    <div
      id={step.id}
      className="lc-row"
      data-peak={step.peak ? 'true' : undefined}
      data-revealed={revealed ? 'true' : 'false'}
    >
      <div className="lc-main">
        {step.peak && <p className="lc-lead">{lead}</p>}
        <h3 className="lc-step-title">{step.title}</h3>
        <p className="lc-step-body">{step.body}</p>
        {step.shot && step.explainer && (
          // [ADDED] key by image: a new screenshot starts its explainer from step 1, unpaused.
          <ScreenshotExplainer key={step.shot.src} shot={step.shot} steps={step.explainer} />
        )}
        {step.shot && !step.explainer && <Screenshot shot={step.shot} side="main" />}
      </div>
      <div className="lc-rail" aria-hidden="true">
        <span id={`${step.id}-dot`} className="lc-dot" data-reached={reached ? 'true' : 'false'}>
          {number}
        </span>
        <span className="lc-line" data-filled={reached ? 'true' : 'false'} />
      </div>
      <div className="lc-meanwhile">
        <p className="lc-meanwhile-text">{step.meanwhile}</p>
        {step.meanwhileShot && <Screenshot shot={step.meanwhileShot} side="meanwhile" />}
      </div>
    </div>
  );
}
```

The dot is `aria-hidden`: the step number is decoration, and the heading carries the meaning. The line is filled when this step is reached and the next one has started, via CSS on the following sibling; see Step 5.

- [ ] **Step 4: Implement `LifecycleTimeline.tsx`**

```tsx
import { useState } from 'react';
import { TimelineStep } from './TimelineStep';
import {
  AUDIENCE_LABEL,
  DEFAULT_AUDIENCE,
  MEANWHILE_LABEL,
  PEAK_LEAD,
  STORIES,
  STORY_HEADING,
  type Audience,
} from './lifecycleStories';
import { useTimelineProgress } from './useTimelineProgress';
import './lifecycle.css';

const STEP_IDS = STORIES.club.map(s => s.id); // both audiences share ids and order (tested)
const AUDIENCES: Audience[] = ['club', 'exhibitor'];

export function LifecycleTimeline() {
  const [audience, setAudience] = useState<Audience>(DEFAULT_AUDIENCE);
  const { reached, isRevealed } = useTimelineProgress(STEP_IDS);
  const story = STORIES[audience];
  return (
    <section id="how-it-works" className="lc" aria-labelledby="lc-title">
      <div className="l-container">
        <div className="lc-head">
          <h2 id="lc-title" className="lc-title">
            {STORY_HEADING[audience]}
          </h2>
          <div role="group" aria-label="Show me the story for" className="lc-switch">
            {AUDIENCES.map(a => (
              <button
                key={a}
                type="button"
                aria-pressed={audience === a}
                onClick={() => setAudience(a)}
              >
                {AUDIENCE_LABEL[a]}
              </button>
            ))}
          </div>
        </div>
        <div className="lc-labels" aria-hidden="true">
          <span>What you do</span>
          <span />
          <span>{MEANWHILE_LABEL[audience]}</span>
        </div>
        {story.map((step, i) => (
          <TimelineStep
            key={step.id}
            step={step}
            number={i + 1}
            lead={PEAK_LEAD[audience]}
            reached={reached >= i + 1}
            revealed={isRevealed(step.id)}
          />
        ))}
      </div>
    </section>
  );
}
```

Keying rows on `step.id` (shared by both audiences) keeps the same DOM nodes across a switch, so the observers in `useTimelineProgress` keep watching them. That is what makes "switching keeps progress" hold.

- [ ] **Step 5: Write `lifecycle.css`.** Scope everything under `.landing-v2` and stay under 300 lines.

```css
/* Show-lifecycle timeline (canvas version D). Tokens from src/styles/landing.css. */
.landing-v2 .lc {
  background: var(--ivory-100, #f3efe6);
  padding-block: clamp(3.5rem, 8vw, 6rem);
}
.landing-v2 .lc-head {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 2.5rem;
}
.landing-v2 .lc-title {
  font-family: 'Playfair Display', serif;
  font-weight: 600;
  font-size: clamp(1.75rem, 4vw, 2.75rem);
  line-height: 1.1;
  margin: 0;
  text-wrap: balance;
}
.landing-v2 .lc-switch {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 14px;
}
.landing-v2 .lc-switch button {
  min-height: 44px;
  padding: 0 1.125rem;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--stone-700);
  font: inherit;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    background-color 160ms ease,
    color 160ms ease;
}
.landing-v2 .lc-switch button[aria-pressed='true'] {
  background: var(--terracotta-600);
  color: #fff;
}
.landing-v2 .lc-switch button:focus-visible {
  outline: 2px solid var(--terracotta-600);
  outline-offset: 2px;
}

/* Three-column timeline: main | rail | meanwhile. Phones: rail on the left, columns stack. */
.landing-v2 .lc-labels,
.landing-v2 .lc-row {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) 96px minmax(0, 1fr);
}
.landing-v2 .lc-labels {
  margin-bottom: 1.5rem;
  font-size: 1rem;
  font-weight: 700;
  color: var(--stone-500);
}
.landing-v2 .lc-labels span:first-child {
  color: var(--terracotta-600);
}
.landing-v2 .lc-main {
  padding: 0 1.5rem 2.5rem 0;
}
.landing-v2 .lc-meanwhile {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  padding: 0.375rem 0 2.5rem 1.5rem;
}
.landing-v2 .lc-step-title {
  font-family: 'Playfair Display', serif;
  font-weight: 600;
  font-size: 1.5rem;
  line-height: 1.1;
  margin: 0;
  color: var(--ink-900);
}
.landing-v2 .lc-step-body {
  margin: 0.5rem 0 1rem;
  font-size: 1rem;
  line-height: 1.6;
  color: var(--stone-700);
  max-width: 52ch;
}
.landing-v2 .lc-meanwhile-text {
  margin: 0;
  font-size: 1rem;
  line-height: 1.6;
  color: var(--stone-700);
  font-style: italic;
}
.landing-v2 .lc-lead {
  margin: 0 0 0.75rem;
  font-size: 1rem;
  font-weight: 700;
  color: var(--terracotta-600);
}

/* Peak: show day on a white panel with the most room. */
.landing-v2 .lc-row[data-peak='true'] .lc-main {
  padding: 2.5rem;
  margin: 2.5rem 1.5rem 6rem 0;
  background: #fff;
  border: 1px solid #e8e2d4;
  border-radius: 24px;
  box-shadow: 0 40px 80px -48px rgb(60 40 20 / 0.45);
}
.landing-v2 .lc-row[data-peak='true'] .lc-meanwhile {
  padding-top: 5rem;
  padding-bottom: 6rem;
}
.landing-v2 .lc-row[data-peak='true'] .lc-step-title {
  font-size: clamp(2rem, 4vw, 3rem);
  color: var(--terracotta-600);
}
.landing-v2 .lc-row[data-peak='true'] .lc-step-body {
  font-size: 1.1875rem;
  margin-bottom: 1.75rem;
}

/* Screenshots: width follows capture shape. */
.landing-v2 .lc-shot img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 12px;
  border: 1px solid #e3dccd;
  background: #fff;
  box-shadow: 0 24px 48px -24px rgb(60 40 20 / 0.35);
}
.landing-v2 .lc-shot[data-side='main'][data-shape='desktop'] {
  max-width: 440px;
}
.landing-v2 .lc-shot[data-side='main'][data-shape='tablet'] {
  max-width: 300px;
}
.landing-v2 .lc-shot[data-side='main'][data-shape='phone'] {
  max-width: 220px;
}
.landing-v2 .lc-shot[data-side='meanwhile'][data-shape='desktop'] {
  max-width: 75%;
}
.landing-v2 .lc-shot[data-side='meanwhile'][data-shape='tablet'] {
  max-width: 170px;
}
.landing-v2 .lc-shot[data-side='meanwhile'][data-shape='phone'] {
  max-width: 140px;
}
.landing-v2 .lc-row[data-peak='true'] .lc-shot[data-side='meanwhile'][data-shape='desktop'] {
  max-width: 100%;
}
.landing-v2 .lc-row[data-peak='true'] .lc-shot[data-side='meanwhile'][data-shape='tablet'] {
  max-width: 240px;
}
.landing-v2 .lc-row[data-peak='true'] .lc-shot[data-side='meanwhile'][data-shape='phone'] {
  max-width: 200px;
}

/* Rail: dot fills when reached; the line below it fills when the NEXT step is reached. */
.landing-v2 .lc-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.landing-v2 .lc-dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 44px;
  height: 44px;
  border-radius: 999px;
  border: 2px solid #b8ae9c;
  background: #fff;
  color: var(--ink-900);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  transform: scale(0.92);
  transition:
    background-color 260ms ease,
    color 260ms ease,
    border-color 260ms ease,
    transform 260ms cubic-bezier(0.23, 1, 0.32, 1);
}
.landing-v2 .lc-dot[data-reached='true'] {
  background: var(--terracotta-600);
  border-color: var(--terracotta-600);
  color: #fff;
  transform: scale(1);
}
.landing-v2 .lc-row[data-peak='true'] .lc-dot {
  width: 64px;
  height: 64px;
  font-size: 1.375rem;
  margin-top: 2.5rem;
}
.landing-v2 .lc-line {
  position: relative;
  flex: 1 1 auto;
  width: 2px;
  margin-top: 8px;
  background: #d9cfbc;
  overflow: hidden;
}
.landing-v2 .lc-line::after {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--terracotta-600);
  transform: scaleY(0);
  transform-origin: top;
  transition: transform 700ms cubic-bezier(0.23, 1, 0.32, 1);
}
.landing-v2 .lc-row:has(+ .lc-row .lc-dot[data-reached='true']) .lc-line::after {
  transform: scaleY(1);
}

/* Reveal once: content rises 20px and fades in; meanwhile follows 140ms later. */
.landing-v2 .lc-main,
.landing-v2 .lc-meanwhile {
  transition:
    opacity 500ms ease,
    transform 500ms cubic-bezier(0.23, 1, 0.32, 1);
}
.landing-v2 .lc-meanwhile {
  transition-delay: 140ms;
}
.landing-v2 .lc-row[data-revealed='false'] .lc-main,
.landing-v2 .lc-row[data-revealed='false'] .lc-meanwhile {
  opacity: 0;
  transform: translateY(20px);
}

/* Explainer */
.landing-v2 .lc-explainer {
  margin: 0;
}
.landing-v2 .lc-explainer-frame {
  position: relative;
  overflow: hidden;
  border-radius: 14px;
  border: 1px solid #e3dccd;
  background: #fff;
  box-shadow: 0 30px 60px -28px rgb(60 40 20 / 0.45);
}
.landing-v2 .lc-explainer-frame img {
  display: block;
  width: 100%;
  height: auto;
}
.landing-v2 .lc-explainer-box,
.landing-v2 .lc-explainer-dim {
  position: absolute;
  pointer-events: none;
  opacity: 0;
  transition: opacity 280ms ease;
}
.landing-v2 .lc-explainer-box {
  border: 3px solid var(--terracotta-600);
  border-radius: 10px;
  box-shadow:
    0 0 0 9999px rgb(24 20 17 / 0.42),
    0 0 0 6px rgb(255 255 255 / 0.55);
}
.landing-v2 .lc-explainer-dim {
  inset: 0;
  background: rgb(24 20 17 / 0.18);
}
.landing-v2 [data-explainer-box][data-active='true'] {
  opacity: 1;
}
.landing-v2 .lc-explainer-badge {
  position: absolute;
  top: 3%;
  right: 3%;
  padding: 0.5rem 0.875rem;
  border-radius: 999px;
  font-size: 0.9375rem;
  font-weight: 700;
  box-shadow: 0 6px 16px -6px rgb(0 0 0 / 0.3);
}
.landing-v2 .lc-explainer-badge[data-tone='amber'] {
  background: #fff1d6;
  color: #6e4300;
}
.landing-v2 .lc-explainer-badge[data-tone='green'] {
  background: #e3f2e6;
  color: #1e5b2e;
}
.landing-v2 .lc-explainer-caption {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.875rem;
}
.landing-v2 .lc-explainer-count {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 0.625rem;
  border-radius: 999px;
  background: var(--terracotta-600);
  color: #fff;
  font-size: 0.875rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.landing-v2 .lc-explainer-text {
  flex: 1 1 200px;
  font-size: 1.0625rem;
  font-weight: 600;
  color: var(--ink-900);
  line-height: 1.4;
}
.landing-v2 .lc-explainer-btn {
  min-height: 44px;
  padding: 0 0.875rem;
  border-radius: 10px;
  border: 1px solid #d9d3c4;
  background: #fff;
  font: inherit;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--ink-900);
  cursor: pointer;
}
.landing-v2 .lc-explainer-btn:focus-visible {
  outline: 2px solid var(--terracotta-600);
  outline-offset: 2px;
}

/* Phones: rail on the left, main then meanwhile stacked on the right. */
@media (max-width: 767px) {
  .landing-v2 .lc-labels {
    display: none;
  }
  .landing-v2 .lc-row {
    grid-template-columns: 56px minmax(0, 1fr);
  }
  .landing-v2 .lc-rail {
    grid-column: 1;
    grid-row: 1 / span 2;
  }
  .landing-v2 .lc-main {
    grid-column: 2;
    padding: 0 0 1rem;
  }
  .landing-v2 .lc-meanwhile {
    grid-column: 2;
    padding: 0 0 2.5rem;
  }
  .landing-v2 .lc-row[data-peak='true'] .lc-main {
    margin: 1rem 0 1.5rem;
    padding: 1.5rem;
  }
  .landing-v2 .lc-row[data-peak='true'] .lc-meanwhile {
    padding-top: 0;
    padding-bottom: 3rem;
  }
  .landing-v2 .lc-row[data-peak='true'] .lc-dot {
    margin-top: 1rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .landing-v2 .lc-dot,
  .landing-v2 .lc-line::after,
  .landing-v2 .lc-main,
  .landing-v2 .lc-meanwhile,
  .landing-v2 .lc-explainer-box,
  .landing-v2 .lc-explainer-dim,
  .landing-v2 .lc-switch button {
    transition: none;
  }
}
```

`--ivory-100` does not exist (checked 2026-10-13), so the fallback `#f3efe6` is what renders. That value is the alt-section ground measured on production. Do not invent a token for it.

- [ ] **Step 6: Run green.** Same command; expected PASS (7 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/components/landing/lifecycle
git commit -m "feat(landing): two-sided lifecycle timeline with audience switch"
```

---

### Task 6: Header, hero, trust, close, footer; wire `Home`; delete v2

**Files:**

- Create: `apps/myk9show/src/components/landing/lifecycle/LandingHeader.tsx`
- Create: `apps/myk9show/src/components/landing/lifecycle/LandingHero.tsx`
- Create: `apps/myk9show/src/components/landing/lifecycle/TrustSection.tsx`
- Create: `apps/myk9show/src/components/landing/lifecycle/LandingClose.tsx`
- Create: `apps/myk9show/src/components/landing/lifecycle/LandingFooter.tsx`
- Create: `apps/myk9show/src/components/landing/lifecycle/landingCtas.ts`
- Create: `apps/myk9show/src/components/landing/lifecycle/index.ts`
- Move: `v2/ClubOnboarding.tsx` to `lifecycle/ClubOnboarding.tsx`, plus its test (copy fixes only, Step 7)
- Move: `v2/HomeBranding.test.tsx` and `v2/LandingHeader.test.tsx` into `lifecycle/__tests__/` (update imports and assertions)
- Modify: `apps/myk9show/src/pages/Home.tsx`, `apps/myk9show/src/pages/Home.test.tsx`
- Modify: `apps/myk9show/src/test/branding/brandAssets.test.ts:87`, `apps/myk9show/src/test/branding/unifiedBranding.test.ts:23` (new paths)
- Modify: `apps/myk9show/src/test/database/waitlistInviteTrigger.source.test.ts` (drop the browser-form block)
- Modify: `apps/myk9show/src/test/e2e/simple-connectivity.spec.ts:13` (PR smoke; expected link renamed)
- Modify: `apps/myk9show/src/data/organizations.ts:26` (comment path)
- Create: [ADDED] `apps/myk9show/src/components/layout/useIsGuestLanding.ts` and `apps/myk9show/src/components/layout/__tests__/useIsGuestLanding.test.tsx`
- Modify: [ADDED] `apps/myk9show/src/components/layout/AppHeader.tsx:57` and `apps/myk9show/src/components/layout/SidebarLayout.tsx:220` (one shared guest-landing rule; Step 9b)
- Modify: `apps/myk9show/src/styles/landing.css` (delete rules only the removed sections used)
- Delete: the rest of `apps/myk9show/src/components/landing/v2/`

**Interfaces (produced):**

```ts
// landingCtas.ts: the single source for CTA labels, targets and order (D6: clubs first)
export const BRING_YOUR_CLUB = { label: 'Bring your club', href: '#get-started' } as const;
export const FIND_A_SHOW = { label: 'Find a show', to: '/shows' } as const;
```

- [ ] **Step 1: Write the failing Home test.** Replace `Home.test.tsx`. It renders the real sections and mocks only the banner, the auth-dependent onboarding form and the progress hook.

```tsx
import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import Home from './Home';
import { BANNED_COPY } from '@/components/landing/lifecycle/lifecycleStories';

vi.mock('@/features/show-today/ShowTodayBanner', () => ({ ShowTodayBanner: () => null }));
vi.mock('@/components/landing/lifecycle/ClubOnboarding', () => ({
  ClubOnboarding: () => <section id="get-started" aria-label="Bring your club form" />,
}));
vi.mock('@/components/landing/lifecycle/useTimelineProgress', () => ({
  useTimelineProgress: () => ({ reached: 0, isRevealed: () => true }),
}));

const linkTexts = (root: Element) =>
  Array.from(root.querySelectorAll('a')).map(a => a.textContent?.trim());

describe('Home', () => {
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => {
      cb(0);
      return 1;
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    window.history.replaceState({}, '', '/');
  });

  it('leads the hero with Bring your club, then Find a show, and nothing else', () => {
    render(<Home />);
    const hero = screen.getByRole('region', { name: /from premium list/i });
    expect(linkTexts(hero)).toEqual(['Bring your club', 'Find a show']);
    expect(hero.querySelector('a[href="#get-started"]')).toHaveClass('l-btn-primary');
    expect(hero.querySelector('a[href="/shows"]')).not.toHaveClass('l-btn-primary');
  });

  it('makes Bring your club the primary button in the header', () => {
    render(<Home />);
    const header = screen.getByRole('banner');
    expect(header.querySelector('.l-btn-primary')?.textContent).toBe('Bring your club');
  });

  it('keeps the hero lede to 20 words or fewer', () => {
    render(<Home />);
    const lede =
      screen
        .getByRole('region', { name: /from premium list/i })
        .querySelector('.l-lede')
        ?.textContent?.trim() ?? '';
    expect(lede.split(/\s+/).length).toBeLessThanOrEqual(20);
  });

  it('uses one label per intent across the whole page', () => {
    render(<Home />);
    const labels = screen.getAllByRole('link').map(a => a.textContent?.trim());
    for (const banned of ['Browse shows', 'Join the waitlist', 'Run your next trial'])
      expect(labels).not.toContain(banned);
  });

  it('renders no banned copy anywhere on the page', () => {
    const { container } = render(<Home />);
    for (const re of BANNED_COPY) expect(container.textContent ?? '').not.toMatch(re);
  });

  it('still scrolls /#get-started to the club form', () => {
    window.history.replaceState({}, '', '/#get-started');
    render(<Home />);
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('ignores retired anchors without error', () => {
    window.history.replaceState({}, '', '/#closing');
    expect(() => render(<Home />)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run red.** Run `pnpm vitest run src/pages/Home.test.tsx`. Expected: FAIL (the hero region and CTA order are not found).

- [ ] **Step 3: Write `landingCtas.ts`** with the two constants above.

- [ ] **Step 4: Write `LandingHeader.tsx`.** Logo, then "Find a show" (outlined, hidden below 640px), "Sign in", and "Bring your club" (filled).

```tsx
import { Link } from 'react-router-dom';
import { BRING_YOUR_CLUB, FIND_A_SHOW } from './landingCtas';

export function LandingHeader() {
  return (
    <header className="l-hdr">
      <div className="l-hdr-inner">
        <a href="#top" className="l-brand min-h-11">
          <img
            src="/logo.svg"
            alt="myK9Show"
            width="2076"
            height="596"
            className="h-9 w-32 shrink-0 object-contain sm:h-11 sm:w-40 dark:brightness-150 dark:saturate-50"
          />
        </a>
        <span className="l-hdr-spacer" />
        <Link to={FIND_A_SHOW.to} className="l-btn l-btn-ghost l-hdr-desktop min-h-11">
          {FIND_A_SHOW.label}
        </Link>
        <Link to="/sign-in" className="l-btn l-btn-ghost min-h-11">
          Sign in
        </Link>
        <a href={BRING_YOUR_CLUB.href} className="l-btn l-btn-primary min-h-11">
          {BRING_YOUR_CLUB.label}
        </a>
      </div>
    </header>
  );
}
```

Add `.landing-v2 .l-hdr-desktop { display: none } @media (min-width: 640px) { .landing-v2 .l-hdr-desktop { display: inline-flex } }` to `lifecycle.css`. Keep the logo markup byte-identical, because `brandAssets.test.ts` asserts on it.

- [ ] **Step 5: Write `LandingHero.tsx`** (A's hero: full-width photo band, then H1, lede, CTAs and a registry line).

```tsx
import { Link } from 'react-router-dom';
import { BRING_YOUR_CLUB, FIND_A_SHOW } from './landingCtas';

export function LandingHero() {
  return (
    <section className="l-hero lc-hero" id="top" aria-labelledby="hero-title">
      <img
        className="lc-hero-photo"
        src="/hero-ziva-tera-1600.jpg"
        srcSet="/hero-ziva-tera-800.jpg 800w, /hero-ziva-tera-1600.jpg 1600w"
        sizes="100vw"
        width={1600}
        height={1395}
        alt="A Belgian Tervuren and a Dutch Shepherd standing in an autumn field"
        loading="eager"
        fetchPriority="high"
        decoding="async"
      />
      <div className="l-container lc-hero-copy">
        <h1 id="hero-title" className="l-h1">
          From premium list to <em>placements</em>.
        </h1>
        <p className="l-lede">
          Run your scent work show on one system: entries, ringside scoring that works without
          signal, and results.
        </p>
        <div className="lc-hero-ctas">
          <a href={BRING_YOUR_CLUB.href} className="l-btn l-btn-primary l-btn-lg min-h-11">
            {BRING_YOUR_CLUB.label}
          </a>
          <Link to={FIND_A_SHOW.to} className="l-btn l-btn-ghost l-btn-lg min-h-11">
            {FIND_A_SHOW.label}
          </Link>
        </div>
        <p className="lc-hero-registries">
          For AKC Scent Work, UKC Nosework and ASCA Scent Detection.
        </p>
      </div>
    </section>
  );
}
```

Add this to `lifecycle.css`:

```css
.landing-v2 .lc-hero-photo {
  display: block;
  width: 100%;
  height: clamp(200px, 34vh, 380px);
  object-fit: cover;
  object-position: center 35%;
}
.landing-v2 .lc-hero-copy {
  padding-block: clamp(1.5rem, 4vw, 3rem) clamp(2rem, 5vw, 3.5rem);
}
.landing-v2 .lc-hero .l-h1 {
  max-width: 16ch;
  font-size: clamp(2.25rem, 6vw, 4rem);
  text-wrap: balance;
}
.landing-v2 .lc-hero .l-lede {
  max-width: 52ch;
  font-size: clamp(1.0625rem, 1.6vw, 1.25rem);
}
.landing-v2 .lc-hero-ctas {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1.75rem;
}
.landing-v2 .lc-hero-registries {
  margin: 1rem 0 0;
  font-size: 0.9375rem;
  color: var(--stone-500);
}
```

- [ ] **Step 6: Write `TrustSection.tsx`.**

```tsx
export function TrustSection() {
  return (
    <section className="l-section lc-trust" id="about" aria-labelledby="trust-title">
      <div className="l-container">
        <h2 id="trust-title" className="l-h2">
          Built by the team behind mySWT and myNWT
        </h2>
        <p className="l-body">
          RyKris has built scent-sport software since 2013, alongside the judges, secretaries and
          exhibitors who use it every weekend. myK9Show brings that work, and the ringside tools you
          may know as myK9Q, into one place.
        </p>
      </div>
    </section>
  );
}
```

- [ ] **Step 7: Write `LandingClose.tsx` and clean up `ClubOnboarding`.**

```tsx
import { Link } from 'react-router-dom';
import { ClubOnboarding } from './ClubOnboarding';
import { BRING_YOUR_CLUB, FIND_A_SHOW } from './landingCtas';

export function LandingClose() {
  return (
    <>
      <section className="l-closing lc-close" aria-labelledby="close-title">
        <div className="l-container">
          <h2 id="close-title">Ready when your next show is.</h2>
          <p>Tell us about your club and your next show date. We’ll help you set it up.</p>
          <div className="lc-hero-ctas" style={{ justifyContent: 'center' }}>
            <a href={BRING_YOUR_CLUB.href} className="l-btn l-btn-primary l-btn-lg min-h-11">
              {BRING_YOUR_CLUB.label}
            </a>
            <Link to={FIND_A_SHOW.to} className="l-btn l-btn-ghost l-btn-lg min-h-11">
              {FIND_A_SHOW.label}
            </Link>
          </div>
        </div>
      </section>
      <ClubOnboarding />
    </>
  );
}
```

In the moved `ClubOnboarding.tsx`, make only these copy and class changes (line numbers are from the v2 file):

| Line     | Today                                                                | Change to                                                                         |
| -------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| heading  | "Run your next trial on myK9Show."                                   | "Bring your club to myK9Show."                                                    |
| 159      | `Requesting club onboarding takes a myK9Show account — it's free. …` | `Requesting club onboarding takes a myK9Show account, and the account is free. …` |
| 163, 341 | `className="l-btn l-btn-primary l-btn-lg"`                           | add `min-h-11`                                                                    |
| 165, 343 | `<span aria-hidden="true">→</span>`                                  | delete the span                                                                   |
| 182      | "Create one for free" text button                                    | confirm it measures at least 44px tall; add `min-h-11` if not                     |
| 217      | `Thanks for your interest — we'll review …`                          | `Thanks for your interest. We'll review …`                                        |
| 347      | `No obligation — this just starts a conversation. …`                 | `No obligation. This just starts a conversation. …`                               |

Add this case to `lifecycle/__tests__/ClubOnboarding.test.tsx`, and update its heading assertion:

```tsx
import { BANNED_COPY } from '../lifecycleStories';
// ...
it('contains no banned copy in the signed-out state', () => {
  const { container } = render(<ClubOnboarding />);
  for (const re of BANNED_COPY) expect(container.textContent ?? '').not.toMatch(re);
});
```

- [ ] **Step 8: Write `LandingFooter.tsx`.** Copy v2's footer with these changes: remove the version stamp and "pre-launch"; point product links at `#how-it-works`; make "Sanctioning" plain text with no link styling; write the copyright as `© {new Date().getFullYear()} RyKris LLC`; delete `constants.ts`; give every footer link `min-h-11 inline-flex items-center`.

- [ ] **Step 9: Wire `Home.tsx` and delete v2.** In `Home.tsx`, delete `scrollToWaitlist` and `closingRef`, keep the `#get-started` effect, and render:

```tsx
<div className="landing-v2">
  <LandingHeader />
  <ShowTodayBanner />
  <LandingHero />
  <LifecycleTimeline />
  <TrustSection />
  <LandingClose />
  <LandingFooter />
</div>
```

`index.ts` re-exports those seven components plus `ClubOnboarding`. Then:

```bash
cd apps/myk9show/src/components/landing
git mv v2/ClubOnboarding.tsx lifecycle/ClubOnboarding.tsx
git mv v2/ClubOnboarding.test.tsx lifecycle/__tests__/ClubOnboarding.test.tsx
git mv v2/HomeBranding.test.tsx lifecycle/__tests__/HomeBranding.test.tsx
git mv v2/LandingHeader.test.tsx lifecycle/__tests__/LandingHeader.test.tsx
git rm -r v2
```

In `src/styles/landing.css`, delete each rule whose class no longer appears in `src/`. Check each with `grep -rn "<class>" src --include=*.tsx` for `l-cred`, `l-tagline`, `l-feature`, `l-ringside`, `l-phone`, `l-status-chip`, `l-photo-meta`, `l-audience-tag`. Keep the `.l-waitlist` form-input rules `ClubOnboarding` reuses; grep `ClubOnboarding.tsx` before deleting any class.

- [ ] **Step 9b: [ADDED] Remove the blank band above the header (Review Focus 8 and 9).** `AppHeader` hides itself for a guest on `/`, but `SidebarLayout`'s `<main>` still pads for it, and `.l-hdr` sticks below where the app header would be. Make both read one rule.

Write the failing test `src/components/layout/__tests__/useIsGuestLanding.test.tsx`:

```tsx
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { useIsGuestLanding } from '../useIsGuestLanding';

const auth = vi.hoisted(() => ({ user: null as null | { id: string } }));
vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => auth }));

const at = (path: string) => ({
  wrapper: ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
  ),
});

describe('useIsGuestLanding', () => {
  it('is true only for a guest on the root path', () => {
    auth.user = null;
    expect(renderHook(useIsGuestLanding, at('/')).result.current).toBe(true);
    expect(renderHook(useIsGuestLanding, at('/shows')).result.current).toBe(false);
  });

  it('is false for a signed-in user on the root path (onboarding return)', () => {
    auth.user = { id: 'u1' };
    expect(renderHook(useIsGuestLanding, at('/?onboarding=true')).result.current).toBe(false);
  });
});
```

Run it red (`pnpm vitest run src/components/layout/__tests__/useIsGuestLanding.test.tsx`; module not found). Then create `src/components/layout/useIsGuestLanding.ts`:

```ts
import { useLocation } from 'react-router-dom';
import { useAuthContext } from '@/hooks/useAuthContext';

// The guest landing page at `/` draws its own header, so the app header is absent there.
// AppHeader (hide) and SidebarLayout (no header padding) must agree, or the shell pads for
// a header that is never drawn: the blank band in docs/qa/landing-page-ux-audit.md.
export function useIsGuestLanding(): boolean {
  const { user } = useAuthContext();
  const { pathname } = useLocation();
  return !user && pathname === '/';
}
```

Then make three changes:

- In `AppHeader.tsx`, replace line 57's local `const isGuestLanding = !user && location.pathname === '/';` with `const isGuestLanding = useIsGuestLanding();`. Behaviour is unchanged, and the existing `AppHeader` tests must still pass.
- In `SidebarLayout.tsx`, call `const isGuestLanding = useIsGuestLanding();` and change the `<main>` class `'flex-1 min-w-0 pt-[var(--app-header-height,3rem)]'` to `cn('flex-1 min-w-0', isGuestLanding ? 'pt-0' : 'pt-[var(--app-header-height,3rem)]')`. Leave the comment block above `<main>` in place, and add one line naming `useIsGuestLanding`.
- In `Home.tsx`, read `const { user } = useAuthContext();` and set `data-guest={user ? 'false' : 'true'}` on the `.landing-v2` root. Add to `lifecycle.css`:

```css
/* Guests have no app header above the landing header; signed-in onboarding returns do. */
.landing-v2[data-guest='true'] .l-hdr {
  top: var(--pwa-banner-height, 0px);
}
```

The signed-in case keeps the existing `top: var(--app-top-inset, 3rem)` from `landing.css`, so the landing header pins under the app header.

Run green: `pnpm vitest run src/components/layout/__tests__/useIsGuestLanding.test.tsx src/components/layout/AppHeader.test.tsx`, expecting PASS. Mutation check: flip the hook to `return pathname === '/';` and confirm the signed-in case goes red. Then revert.

- [ ] **Step 10: Update coupled tests and comments.**
  - Point `brandAssets.test.ts:87` at `src/components/landing/lifecycle/LandingHeader.tsx`.
  - Point `unifiedBranding.test.ts:23` at `src/components/landing/lifecycle/__tests__/HomeBranding.test.tsx`.
  - Remove the `keeps the browser out of the privileged invite function` block and the `waitlistFormSource` read from `waitlistInviteTrigger.source.test.ts`.
  - Fix the comment path at `data/organizations.ts:26`.
  - In `src/test/e2e/simple-connectivity.spec.ts:12`, replace `page.getByRole('link', { name: 'Browse shows' })` with `page.locator('#top').getByRole('link', { name: 'Find a show' })`. This spec is in `PR_SMOKE_SPECS`. The step checks for the public discovery link, so it keeps pointing at "Find a show". It is scoped to the hero because the label now appears in the header, hero and close, and an unscoped locator fails Playwright's strict mode.
  - Run `grep -rn "landing/v2" apps/myk9show` and expect no hits.

- [ ] **Step 11: Run the touched suites green**

```bash
cd apps/myk9show && pnpm vitest run src/pages/Home.test.tsx src/components/landing src/components/layout src/test/branding src/test/database/waitlistInviteTrigger.source.test.ts > ../../.logs/landing-unit.log 2>&1; echo "EXIT=$?"
```

- [ ] **Step 12: Commit**

```bash
git add -A apps/myk9show/src/components/landing apps/myk9show/src/components/layout apps/myk9show/src/pages/Home.tsx apps/myk9show/src/pages/Home.test.tsx apps/myk9show/src/test apps/myk9show/src/data/organizations.ts apps/myk9show/src/styles/landing.css
git commit -m "feat(landing): clubs-first launch page with the show lifecycle; remove waitlist sections"
```

---

### Task 7: Browser verification spec

**Files:**

- Create: `apps/myk9show/src/test/e2e/landing-lifecycle.spec.ts`
- Modify: `apps/myk9show/playwright.ci.config.ts:212` (add `'**/landing-lifecycle.spec.ts',` to `PR_SMOKE_SPECS`; anonymous, no credentials)
- Modify: `docs/qa/e2e-suite-map.md` (a row next to `simple-connectivity.spec.ts`, line 193; `pnpm qa:e2e-map:check` fails CI without it)

- [ ] **Step 1: Write the spec**

```ts
import { expect, test, type Page } from '@playwright/test';

const STEPS = ['setup', 'entries', 'before', 'showday', 'results', 'after'];
const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
];

const reachedDots = (page: Page) =>
  page.evaluate(
    ids => ids.map(id => document.getElementById(`${id}-dot`)?.getAttribute('data-reached')),
    STEPS
  );

async function scrollDotToMiddle(page: Page, id: string) {
  await page.evaluate(stepId => {
    const dot = document.getElementById(`${stepId}-dot`)!;
    const top = dot.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, top - window.innerHeight * 0.4);
  }, id);
  await page.waitForTimeout(150);
}

for (const vp of VIEWPORTS) {
  test.describe(`landing @ ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('hero: two-line H1, Bring your club above the fold', async ({ page }) => {
      await page.goto('/');
      const h1 = page.getByRole('heading', { level: 1 });
      const lines = await h1.evaluate(el =>
        Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight))
      );
      expect(lines).toBeLessThanOrEqual(2);
      const box = await page
        .locator('#top')
        .getByRole('link', { name: 'Bring your club' })
        .boundingBox();
      expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height);
    });

    test('no sideways scroll, no text under 14px, no control under 44px', async ({ page }) => {
      await page.goto('/');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(600);
      const report = await page.evaluate(() => {
        const small: string[] = [];
        document.querySelectorAll('.landing-v2 *').forEach(el => {
          const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent!.trim());
          if (hasText && parseFloat(getComputedStyle(el).fontSize) < 14)
            small.push(el.textContent!.trim().slice(0, 30));
        });
        const tiny = [
          ...document.querySelectorAll<HTMLElement>(
            '.landing-v2 a, .landing-v2 button, .landing-v2 input, .landing-v2 select, .landing-v2 textarea'
          ),
        ]
          .filter(el => el.offsetParent !== null && el.getBoundingClientRect().height < 44)
          .map(el => `${el.tagName}:${(el.textContent || el.id).trim().slice(0, 30)}`);
        return { hscroll: document.documentElement.scrollWidth > window.innerWidth, small, tiny };
      });
      expect(report.hscroll).toBe(false);
      expect(report.small).toEqual([]);
      expect(report.tiny).toEqual([]);
    });

    test('dots follow the reader both ways; content stays revealed', async ({ page }) => {
      await page.goto('/');
      await scrollDotToMiddle(page, 'showday');
      expect(await reachedDots(page)).toEqual(['true', 'true', 'true', 'true', 'false', 'false']);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(150);
      expect(await reachedDots(page)).toEqual(Array(6).fill('false'));
      const revealed = await page.evaluate(() =>
        document.getElementById('showday')!.getAttribute('data-revealed')
      );
      expect(revealed).toBe('true');
    });

    test('switching audience keeps progress and swaps the story', async ({ page }) => {
      await page.goto('/');
      await scrollDotToMiddle(page, 'showday');
      await page.getByRole('button', { name: 'I’m entering a show' }).click();
      await expect(page.locator('#entries h3')).toHaveText('Enter in a few minutes');
      expect((await reachedDots(page)).slice(0, 4)).toEqual(['true', 'true', 'true', 'true']);
    });

    test('explainer pauses and steps', async ({ page }) => {
      await page.goto('/');
      const fig = page.locator('#showday figure');
      await fig.scrollIntoViewIfNeeded();
      await fig.getByRole('button', { name: 'Pause' }).click();
      const before = await fig.locator('figcaption').innerText();
      await page.waitForTimeout(3000);
      expect(await fig.locator('figcaption').innerText()).toBe(before);
      await fig.getByRole('button', { name: 'Next' }).click();
      expect(await fig.locator('figcaption').innerText()).not.toBe(before);
    });

    // [ADDED] Review Focus 9: no blank band where the hidden app header used to be padded for.
    test('guest header sits at the top with no blank band', async ({ page }) => {
      await page.goto('/');
      const tops = await page.evaluate(() => ({
        page: document.querySelector('.landing-v2')!.getBoundingClientRect().top,
        header: document.querySelector('.landing-v2 .l-hdr')!.getBoundingClientRect().top,
      }));
      expect(tops.page).toBeLessThanOrEqual(1);
      expect(tops.header).toBeLessThanOrEqual(1);
    });

    // [ADDED] Review Focus 10: the share image is a real JPEG, not the SPA's HTML fallback.
    test('og image is a real image', async ({ request }) => {
      const res = await request.get('/og-image.jpg');
      expect(res.status()).toBe(200);
      expect(res.headers()['content-type']).toContain('image/jpeg');
    });

    test('rendered copy has no em dash, arrow or pre-launch words', async ({ page }) => {
      await page.goto('/');
      const text = await page.locator('.landing-v2').innerText();
      for (const re of [/—/, /→/, /waitlist/i, /pre-launch/i, /launching/i])
        expect(text).not.toMatch(re);
    });

    test('text uses only Playfair Display and Montserrat', async ({ page }) => {
      await page.goto('/');
      const families = await page.evaluate(() => {
        const seen = new Set<string>();
        document.querySelectorAll('.landing-v2 *').forEach(el => {
          const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent!.trim());
          if (hasText)
            seen.add(getComputedStyle(el).fontFamily.split(',')[0]!.replace(/"/g, '').trim());
        });
        return [...seen].sort();
      });
      expect(families).toEqual(['Montserrat', 'Playfair Display']);
    });

    // Known-answer probe so a broken harness cannot pass by accident (LESSONS "measurement-harness").
    test('step copy, meanwhile copy and captions meet 4.5:1 on their rendered ground', async ({
      page,
    }) => {
      await page.goto('/');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(600);
      const result = await page.evaluate(() => {
        const lin = (c: number) =>
          (c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        const lum = (rgb: number[]) =>
          0.2126 * lin(rgb[0]!) + 0.7152 * lin(rgb[1]!) + 0.0722 * lin(rgb[2]!);
        const parse = (s: string) => (s.match(/[\d.]+/g) ?? []).map(Number);
        const ground = (el: Element): number[] => {
          for (let n: Element | null = el; n; n = n.parentElement) {
            const c = parse(getComputedStyle(n).backgroundColor);
            if (c.length === 3 || (c[3] ?? 1) > 0.99) return c.slice(0, 3);
          }
          return [255, 255, 255];
        };
        const ratio = (el: Element) => {
          const a = lum(parse(getComputedStyle(el).color).slice(0, 3));
          const b = lum(ground(el));
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        };
        const probe = document.createElement('span');
        probe.style.cssText = 'color:#999;background:#aaa';
        probe.textContent = 'probe';
        document.body.appendChild(probe);
        const probeRatio = ratio(probe);
        probe.remove();
        const failures = [
          ...document.querySelectorAll(
            '.lc-step-body, .lc-meanwhile-text, .lc-lead, .lc-explainer-text, .lc-switch button, .l-lede, .lc-hero-registries'
          ),
        ]
          .map(el => ({ text: el.textContent!.trim().slice(0, 30), ratio: +ratio(el).toFixed(2) }))
          .filter(x => x.ratio < 4.5);
        return { probeRatio, failures };
      });
      expect(result.probeRatio).toBeLessThan(1.5);
      expect(result.failures).toEqual([]);
    });

    test('page length is 8 to 14 screens on phone', async ({ page }) => {
      test.skip(vp.name !== 'phone');
      await page.goto('/');
      const screens = await page.evaluate(
        () => document.documentElement.scrollHeight / window.innerHeight
      );
      expect(screens).toBeGreaterThanOrEqual(8);
      expect(screens).toBeLessThanOrEqual(14);
    });
  });
}

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
  test('everything is revealed and explainers start paused', async ({ page }) => {
    await page.goto('/');
    for (const id of STEPS) {
      expect(await page.locator(`#${id}`).getAttribute('data-revealed')).toBe('true');
    }
    const fig = page.locator('#showday figure');
    await fig.scrollIntoViewIfNeeded();
    await expect(fig.getByRole('button', { name: 'Play' })).toBeVisible();
    const t = await page
      .locator('.lc-dot')
      .first()
      .evaluate(el => getComputedStyle(el).transitionDuration);
    expect(t).toBe('0s');
  });
});
```

- [ ] **Step 2: Prove the spec can fail (mutation check).** Make three temporary changes and confirm each one turns its test red:
  1. Change the progress observer's `rootMargin` to `'0px'`; the `dots follow the reader` test must fail.
  2. Make reveal reversible (drop `reveal.unobserve`, and set revealed to false when not intersecting); the `content stays revealed` assertion must fail.
  3. Put a literal `—` in one step body; the copy test must fail.

  Revert all three and print `git diff --stat` to confirm the revert.

```bash
cd apps/myk9show && pnpm exec playwright test src/test/e2e/landing-lifecycle.spec.ts --project=chromium > ../../.logs/landing-e2e.log 2>&1; echo "EXIT=$?"
```

- [ ] **Step 3: Run green, plus the existing smoke specs that cover `/`.**

```bash
cd apps/myk9show && pnpm exec playwright test src/test/e2e/landing-lifecycle.spec.ts --project=chromium --project=mobile-chrome --project=mobile-safari --project=firefox > ../../.logs/landing-e2e.log 2>&1; echo "EXIT=$?"
```

```bash
cd apps/myk9show && pnpm exec playwright test src/test/e2e/simple-connectivity.spec.ts --project=chromium > ../../.logs/landing-smoke.log 2>&1; echo "EXIT=$?"
```

```bash
cd apps/myk9show && PLAYWRIGHT_A11Y=true pnpm exec playwright test --config=playwright.ci.config.ts -g "Landing" > ../../.logs/landing-a11y.log 2>&1; echo "EXIT=$?"
```

```bash
pnpm qa:e2e-map:check > .logs/e2e-map.log 2>&1; echo "EXIT=$?"
```

All must show EXIT=0. Firefox is included because the scroll progress must not depend on CSS scroll-driven animation. If axe reports a violation, fix the markup, not the rule.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/test/e2e/landing-lifecycle.spec.ts apps/myk9show/playwright.ci.config.ts docs/qa/e2e-suite-map.md
git commit -m "test(e2e): landing lifecycle geometry, progress, explainer and copy checks"
```

---

### Task 8: Testing phase: full gates, visual review, ship

- [ ] **Step 1: Full app checks**

```bash
pnpm typecheck > .logs/typecheck.log 2>&1; echo "EXIT=$?"
pnpm lint > .logs/lint.log 2>&1; echo "EXIT=$?"
cd apps/myk9show && pnpm vitest run --sequence.shuffle > ../../.logs/suite-shuffle.log 2>&1; echo "EXIT=$?"
cd ../.. && pnpm qa:code-quality-ratchet > .logs/ratchet.log 2>&1; echo "EXIT=$?"
pnpm qa:plans > .logs/plans.log 2>&1; echo "EXIT=$?"
```

All must show EXIT=0. If shuffled vitest fails only in a file this branch did not touch, report it with its log lines and do not fix it here.

- [ ] **Step 2: Visual review against canvas D.** Start the dev server (`preview_start` name `myK9Show`, logged out). Screenshot at 390x844 and 1440x900:
  - the fold
  - show day in both audiences, with the explainer mid-sequence
  - the close

  Compare against canvas D. Scroll the timeline slowly down and back up, and confirm the dots and line follow. Attach the screenshots to the PR.

  [ADDED] The canvas is private to the owner, so sub-agents and the Codex reviewer cannot open it. Every value it carries (copy, order, sizes, explainer boxes) is already in this plan. The side-by-side comparison is the owner's: post the screenshots in the PR and ask them to compare, or ask them to share the canvas from its Share menu.

- [ ] **Step 3: Signed-in paths still work.** [EXPANDED] With a seeded secretary session (`@myk9t.com` per `testUsers.ts`):
  - visit `/` and confirm the existing redirect to the dashboard still happens.
  - visit `/?onboarding=true#get-started` (the return path `ClubOnboarding` builds for sign-in and sign-up). Confirm exactly one landing header, pinned under the app header and not overlapping it, and the club form scrolled into view with name and email pre-filled. Screenshot it for the PR.

- [ ] **Step 4: Ship.**
  - Run `/simplify`, then the `commit` skill's high-risk ladder, then `ship-pr`.
  - Run `pnpm qa:review-tier --base origin/main` for the review floor.
  - PR body: link this plan, the audit and canvas D; include before/after screenshots, the D1 follow-up issue link, and the non-goals.

- [ ] **Step 5: After merge.** This frontend change ships only on the next **Deploy myK9Show** run (owner-triggered). When the owner says it ran, prove it with a string that exists only in this change:
  - `curl -s https://myk9show.com/ | grep -o 'assets/index-[^"]*\.js'`
  - fetch that chunk and run `grep -c "Show me the story for"` (expected 1)

  Then flip this plan to `Complete`, `git mv` it to `docs/archive/`, and drop its row from `docs/README.md`.

## Rollback

The change is a single squash commit touching only `apps/myk9show` source (including the shared `SidebarLayout`/`AppHeader` guest-landing rule), tests, public images, `vite.config.ts` and docs. There is no migration, edge function or environment-variable change. Rollback is `git revert <merge sha>` on `main`, then a Deploy myK9Show run. Nothing deploys on merge, so a bad merge is not live until someone runs the workflow. The waitlist table and trigger are untouched, so a revert restores working waitlist forms.

## Non-goals

- No change to `/shows`, show detail pages, the sign-up flow, or `ClubOnboarding`'s behaviour. Its heading, three em-dash sentences, two arrow spans and button classes change; its state machine, submit path and data do not.
- No database or edge-function change. `platform_waitlist`, its trigger and `send-waitlist-invite` stay (D1 follow-up).
- No show photos inside the timeline yet. Owner to supply 3 to 4 show-day photos; a follow-up can set screenshots into them.
- No testimonial or fees strip yet. Add a real club quote once one exists; fees stay a footer link to `/fees`.
- No new analytics. No dark-mode redesign (`.landing-v2` stays `color-scheme: light`).
- No separate page per audience: one page, one switch (CLAUDE.md § consolidate).

## Validation Profile

- Risk: high
- Validation: full
- Rationale: deletes a component directory, edits `vite.config.ts` (service-worker precache) and the PR-smoke e2e list, adds observer-driven behaviour, changes the app-shell header padding in `SidebarLayout` and `AppHeader` (every page renders through them; the change is limited to the guest-on-`/` case), and touches well over three production files, so the `commit` skill's high-risk ladder applies even though no data, auth or payment path changes.

## Follow-ups to file when this plan starts

- Delete the `platform_waitlist` insert path, trigger and `send-waitlist-invite` once the rebuild merges (D1).
- Show-day photos in the timeline, once the owner supplies them.
- A club testimonial and a one-line fees strip, once a real quote exists.
- Flip the homepage to exhibitor-first (D6) when `/shows` lists enough shows.
- A Linear issue for this plan itself: set it In Progress per CLAUDE.md Gates step 1, and run `pnpm qa:inflight` against `apps/myk9show/src/components/landing`, `src/pages/Home.tsx` and `src/styles/landing.css`.
