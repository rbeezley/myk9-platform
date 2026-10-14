# Landing Page Lifecycle Rebuild Implementation Plan

> **Status:** Active

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the pre-launch waitlist landing page at `/` with a launch page that recruits clubs first. A two-sided timeline tells the life of one show: what you do on the left, what the other side is doing ("Meanwhile") on the right. An audience switch opens on "I'm running a show" and offers "I'm entering a show". On the club story's show day, a **working practice scoresheet** lets visitors cut the venue's signal, time and score practice dogs with the real timer and result buttons, and watch the queued scores sync when the signal returns. The line between steps is a **scent trail** that winds like a dog working a search and marks "Alert!" at Results, and the club's "Before show day" step shows a **night-before checklist** that ticks itself green. Explainer slides animate the exhibitor screenshots.

**Design reference:** canvas version **D**, "A's hero + B's timeline + audience switch" (https://claude.ai/artifact/VaDuhw1AHVTZroApgs9VJb, file `project/Combined.dc.html`). It is a mockup: copy, ordering, sizes and explainer coordinates carry over; its code does not. Two of its techniques are replaced here: the moving spotlight becomes cross-faded fixed boxes (opacity only), and scroll progress uses IntersectionObserver against the real document scroll, which the canvas frame could not demonstrate.

**Architecture:** New sections live in `apps/myk9show/src/components/landing/lifecycle/`. Both stories (club and exhibitor) are typed data in `lifecycleStories.ts`, so copy rules, image budgets and explainer geometry are tested against data and rendered output. `LifecycleTimeline` holds the audience state and renders one `TimelineStep` per step. `useTimelineProgress` reports which steps the reader has reached; dots and line segments fill up to the reader's position and un-fill when they scroll back up, while step content reveals once. `ScreenshotExplainer` cross-fades a highlight box and caption per step, with Pause and Next, auto-advancing only while on screen. `components/landing/v2/` is deleted at the end, except `ClubOnboarding`, which moves into the new folder.

**Tech Stack:** React 19 + TypeScript, react-router `Link`, plain CSS scoped under `.landing-v2` (tokens from `src/styles/landing.css` and `src/index.css`), vitest + the custom `render` from `src/test/utils/testUtils.tsx`, Playwright (`src/test/e2e/`).

**Spec:** [`docs/qa/landing-page-ux-audit.md`](qa/landing-page-ux-audit.md) (findings, measured against scroll-craft's taste/feel/verify checklists and [`docs/INTENT.md`](INTENT.md)), plus the owner's canvas review on 2026-10-13 recorded in the decisions below.

## Decisions taken

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | In this plan                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Both waitlist forms go. Today a "Club / secretary" signup inserts into `platform_waitlist`, and a DB trigger sends an early-access invite (`send-waitlist-invite`). After launch, clubs use the existing `ClubOnboarding` request flow.                                                                                                                                                                                                                                                                                     | Remove the forms. Leave the table, trigger and edge function in place and unused. File a follow-up to delete them.               |
| D2  | Product claims on the current page that cannot be traced to a shipped, user-visible feature are dropped, not reworded.                                                                                                                                                                                                                                                                                                                                                                                                      | Task 1 decides each claim from evidence. "Thirteen years of placements" is already DROPPED (no legacy results were imported).    |
| D3  | The page names no launch date and no version number.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Timeless copy                                                                                                                    |
| D4  | The Ziva & Tera photo stays, as a full-width band (A's hero), without the caption pill.                                                                                                                                                                                                                                                                                                                                                                                                                                     | Keep                                                                                                                             |
| D5  | Online entries are off for some shows (per-show switch, MYK9-979).                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Copy says "enter online where the club accepts it"                                                                               |
| D6  | **The homepage recruits clubs first (owner, 2026-10-13).** Most exhibitors arrive on a specific show page through their club's link, and with few clubs signed up "Find a show" leads to a short list.                                                                                                                                                                                                                                                                                                                      | "Bring your club" is the primary CTA in header, hero and close; the switch opens on the club story. Revisit when `/shows` fills. |
| D7  | **Layout is canvas version D (owner, 2026-10-13):** A's hero, B's two-sided timeline, the audience switch, compact quiet steps, and show day as the one peak on a white panel.                                                                                                                                                                                                                                                                                                                                              | Tasks 4 to 6                                                                                                                     |
| D8  | **Motion explains, it does not decorate.** Explainer slides on two exhibitor screenshots (entries, show day). Scroll progress: dots and line fill to the reader's position and un-fill on scroll up; content rises in once.                                                                                                                                                                                                                                                                                                 | Tasks 3 and 5                                                                                                                    |
| D9  | **Club show day is a working practice scoresheet (owner, 2026-10-13; canvas E2).** A landing-only component: practice dogs, the real `useStopwatch` timer and real `ResultChoiceChips` from `@myk9/scoring-ui` (both pure UI: no storage, no network, no replication), and a simulated venue signal and score queue. It never imports ringside scoring, sync or entry code. E1 (screenshot hotspot) was the cheaper option; the owner preferred E2 because visitors actually score. E3 (live practice ring) is a follow-up. | Task 4b                                                                                                                          |
| D10 | **The timeline line is a scent trail (owner, 2026-10-13; canvas F1).** Between dots the line winds like a dog working a search, alternating sides, with an "Alert!" marker at Results; after Results it becomes a quiet dashed line. It follows the reader's scroll exactly like the dots (fills down, pulls back up).                                                                                                                                                                                                      | Task 5                                                                                                                           |
| D11 | **The club's "Before show day" step shows a night-before checklist (owner, 2026-10-13; canvas F2).** It ticks five checks green and ends "Everything is handled." **Honesty rule:** until MYK9-1145 builds the real "Ready for show day" screen, the card lists only checks the app really makes today (the setup readiness signals in `features/show-workbench/setupReadinessSignals.ts`). Entries reconciled, printing and offline-tablet lines join only when MYK9-1145 ships.                                           | Task 4c                                                                                                                          |
| D12 | **The club call to action reads "Add your club" (owner, 2026-10-13),** replacing "Bring your club" in the header, hero, close and the club form heading ("Add your club to myK9Show."). Code samples below still show the old label; the constant is `ADD_YOUR_CLUB`.                                                                                                                                                                                                                                                       | Task 8                                                                                                                           |

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
- The practice scoresheet demo reuses the real timer (`useStopwatch`, voice announcements and the 30-second warning off) and the real result buttons (`ResultChoiceChips`, faults hidden), so it cannot drift from what judges see. Only the venue signal and the score queue are simulated, and the wording matches the ringside app's offline states. It makes no network request, stores nothing, and imports nothing from ringside scoring, sync or entry code. The signal switch is a real `role="switch"` button with `aria-checked`, and status changes are announced through one `aria-live="polite"` line.
- The night-before card lists only checks the app makes today (D11). A test pins the list to the setup readiness signals.
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
7. [ADDED] **Switching audience mid-demo.** Club show day renders the practice scoresheet and exhibitor show day renders a 3-step explainer, in the same slot. Switching must unmount one cleanly (no timer firing into an unmounted component, no stopwatch left running) and start the other fresh. `ScreenshotExplainer` also clamps its index, in case a step list ever shrinks. _Test:_ Task 4b `clears its timers on unmount`; Task 5 `switching audience mid-demo does not crash`.
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
  scoresheetDemo?: true; // club show day: the working practice scoresheet (D9)
  nightBefore?: true; // club before show day: the night-before checklist (D11)
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

  // [ADDED] D9 and D11
  it('gives the club story the practice scoresheet on show day and the night-before card before it', () => {
    const club = (id: string) => STORIES.club.find(x => x.id === id)!;
    expect(club('showday').scoresheetDemo).toBe(true);
    expect(club('showday').explainer).toBeUndefined();
    expect(club('before').nightBefore).toBe(true);
    expect(STORIES.exhibitor.some(x => x.scoresheetDemo || x.nightBefore)).toBe(false);
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
  scoresheetDemo?: true; // club show day: the working practice scoresheet (D9)
  nightBefore?: true; // club before show day: the night-before checklist (D11)
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
      nightBefore: true,
      meanwhile: 'Exhibitors see their armband and their place in the running order.',
      meanwhileShot: SHOTS['e-12'],
    },
    {
      id: 'showday',
      peak: true,
      title: 'Show day',
      body: 'Judges score at the ring on a tablet, even with no signal. Scores catch up on their own when the connection comes back.',
      shot: SHOTS['j-04'],
      scoresheetDemo: true,
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

- [ ] **Step 6: Run green.** Same command; expected PASS (9 tests).

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

### Task 4b: [ADDED] `ScoresheetDemo`, the working practice scoresheet (D9)

**Files:**

- Create: `apps/myk9show/src/components/landing/lifecycle/ScoresheetDemo.tsx`
- Create: `apps/myk9show/src/components/landing/lifecycle/scoresheetDemo.css`
- Test: `apps/myk9show/src/components/landing/lifecycle/__tests__/ScoresheetDemo.test.tsx`

**Interfaces:**

- Consumes: `useStopwatch`, `ResultChoiceChips` and the `QualifyingResult` type from `@myk9/scoring-ui` (exported at `packages/scoring-ui/src/index.ts:21` and `:92`). Both are pure UI: `useStopwatch` is React state only; `ResultChoiceChips` only calls `onResultChange`.
- Produces: `export function ScoresheetDemo(props: { syncMs?: number }): JSX.Element` and `export const PRACTICE_DOGS`.

**Boundary (non-negotiable):** this file imports nothing from ringside scoring, replication, sync, entries or Supabase. `grep -nE "replication|supabase|at-show|mutation" ScoresheetDemo.tsx` must print nothing; Step 5 runs it.

- [ ] **Step 1: Write the failing test**

```tsx
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { ScoresheetDemo } from '../ScoresheetDemo';

const sw = () => screen.getByRole('switch', { name: 'Venue signal' });
const status = () => screen.getByTestId('scoresheet-status');
const log = () => screen.getByRole('list', { name: 'Scores this session' });
const save = () => screen.getByRole('button', { name: 'Save' });

describe('ScoresheetDemo', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('uses the real result buttons from the scoring package', () => {
    render(<ScoresheetDemo />);
    for (const label of ['Qualified', 'NQ', 'Absent', 'Excused']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('asks for a result before saving', () => {
    render(<ScoresheetDemo />);
    fireEvent.click(save());
    expect(status()).toHaveTextContent('Pick a result first');
    expect(screen.getByText('Ziva')).toBeInTheDocument();
  });

  it('queues a saved score while offline and moves to the next dog', () => {
    render(<ScoresheetDemo />);
    fireEvent.click(sw());
    fireEvent.click(screen.getByRole('button', { name: 'Absent' }));
    fireEvent.click(save());
    expect(within(log()).getByText(/#101 Ziva: Absent/)).toBeInTheDocument();
    expect(within(log()).getByText('Waiting')).toBeInTheDocument();
    expect(screen.getByText('No signal · 1 waiting')).toBeInTheDocument();
    expect(screen.getByText('Tera')).toBeInTheDocument();
  });

  it('syncs the queue in order when the signal returns', () => {
    render(<ScoresheetDemo syncMs={1000} />);
    fireEvent.click(sw());
    fireEvent.click(screen.getByRole('button', { name: 'Absent' }));
    fireEvent.click(save());
    fireEvent.click(screen.getByRole('button', { name: 'Excused' }));
    fireEvent.click(save());
    fireEvent.click(sw());
    expect(screen.getByText('Syncing 2…')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1000));
    expect(within(log()).queryByText('Waiting')).toBeNull();
    expect(within(log()).getAllByText('Synced')).toHaveLength(2);
    expect(status()).toHaveTextContent('All 2 synced, in the order they were scored.');
  });

  it('saves straight through while online', () => {
    render(<ScoresheetDemo />);
    fireEvent.click(screen.getByRole('button', { name: 'Absent' }));
    fireEvent.click(save());
    expect(within(log()).getByText('Synced')).toBeInTheDocument();
    expect(status()).toHaveTextContent('Ziva saved and synced.');
  });

  it('starts and stops the real timer', () => {
    render(<ScoresheetDemo />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(screen.getByRole('button', { name: /Resume|Start/ })).toBeInTheDocument();
  });

  it('clears its timers on unmount', () => {
    const { unmount } = render(<ScoresheetDemo syncMs={1000} />);
    fireEvent.click(sw());
    fireEvent.click(screen.getByRole('button', { name: 'Absent' }));
    fireEvent.click(save());
    fireEvent.click(sw());
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
```

- [ ] **Step 2: Run red.** Run `pnpm vitest run src/components/landing/lifecycle/__tests__/ScoresheetDemo.test.tsx`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement `ScoresheetDemo.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { ResultChoiceChips, useStopwatch, type QualifyingResult } from '@myk9/scoring-ui';
import './scoresheetDemo.css';

// Practice dogs for the landing-page demo. Ziva and Tera are the owner's dogs (the hero photo).
export const PRACTICE_DOGS = [
  { arm: 101, name: 'Ziva', breed: 'Belgian Tervuren', handler: 'R. Beezley' },
  { arm: 102, name: 'Tera', breed: 'Dutch Shepherd', handler: 'R. Beezley' },
  { arm: 103, name: 'Juno', breed: 'Labrador Retriever', handler: 'K. Patel' },
  { arm: 104, name: 'Mosby', breed: 'Vizsla', handler: 'D. Chen' },
] as const;

const RESULT_LABEL: Record<QualifyingResult, string> = {
  Q: 'Qualified',
  NQ: 'NQ',
  ABS: 'Absent',
  EX: 'Excused',
  DQ: 'DQ',
};
type Logged = {
  arm: number;
  name: string;
  result: string;
  state: 'waiting' | 'synced';
};

// Working practice scoresheet for the landing page (canvas E2, plan D9).
// INTENT: lets a visitor feel the real behaviour (scoring keeps working with no signal and
// catches up on its own). The timer and result buttons are the real ones from
// @myk9/scoring-ui; only the venue signal and the score queue are simulated here.
// Nothing is saved, nothing goes over the network, and no ringside or sync code is imported.
export function ScoresheetDemo({ syncMs = 1400 }: { syncMs?: number }) {
  const stopwatch = useStopwatch({
    maxTime: '2:00',
    enableVoiceAnnouncements: false,
    thirtySecondWarning: false,
  });
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<QualifyingResult | null>(null);
  const [log, setLog] = useState<Logged[]>([]);
  const [message, setMessage] = useState(
    'Turn the signal off, press Start, pick a result and Save.'
  );
  const syncTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(syncTimer.current), []);

  const dog = PRACTICE_DOGS[index % PRACTICE_DOGS.length]!;
  const waiting = log.filter(l => l.state === 'waiting').length;

  const toggleSignal = () => {
    window.clearTimeout(syncTimer.current);
    if (online) {
      setOnline(false);
      setMessage('No signal. Keep scoring; nothing is lost.');
      return;
    }
    setOnline(true);
    if (!waiting) {
      setMessage('Signal is back.');
      return;
    }
    const n = waiting;
    setSyncing(true);
    setMessage(`Signal is back. Sending ${n}…`);
    syncTimer.current = window.setTimeout(() => {
      setLog(cur => cur.map(l => ({ ...l, state: 'synced' })));
      setSyncing(false);
      setMessage(`All ${n} synced, in the order they were scored.`);
    }, syncMs);
  };

  const saveScore = () => {
    if (!result) {
      setMessage('Pick a result first: Qualified, NQ, Absent or Excused.');
      return;
    }
    const elapsed = stopwatch.isRunning ? stopwatch.pause() : stopwatch.time;
    const timed = result === 'Q' || result === 'NQ';
    const entry: Logged = {
      arm: dog.arm,
      name: dog.name,
      result: RESULT_LABEL[result] + (timed ? ` · ${stopwatch.formatTime(elapsed)}` : ''),
      state: online ? 'synced' : 'waiting',
    };
    const next = [entry, ...log].slice(0, 4);
    setLog(next);
    stopwatch.reset();
    setResult(null);
    setIndex(i => i + 1);
    const n = next.filter(l => l.state === 'waiting').length;
    setMessage(
      online
        ? `${dog.name} saved and synced.`
        : `${dog.name} saved on the tablet. ${n} waiting for signal.`
    );
  };

  const badge = !online
    ? {
        text: waiting ? `No signal · ${waiting} waiting` : 'No signal',
        tone: 'amber',
      }
    : syncing
      ? { text: `Syncing ${waiting}…`, tone: 'blue' }
      : log.length && !waiting
        ? { text: 'All synced', tone: 'green' }
        : { text: 'Online', tone: 'neutral' };

  const maxMs = stopwatch.getMaxTimeMs();
  const remainingPct = maxMs ? Math.max(0, (stopwatch.getRemainingTimeMs() / maxMs) * 100) : 100;

  return (
    <div className="lc-demo">
      <div className="lc-demo-control">
        <button
          type="button"
          role="switch"
          aria-checked={online}
          aria-label="Venue signal"
          className="lc-demo-switch"
          onClick={toggleSignal}
        >
          <span className="lc-demo-knob" />
        </button>
        <div>
          <span className="lc-demo-label">Venue signal: {online ? 'On' : 'Off'}</span>
          <span className="lc-demo-hint">
            {waiting
              ? `${waiting} ${waiting === 1 ? 'score' : 'scores'} saved on the tablet, waiting`
              : online
                ? 'Tap to cut the signal, like a rural show site'
                : 'Scores keep saving on the tablet'}
          </span>
        </div>
      </div>

      <div className="lc-demo-tablet">
        <div className="lc-demo-screen">
          <div className="lc-demo-head">
            <div>
              <div className="lc-demo-trial">Saturday Trial</div>
              <div className="lc-demo-class">Container Novice A · practice</div>
            </div>
            <span className="lc-demo-badge" data-tone={badge.tone}>
              {badge.text}
            </span>
          </div>
          <div className="lc-demo-dog">
            <span className="lc-demo-arm">{dog.arm}</span>
            <div>
              <div className="lc-demo-dogname">{dog.name}</div>
              <div className="lc-demo-meta">
                {dog.breed} · Handler: {dog.handler}
              </div>
            </div>
          </div>
          <div className="lc-demo-timer">
            <div className="lc-demo-clock">{stopwatch.formatTime(stopwatch.time)}</div>
            <div className="lc-demo-remaining">Remaining: {stopwatch.getRemainingTime()}</div>
            <div className="lc-demo-bar">
              <div style={{ width: `${remainingPct}%` }} />
            </div>
            <button
              type="button"
              className="lc-demo-start"
              data-running={stopwatch.isRunning ? 'true' : 'false'}
              onClick={() => (stopwatch.isRunning ? stopwatch.pause() : stopwatch.start())}
            >
              {stopwatch.isRunning ? 'Stop' : stopwatch.time ? 'Resume' : 'Start'}
            </button>
          </div>
          <ResultChoiceChips selectedResult={result} onResultChange={setResult} hideFaults />
          <button
            type="button"
            className="lc-demo-save"
            data-ready={result ? 'true' : 'false'}
            onClick={saveScore}
          >
            Save
          </button>
        </div>
      </div>

      <ul className="lc-demo-log" aria-label="Scores this session">
        {log.map((l, i) => (
          <li key={`${l.arm}-${i}`}>
            <span className="lc-demo-chip" data-state={l.state}>
              {l.state === 'waiting' ? 'Waiting' : 'Synced'}
            </span>
            #{l.arm} {l.name}: {l.result}
          </li>
        ))}
      </ul>
      <p data-testid="scoresheet-status" className="lc-demo-status" aria-live="polite">
        {message}
      </p>
    </div>
  );
}
```

Before relying on `stopwatch.pause()` returning the elapsed milliseconds, read `packages/scoring-ui/src/types/index.ts` (`StopwatchReturn`). The comment there says to save the returned value, not `time`. If `reset` or `formatTime` differ in name, use the real names; do not wrap or fork the hook. If `ResultChoiceChips` shows its NQ or Excused reason pickers in this context, leave them: that is what the real screen does.

- [ ] **Step 4: Write `scoresheetDemo.css`.** Scope everything under `.landing-v2`. Copy the switch, badge tones and status-line rules from canvas E2. The values are listed here so the file is self-contained:

```css
/* Working practice scoresheet (plan D9). Scoped under .landing-v2. */
.landing-v2 .lc-demo {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.landing-v2 .lc-demo-control {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 0.875rem 1.125rem;
  background: var(--ivory-50);
  border: 1px solid #e8e2d4;
  border-radius: 16px;
}
.landing-v2 .lc-demo-label {
  display: block;
  font-size: 1.0625rem;
  font-weight: 700;
  color: var(--ink-900);
}
.landing-v2 .lc-demo-hint {
  display: block;
  font-size: 0.9375rem;
  color: var(--stone-500);
}
.landing-v2 .lc-demo-switch {
  position: relative;
  flex: 0 0 auto;
  width: 76px;
  height: 44px;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  background: #b8ae9c;
  transition: background-color 200ms ease;
}
.landing-v2 .lc-demo-switch[aria-checked='true'] {
  background: #2f7d46;
}
.landing-v2 .lc-demo-switch:focus-visible {
  outline: 2px solid var(--terracotta-600);
  outline-offset: 3px;
}
.landing-v2 .lc-demo-knob {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 36px;
  height: 36px;
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 2px 6px rgb(0 0 0 / 0.25);
  transition: transform 200ms cubic-bezier(0.23, 1, 0.32, 1);
}
.landing-v2 .lc-demo-switch[aria-checked='true'] .lc-demo-knob {
  transform: translateX(32px);
}
.landing-v2 .lc-demo-tablet {
  max-width: 520px;
  padding: 16px;
  border-radius: 28px;
  background: #2a241f;
  box-shadow: 0 40px 70px -36px rgb(0 0 0 / 0.55);
}
.landing-v2 .lc-demo-screen {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem 1.125rem 1.25rem;
  border-radius: 14px;
  background: var(--ivory-50);
}
.landing-v2 .lc-demo-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.landing-v2 .lc-demo-trial {
  font-size: 1.0625rem;
  font-weight: 700;
}
.landing-v2 .lc-demo-class,
.landing-v2 .lc-demo-meta,
.landing-v2 .lc-demo-remaining {
  font-size: 0.875rem;
  color: var(--stone-500);
}
.landing-v2 .lc-demo-badge {
  padding: 0.4375rem 0.75rem;
  border-radius: 999px;
  font-size: 0.875rem;
  font-weight: 700;
  white-space: nowrap;
  transition:
    background-color 240ms ease,
    color 240ms ease;
}
.landing-v2 .lc-demo-badge[data-tone='neutral'] {
  background: #eef0ec;
  color: #39443a;
}
.landing-v2 .lc-demo-badge[data-tone='amber'] {
  background: #fff1d6;
  color: #6e4300;
}
.landing-v2 .lc-demo-badge[data-tone='blue'] {
  background: #e2ecf8;
  color: #1f3f6b;
}
.landing-v2 .lc-demo-badge[data-tone='green'] {
  background: #e3f2e6;
  color: #1e5b2e;
}
.landing-v2 .lc-demo-dog {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background: #fff;
  border: 1px solid #e8e2d4;
  border-radius: 12px;
}
.landing-v2 .lc-demo-arm {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 12px;
  background: var(--terracotta-500);
  color: #fff;
  font-size: 1.1875rem;
  font-weight: 700;
}
.landing-v2 .lc-demo-dogname {
  font-size: 1.1875rem;
  font-weight: 700;
}
.landing-v2 .lc-demo-timer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  background: #fff;
  border: 1px solid #e8e2d4;
  border-radius: 12px;
}
.landing-v2 .lc-demo-clock {
  font-size: 3rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -1px;
}
.landing-v2 .lc-demo-bar {
  width: 100%;
  height: 6px;
  border-radius: 999px;
  background: #ede7db;
  overflow: hidden;
}
.landing-v2 .lc-demo-bar > div {
  height: 100%;
  background: #2f9e57;
}
.landing-v2 .lc-demo-start {
  min-height: 60px;
  min-width: 190px;
  padding: 0 1.75rem;
  border: 0;
  border-radius: 999px;
  font: inherit;
  font-size: 1.3125rem;
  font-weight: 700;
  color: #fff;
  cursor: pointer;
  background: #2f7d46;
}
.landing-v2 .lc-demo-start[data-running='true'] {
  background: #c8373a;
}
.landing-v2 .lc-demo-save {
  min-height: 54px;
  border: 0;
  border-radius: 14px;
  font: inherit;
  font-size: 1.125rem;
  font-weight: 700;
  color: #fff;
  cursor: pointer;
  background: #d3a598;
}
.landing-v2 .lc-demo-save[data-ready='true'] {
  background: var(--terracotta-600);
}
.landing-v2 .lc-demo-log {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}
.landing-v2 .lc-demo-log li {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  font-size: 0.9375rem;
  color: var(--stone-700);
}
.landing-v2 .lc-demo-chip {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 0.625rem;
  border-radius: 999px;
  font-size: 0.875rem;
  font-weight: 700;
}
.landing-v2 .lc-demo-chip[data-state='waiting'] {
  background: #fff1d6;
  color: #6e4300;
}
.landing-v2 .lc-demo-chip[data-state='synced'] {
  background: #e3f2e6;
  color: #1e5b2e;
}
.landing-v2 .lc-demo-status {
  margin: 0;
  min-height: 1.6em;
  font-size: 1.0625rem;
  font-weight: 600;
  color: var(--ink-900);
}
@media (prefers-reduced-motion: reduce) {
  .landing-v2 .lc-demo-switch,
  .landing-v2 .lc-demo-knob,
  .landing-v2 .lc-demo-badge {
    transition: none;
  }
}
```

Check the Save button's disabled-looking colour (`#d3a598` with white text) against 4.5:1. It is about 2.3:1, so either keep the button visibly enabled (it explains what is missing when pressed) with the terracotta fill, or darken the idle fill to a tone that passes. Do not ship a low-contrast label.

- [ ] **Step 5: Run green and prove the boundary.**

```bash
cd apps/myk9show && pnpm vitest run src/components/landing/lifecycle/__tests__/ScoresheetDemo.test.tsx > ../../.logs/landing-demo.log 2>&1; echo "EXIT=$?"
grep -nE "replication|supabase|at-show|mutation" src/components/landing/lifecycle/ScoresheetDemo.tsx   # expected: no output
```

Expected: PASS (7 tests), and the grep prints nothing.

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/components/landing/lifecycle/ScoresheetDemo.tsx apps/myk9show/src/components/landing/lifecycle/scoresheetDemo.css apps/myk9show/src/components/landing/lifecycle/__tests__/ScoresheetDemo.test.tsx
git commit -m "feat(landing): working practice scoresheet with a simulated venue signal"
```

---

### Task 4c: [ADDED] `NightBeforeCard` (D11)

**Files:**

- Create: `apps/myk9show/src/components/landing/lifecycle/NightBeforeCard.tsx`
- Test: `apps/myk9show/src/components/landing/lifecycle/__tests__/NightBeforeCard.test.tsx`

**Interfaces:**

- Consumes: the `SetupReadinessSignalId` type from `@/features/show-workbench/setupReadinessSignals` (compile-time pin of each check to a real signal).
- Produces: `export function NightBeforeCard(props: { active: boolean; stepMs?: number }): JSX.Element` and `export const NIGHT_BEFORE_CHECKS`. Ticking starts only when `active` is true (the step has been revealed), so it never plays off screen.

- [ ] **Step 1: Write the failing test**

```tsx
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { NIGHT_BEFORE_CHECKS, NightBeforeCard } from '../NightBeforeCard';

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

describe('NightBeforeCard', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('lists only checks the app really makes today (D11 honesty rule)', () => {
    expect(NIGHT_BEFORE_CHECKS.map(c => c.signal)).toEqual([
      'show-details-missing',
      'no-classes',
      'judges-missing',
      'show-not-visible',
      'exhibitor-materials-unpublished',
    ]);
    for (const c of NIGHT_BEFORE_CHECKS) expect(c.label).not.toMatch(/offline|reconcil|print/i);
  });

  it('does not tick until its step is revealed', () => {
    setReducedMotion(false);
    render(<NightBeforeCard active={false} stepMs={100} />);
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByText('0 of 5 checked')).toBeInTheDocument();
  });

  it('ticks each check green and ends with the all-clear line', () => {
    setReducedMotion(false);
    render(<NightBeforeCard active stepMs={100} />);
    act(() => vi.advanceTimersByTime(250));
    expect(screen.getByText('2 of 5 checked')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText('All set')).toBeInTheDocument();
    expect(screen.getByText('Everything is handled. See you at the ring.')).toBeVisible();
  });

  it('replays from the start', () => {
    setReducedMotion(false);
    render(<NightBeforeCard active stepMs={100} />);
    act(() => vi.advanceTimersByTime(1000));
    fireEvent.click(screen.getByRole('button', { name: 'Replay' }));
    expect(screen.getByText('0 of 5 checked')).toBeInTheDocument();
  });

  it('shows every check done under reduced motion', () => {
    setReducedMotion(true);
    render(<NightBeforeCard active={false} />);
    expect(screen.getByText('All set')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run red.** Run `pnpm vitest run src/components/landing/lifecycle/__tests__/NightBeforeCard.test.tsx`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement `NightBeforeCard.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import type { SetupReadinessSignalId } from '@/features/show-workbench/setupReadinessSignals';
import { useReducedMotion } from '@/features/_shared/hooks/useReducedMotion';

// D11 honesty rule: each line is the positive form of a setup readiness signal the app really
// computes today. Entries-reconciled, printing and offline-tablet lines join only when MYK9-1145
// builds the real "Ready for show day" screen.
export const NIGHT_BEFORE_CHECKS: readonly {
  signal: SetupReadinessSignalId;
  label: string;
  sub: string;
}[] = [
  {
    signal: 'show-details-missing',
    label: 'Show details complete',
    sub: 'Dates, venue and trials in place',
  },
  {
    signal: 'no-classes',
    label: 'Classes built',
    sub: 'Every trial has its classes',
  },
  {
    signal: 'judges-missing',
    label: 'Judges assigned to every class',
    sub: 'Nothing waiting on a judge',
  },
  {
    signal: 'show-not-visible',
    label: 'Show visible to exhibitors',
    sub: 'Listed and open to view',
  },
  {
    signal: 'exhibitor-materials-unpublished',
    label: 'Premium list published',
    sub: 'Up to date since your last change',
  },
];

export function NightBeforeCard({ active, stepMs = 750 }: { active: boolean; stepMs?: number }) {
  const reducedMotion = useReducedMotion();
  const total = NIGHT_BEFORE_CHECKS.length;
  const [ticked, setTicked] = useState(reducedMotion ? total : 0);
  const [run, setRun] = useState(0);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (reducedMotion) {
      setTicked(total);
      return;
    }
    if (!active) return;
    setTicked(0);
    timer.current = window.setInterval(() => {
      setTicked(n => {
        if (n + 1 >= total) window.clearInterval(timer.current);
        return Math.min(n + 1, total);
      });
    }, stepMs);
    return () => window.clearInterval(timer.current);
  }, [active, reducedMotion, run, stepMs, total]);

  const allSet = ticked >= total;
  return (
    <div className="lc-night">
      <div className="lc-night-head">
        <div>
          <div className="lc-night-when">Friday, 9:40 pm</div>
          <div className="lc-night-title">Ready for show day</div>
        </div>
        <span className="lc-night-summary" data-all={allSet ? 'true' : 'false'}>
          {allSet ? 'All set' : `${ticked} of ${total} checked`}
        </span>
      </div>
      <ul className="lc-night-list">
        {NIGHT_BEFORE_CHECKS.map((c, i) => {
          const state = ticked > i ? 'done' : ticked === i ? 'checking' : 'waiting';
          return (
            <li key={c.signal} data-state={state}>
              <span className="lc-night-mark" aria-hidden="true" />
              <div>
                <div className="lc-night-label">{c.label}</div>
                <div className="lc-night-sub">
                  {state === 'done' ? c.sub : state === 'checking' ? 'Checking…' : 'Waiting'}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="lc-night-foot">
        <p className="lc-night-closing" data-shown={allSet ? 'true' : 'false'}>
          Everything is handled. See you at the ring.
        </p>
        <button type="button" className="lc-night-replay" onClick={() => setRun(r => r + 1)}>
          Replay
        </button>
      </div>
    </div>
  );
}
```

Confirm each `signal` id exists in `SetupReadinessSignalId` (`setupReadinessSignals.ts` lines 7 to 14); the type makes a wrong id a compile error. If `exhibitor-materials-unpublished` is not the premium signal, use the id that is.

- [ ] **Step 4: Add the card's CSS to `lifecycle.css` (Task 5 Step 5).**

```css
/* Night-before checklist (plan D11). */
.landing-v2 .lc-night {
  max-width: 560px;
  padding: 1.5rem 1.75rem;
  background: #fff;
  border: 1px solid #e8e2d4;
  border-radius: 20px;
  box-shadow: 0 30px 60px -40px rgb(60 40 20 / 0.45);
}
.landing-v2 .lc-night-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}
.landing-v2 .lc-night-when {
  font-size: 0.9375rem;
  font-weight: 700;
  color: var(--terracotta-600);
}
.landing-v2 .lc-night-title {
  font-size: 1.1875rem;
  font-weight: 700;
  color: var(--ink-900);
}
.landing-v2 .lc-night-summary {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 0.75rem;
  border-radius: 999px;
  font-size: 0.875rem;
  font-weight: 700;
  background: #f1ece2;
  color: var(--stone-700);
  white-space: nowrap;
}
.landing-v2 .lc-night-summary[data-all='true'] {
  background: #e3f2e6;
  color: #1e5b2e;
}
.landing-v2 .lc-night-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.landing-v2 .lc-night-list li {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 0.6875rem 0;
  border-top: 1px solid #efe9dd;
}
.landing-v2 .lc-night-mark {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  box-sizing: border-box;
  border: 2px solid #e3dccd;
  background: #fff center / 14px no-repeat;
  transform: scale(0.92);
  transition:
    background-color 260ms ease,
    border-color 260ms ease,
    transform 260ms cubic-bezier(0.23, 1, 0.32, 1);
}
.landing-v2 .lc-night-list li[data-state='checking'] .lc-night-mark {
  border-style: dashed;
  border-color: #b8ae9c;
}
.landing-v2 .lc-night-list li[data-state='done'] .lc-night-mark {
  transform: scale(1);
  border-color: #2f7d46;
  background-color: #2f7d46;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 12.5l4.5 4.5L19 7.5'/%3E%3C/svg%3E");
}
.landing-v2 .lc-night-label {
  font-size: 1rem;
  font-weight: 600;
  color: var(--ink-900);
}
.landing-v2 .lc-night-sub {
  font-size: 0.875rem;
  color: var(--stone-500);
}
.landing-v2 .lc-night-list li[data-state='done'] .lc-night-sub {
  color: #1e5b2e;
}
.landing-v2 .lc-night-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 0.75rem;
}
.landing-v2 .lc-night-closing {
  margin: 0;
  font-family: 'Playfair Display', serif;
  font-style: italic;
  font-size: 1.1875rem;
  color: var(--stone-700);
  opacity: 0;
  transition: opacity 500ms ease;
}
.landing-v2 .lc-night-closing[data-shown='true'] {
  opacity: 1;
}
.landing-v2 .lc-night-replay {
  min-height: 44px;
  padding: 0 0.875rem;
  border-radius: 10px;
  border: 1px solid #d9d3c4;
  background: #fff;
  font: inherit;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
}
@media (prefers-reduced-motion: reduce) {
  .landing-v2 .lc-night-mark,
  .landing-v2 .lc-night-closing {
    transition: none;
  }
}
```

The closing line is hidden with `opacity: 0` until all checks pass. That is the one place the page dims text on purpose, and it is decorative repetition of the "All set" badge, so the contrast harness in Task 7 must skip `.lc-night-closing[data-shown='false']`.

- [ ] **Step 5: Run green.** Same command; expected PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/components/landing/lifecycle/NightBeforeCard.tsx apps/myk9show/src/components/landing/lifecycle/__tests__/NightBeforeCard.test.tsx
git commit -m "feat(landing): night-before checklist card built from real setup checks"
```

---

### Task 5: Timeline, audience switch and CSS

**Files:**

- Create: `apps/myk9show/src/components/landing/lifecycle/LifecycleTimeline.tsx` (switch, column labels, steps)
- Create: `apps/myk9show/src/components/landing/lifecycle/TimelineStep.tsx`
- Create: `apps/myk9show/src/components/landing/lifecycle/lifecycle.css`
- Test: `apps/myk9show/src/components/landing/lifecycle/__tests__/LifecycleTimeline.test.tsx`

**Interfaces:**

- Consumes: Task 2 exports, `useTimelineProgress` (Task 3), `ScreenshotExplainer` (Task 4), `ScoresheetDemo` (Task 4b), `NightBeforeCard` (Task 4c).
- Produces: `export function LifecycleTimeline(): JSX.Element`, which renders `<section id="how-it-works">`. Each step row is `<div id={step.id} data-revealed>`, and each dot is `<span id={`${step.id}-dot`} data-reached>`.

- [ ] **Step 1: Write the failing test**

```tsx
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { LifecycleTimeline } from '../LifecycleTimeline';
import { trailPath } from '../TimelineStep';
import { STORIES } from '../lifecycleStories';

vi.mock('../useTimelineProgress', () => ({
  useTimelineProgress: () => ({ reached: 2, isRevealed: () => true }),
}));

const titles = () => screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent);

describe('trailPath', () => {
  it('starts and ends on the dot axis and mirrors by side', () => {
    expect(trailPath(1)).toMatch(/^M 48 0 .* 48 100$/);
    expect(trailPath(1)).not.toBe(trailPath(-1));
  });
});

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

  it('marks show day as the peak with its lead line and the signal switch', () => {
    render(<LifecycleTimeline />);
    const peak = document.getElementById('showday')!;
    expect(peak).toHaveAttribute('data-peak', 'true');
    expect(
      within(peak).getByText('Then show day arrives, and the venue has no signal.')
    ).toBeInTheDocument();
    expect(within(peak).getByRole('switch', { name: 'Venue signal' })).toBeInTheDocument();
  });

  // [ADDED] Review Focus 7
  it('switching audience mid-demo does not crash; each side shows its own show-day piece', () => {
    render(<LifecycleTimeline />);
    const peak = () => document.getElementById('showday')!;
    fireEvent.click(within(peak()).getByRole('switch', { name: 'Venue signal' }));
    fireEvent.click(within(peak()).getByRole('button', { name: 'Start' }));
    fireEvent.click(screen.getByRole('button', { name: 'I’m entering a show' }));
    expect(within(peak()).getByText('1 of 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'I’m running a show' }));
    expect(within(peak()).getByRole('switch', { name: 'Venue signal' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  // [ADDED] D10
  it('draws a scent trail between every pair of steps, with Alert at Results only', () => {
    const { container } = render(<LifecycleTimeline />);
    expect(container.querySelectorAll('svg.lc-trail')).toHaveLength(5);
    expect(container.querySelectorAll('.lc-alert')).toHaveLength(1);
    expect(document.getElementById('results')!.querySelector('.lc-alert')).not.toBeNull();
  });

  // [ADDED] D11
  it('shows the night-before card in the club story and the running-order screenshot for exhibitors', () => {
    render(<LifecycleTimeline />);
    const before = () => document.getElementById('before')!;
    expect(within(before()).getByText('Ready for show day')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'I’m entering a show' }));
    expect(within(before()).queryByText('Ready for show day')).toBeNull();
    expect(
      within(before()).getByRole('img', { name: STORIES.exhibitor[2]!.shot!.alt })
    ).toBeInTheDocument();
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
import { NightBeforeCard } from './NightBeforeCard';
import { ScoresheetDemo } from './ScoresheetDemo';
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

// D10: one leg of the scent trail in a 96x100 box: cast out to one side, swing back across,
// settle onto the next dot. `side` alternates per step so the trail zigzags like a search.
export function trailPath(side: 1 | -1): string {
  const x = (dx: number) => 48 + side * dx;
  return `M 48 0 C ${x(14)} 12, ${x(40)} 10, ${x(40)} 32 S ${x(-32)} 50, ${x(-26)} 68 S ${x(4)} 92, 48 100`;
}

function PawIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="6" cy="9" r="2.4" />
      <circle cx="10" cy="5" r="2.4" />
      <circle cx="14" cy="5" r="2.4" />
      <circle cx="18" cy="9" r="2.4" />
      <path d="M12 10c-3.2 0-6 3.6-6 6.4 0 2 1.6 3.1 3.4 2.6 1-.3 1.7-.6 2.6-.6s1.6.3 2.6.6c1.8.5 3.4-.6 3.4-2.6 0-2.8-2.8-6.4-6-6.4z" />
    </svg>
  );
}

export function TimelineStep({
  step,
  number,
  lead,
  reached,
  revealed,
  isLast,
}: {
  step: StoryStep;
  number: number;
  lead: string;
  reached: boolean;
  revealed: boolean;
  isLast: boolean;
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
        {step.scoresheetDemo && <ScoresheetDemo />}
        {step.nightBefore && <NightBeforeCard active={revealed} />}
        {step.shot && !step.explainer && !step.scoresheetDemo && !step.nightBefore && (
          <Screenshot shot={step.shot} side="main" />
        )}
      </div>
      <div className="lc-rail" aria-hidden="true">
        <span className="lc-dot-wrap">
          <span id={`${step.id}-dot`} className="lc-dot" data-reached={reached ? 'true' : 'false'}>
            {number}
          </span>
          {step.id === 'results' && (
            <span className="lc-alert" data-shown={reached ? 'true' : 'false'}>
              <PawIcon />
              Alert!
            </span>
          )}
        </span>
        {!isLast && (
          // D10: the scent trail to the next step. Stretched to the row's height; strokes stay crisp.
          <svg
            className="lc-trail"
            viewBox="0 0 96 100"
            preserveAspectRatio="none"
            data-after-find={step.id === 'results' ? 'true' : 'false'}
          >
            <path
              className="lc-trail-base"
              d={trailPath(number % 2 === 1 ? 1 : -1)}
              vectorEffect="non-scaling-stroke"
            />
            <path
              className="lc-trail-scent"
              d={trailPath(number % 2 === 1 ? 1 : -1)}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
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
            isLast={i === story.length - 1}
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
.landing-v2 .lc-dot-wrap {
  position: relative;
  display: flex;
  justify-content: center;
}
/* D10: the scent trail between dots. The SVG stretches to the row; strokes stay crisp
   (vector-effect: non-scaling-stroke on each path). It fills, by clip-path wipe, when the
   NEXT step is reached, and pulls back when the reader scrolls up. */
.landing-v2 .lc-trail {
  flex: 1 1 auto;
  width: 96px;
  margin-top: 4px;
  overflow: visible;
}
.landing-v2 .lc-trail-base {
  fill: none;
  stroke: #d9cfbc;
  stroke-width: 2;
}
.landing-v2 .lc-trail-scent {
  fill: none;
  stroke: var(--terracotta-600);
  stroke-width: 6;
  stroke-linecap: round;
  stroke-dasharray: 0.5 13;
  clip-path: inset(0 0 100% 0);
  transition: clip-path 900ms cubic-bezier(0.45, 0.05, 0.25, 1);
}
.landing-v2 .lc-trail[data-after-find='true'] .lc-trail-scent {
  stroke: #b8ae9c;
  stroke-width: 2;
  stroke-dasharray: 3 8;
  stroke-linecap: butt;
}
.landing-v2 .lc-row:has(+ .lc-row .lc-dot[data-reached='true']) .lc-trail-scent {
  clip-path: inset(0 0 0 0);
}
.landing-v2 .lc-alert {
  position: absolute;
  left: 100%;
  top: 6px;
  margin-left: 8px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  background: #e3f2e6;
  color: #1e5b2e;
  font-size: 0.9375rem;
  font-weight: 700;
  white-space: nowrap;
  box-shadow: 0 8px 18px -10px rgb(0 0 0 / 0.35);
  opacity: 0;
  transform: translateY(6px);
  transition:
    opacity 400ms ease,
    transform 400ms cubic-bezier(0.23, 1, 0.32, 1);
}
.landing-v2 .lc-alert[data-shown='true'] {
  opacity: 1;
  transform: translateY(0);
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
  .landing-v2 .lc-alert {
    left: 50%;
    top: 100%;
    margin: 6px 0 0;
    transform: translate(-50%, 6px);
  }
  .landing-v2 .lc-alert[data-shown='true'] {
    transform: translate(-50%, 0);
  }
  .landing-v2 .lc-trail {
    width: 56px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .landing-v2 .lc-dot,
  .landing-v2 .lc-trail-scent,
  .landing-v2 .lc-alert,
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

- [ ] **Step 6: Run green.** Same command; expected PASS (9 tests).

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

    // [ADDED] D9
    test('practice scoresheet queues scores offline and syncs them', async ({ page }) => {
      await page.goto('/');
      const peak = page.locator('#showday');
      await peak.scrollIntoViewIfNeeded();
      const sw = peak.getByRole('switch', { name: 'Venue signal' });
      await sw.click();
      await peak.getByRole('button', { name: 'Start' }).click();
      await page.waitForTimeout(600);
      await peak.getByRole('button', { name: 'Stop' }).click();
      await peak.getByRole('button', { name: 'Qualified' }).click();
      await peak.getByRole('button', { name: 'Save' }).click();
      await peak.getByRole('button', { name: 'Absent' }).click();
      await peak.getByRole('button', { name: 'Save' }).click();
      await expect(peak.getByText('No signal · 2 waiting')).toBeVisible();
      await sw.click();
      await expect(peak.getByText('All synced')).toBeVisible({ timeout: 4000 });
    });

    // [ADDED] D10
    test('the scent trail follows the reader and marks Alert at Results', async ({ page }) => {
      await page.goto('/');
      const alert = page.locator('#results .lc-alert');
      await expect(alert).toHaveAttribute('data-shown', 'false');
      await scrollDotToMiddle(page, 'results');
      await expect(alert).toHaveAttribute('data-shown', 'true');
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(alert).toHaveAttribute('data-shown', 'false');
    });

    // [ADDED] D11
    test('night-before card ticks green once revealed', async ({ page }) => {
      await page.goto('/');
      const card = page.locator('#before .lc-night');
      await card.scrollIntoViewIfNeeded();
      await expect(card.getByText('All set')).toBeVisible({ timeout: 6000 });
      await expect(card.getByText('Everything is handled. See you at the ring.')).toBeVisible();
    });

    test('exhibitor explainer pauses and steps', async ({ page }) => {
      await page.goto('/');
      await page.getByRole('button', { name: 'I’m entering a show' }).click();
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
          .filter(el => !el.matches(".lc-night-closing[data-shown='false']"))
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
    await page.getByRole('button', { name: 'I’m entering a show' }).click(); // club show day is the signal demo (D9)
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

- [ADDED] **MYK9-1145 (filed 2026-10-13):** the real "Ready for show day" checklist on the secretary Overview. When it ships, add its entries, printing and offline lines to `NIGHT_BEFORE_CHECKS` (D11).

- [ADDED] A live practice ring (canvas E3): a practice show with a public passcode, linked from the landing page as "Try it yourself". It needs a tidy practice show on the live database and a cold-phone airplane-mode check.

- Delete the `platform_waitlist` insert path, trigger and `send-waitlist-invite` once the rebuild merges (D1).
- Show-day photos in the timeline, once the owner supplies them.
- A club testimonial and a one-line fees strip, once a real quote exists.
- Flip the homepage to exhibitor-first (D6) when `/shows` lists enough shows.
- A Linear issue for this plan itself: set it In Progress per CLAUDE.md Gates step 1, and run `pnpm qa:inflight` against `apps/myk9show/src/components/landing`, `src/pages/Home.tsx` and `src/styles/landing.css`.
