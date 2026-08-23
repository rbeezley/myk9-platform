/**
 * Type-scale contract (MYK9-220).
 *
 * `docs/INTENT.md` sets two hard typographic guardrails for this app:
 *
 *   > **Readable font sizes** — 16px body minimum, never below 14px for anything
 *
 * Before MYK9-220 the app violated the first and satisfied the second by
 * accident: `text-sm` (Tailwind's 14px) had become the body size across ~99% of
 * rendered text, and `text-xs` was raised to 14px so nothing went lower. That
 * left a 16 ÷ 14 = 1.14 step ratio and effectively no hierarchy.
 *
 * This suite deliberately does NOT grep `tailwind.config.js` for the numbers it
 * expects. A source-text assertion can only prove somebody typed a value; it
 * cannot prove the value reaches a browser, and this repo has already shipped a
 * test that certified a no-op as a fix that way. Instead it runs the real
 * Tailwind/PostCSS pipeline over the real config, injects the emitted stylesheet
 * into the document, and asserts `getComputedStyle` on actual elements — so a
 * config that compiles to nothing fails here.
 *
 * Only non-media rules are asserted: jsdom discards `@media` blocks wholesale,
 * so anything breakpoint-dependent has to be verified in a real browser.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * Every font-size utility Tailwind exposes, smallest name to largest.
 *
 * This runs past the tokens the config declares on purpose. `theme.extend`
 * overrides only the keys it names, so `7xl`–`9xl` keep Tailwind's defaults —
 * and a declared `6xl` that creeps past the default `7xl` would silently make
 * `text-7xl` render *smaller* than `text-6xl`. Stopping this list at the last
 * declared token would put that inversion outside the contract.
 */
const SCALE_UTILITIES = [
  'text-xs',
  'text-sm',
  'text-base',
  'text-lg',
  'text-xl',
  'text-2xl',
  'text-3xl',
  'text-4xl',
  'text-5xl',
  'text-6xl',
  'text-7xl',
  'text-8xl',
  'text-9xl',
] as const;

/** The utility the app uses for body copy, and the one INTENT.md's floor is about. */
const BODY_UTILITY = 'text-sm';

/**
 * The last step of the *text* range.
 *
 * This exists only to NARROW the step-ratio assertion to `sm`…`xl`. Above
 * `text-xl` the scale is display type, capped rather than geometric, so a ratio
 * is the wrong contract for it — the ceiling below is the right one. This
 * constant guards nothing on its own; do not read it as protecting the display
 * range.
 */
const LARGEST_TEXT_UTILITY = 'text-xl';

/**
 * Hard ceilings for the display range, in px.
 *
 * These are layout constraints, not taste. The live scoresheets render the
 * running clock at `text-5xl` (six of them) and at `text-5xl md:text-6xl`
 * (`DualTimerDisplay`, reached from `JudgeClassInterface`), inside a card whose
 * content box measures **293px at a 375px viewport** — 287px for
 * `DualTimerDisplay`, which sits in an extra bordered wrapper. Those cards are
 * `overflow-hidden`, so a time that does not fit is CLIPPED, not scrolled, and
 * a judge silently loses a digit off a scored run. There is no page-level
 * horizontal scrollbar to reveal it.
 *
 * `useStopwatch.formatTime` emits `M:SS.HH`, which becomes 8 characters past
 * ten minutes, and five of the six scoresheets set `font-mono` (wider than
 * `tabular-nums`). Measured in headless Chromium with the real compiled CSS,
 * an 8-character `font-mono` time occupies ~4.8em, so the widest case fits the
 * 287px box only while the font size stays at or below ~59px. 56px leaves
 * ~18px of headroom; MYK9-220 originally shipped 76px here, which overran by
 * 78px.
 *
 * Raising either number without re-measuring that card re-creates the blocker.
 */
const SCORESHEET_TIMER_CARD_PX = 287;
const DISPLAY_CEILING_PX: Record<string, number> = {
  'text-5xl': 56,
  'text-6xl': 66,
};

/** INTENT.md: "16px body minimum, never below 14px for anything". */
const BODY_MINIMUM_PX = 16;
const ABSOLUTE_FLOOR_PX = 14;

/** The caption step's line height, pinned since before MYK9-220. */
const CAPTION_LINE_HEIGHT_PX = 20;

/**
 * The step ratio below which the issue says a scale stops reading as a
 * hierarchy. Measured at 1.14 before this change.
 */
const MIN_STEP_RATIO = 1.2;

/** px per rem in a default document, so rem declarations can be compared. */
const ROOT_FONT_SIZE_PX = 16;

let computedSizePx: (utility: string) => number;
let computedLineHeightPx: (utility: string) => number;

beforeAll(async () => {
  // Compile the real config. `content` is given inline so the JIT engine emits
  // exactly the utilities under test regardless of what the app source uses.
  const tailwindConfig = (await import(`${APP_ROOT}/tailwind.config.js`)).default;
  const { css } = await postcss([
    tailwindcss({
      ...tailwindConfig,
      content: [{ raw: SCALE_UTILITIES.join(' '), extension: 'html' }],
      corePlugins: { preflight: false },
    }),
  ]).process('@tailwind utilities;', { from: undefined });

  expect(css.length, 'Tailwind emitted an empty stylesheet').toBeGreaterThan(0);

  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const read = (utility: string, property: 'fontSize' | 'lineHeight') => {
    const el = document.createElement('p');
    el.className = utility;
    el.textContent = 'The quick brown fox';
    document.body.appendChild(el);
    const raw = getComputedStyle(el)[property];
    const fontSizeRaw = getComputedStyle(el).fontSize;
    el.remove();

    // jsdom reports whatever unit the declaration used rather than resolving it.
    const toPx = (value: string, emBasisPx: number) => {
      const match = /^([\d.]+)(px|rem|em)?$/.exec(value.trim());
      if (!match) return NaN;
      const n = Number(match[1]);
      if (match[2] === 'px') return n;
      if (match[2] === 'rem') return n * ROOT_FONT_SIZE_PX;
      if (match[2] === 'em') return n * emBasisPx;
      return n * emBasisPx; // unitless line-height is a multiplier of font-size
    };

    const fontSizePx = toPx(fontSizeRaw, ROOT_FONT_SIZE_PX);
    const result = property === 'fontSize' ? fontSizePx : toPx(raw, fontSizePx);
    if (!Number.isFinite(result)) {
      throw new Error(`Could not read a ${property} for .${utility} (got "${raw}")`);
    }
    return result;
  };

  computedSizePx = (utility: string) => read(utility, 'fontSize');
  computedLineHeightPx = (utility: string) => read(utility, 'lineHeight');
});

describe('type scale', () => {
  it('emits a font size for every utility the app uses', () => {
    for (const utility of SCALE_UTILITIES) {
      expect(computedSizePx(utility), `.${utility} emitted no font-size`).toBeGreaterThan(0);
    }
  });

  it('renders body copy at INTENT.md’s 16px minimum', () => {
    expect(computedSizePx(BODY_UTILITY)).toBeGreaterThanOrEqual(BODY_MINIMUM_PX);
  });

  it('never renders any scale step below 14px', () => {
    for (const utility of SCALE_UTILITIES) {
      expect(computedSizePx(utility), `.${utility} is below the 14px floor`).toBeGreaterThanOrEqual(
        ABSOLUTE_FLOOR_PX
      );
    }
  });

  it('increases monotonically from the smallest name to the largest', () => {
    const sizes = SCALE_UTILITIES.map(computedSizePx);
    for (let i = 1; i < sizes.length; i += 1) {
      expect(
        sizes[i],
        `.${SCALE_UTILITIES[i]} (${sizes[i]}px) is not larger than .${SCALE_UTILITIES[i - 1]} (${sizes[i - 1]}px)`
      ).toBeGreaterThan(sizes[i - 1]);
    }
  });

  it('steps up by a readable ratio across the text range', () => {
    // Scoped to the text range on purpose. The display range above `text-xl` is
    // capped rather than geometric, because its largest tokens are the live
    // scoresheet timers inside `overflow-hidden` cards — those sizes answer to
    // layout, not to a ratio. Monotonicity above `text-xl` is covered above.
    const textRange = SCALE_UTILITIES.slice(
      SCALE_UTILITIES.indexOf(BODY_UTILITY),
      SCALE_UTILITIES.indexOf(LARGEST_TEXT_UTILITY) + 1
    );
    const sizes = textRange.map(computedSizePx);
    for (let i = 1; i < sizes.length; i += 1) {
      const ratio = sizes[i] / sizes[i - 1];
      expect(
        ratio,
        `.${textRange[i - 1]} → .${textRange[i]} steps by ${ratio.toFixed(3)}, a flat hierarchy`
      ).toBeGreaterThanOrEqual(MIN_STEP_RATIO);
    }
  });

  it('keeps a distinct caption step below body copy', () => {
    // The 14px caption step is what makes the 16px body floor affordable: it is
    // the one size allowed below body, and INTENT.md blesses it by name.
    const caption = computedSizePx('text-xs');
    const body = computedSizePx(BODY_UTILITY);
    expect(caption).toBeLessThan(body);
    expect(caption).toBe(ABSOLUTE_FLOOR_PX);
  });

  it('keeps the caption step’s line height at 20px', () => {
    // Pinned since before MYK9-220: `text-xs` is the densest text in the app, so
    // its leading is as load-bearing as its size. A size-only contract would let
    // a rewrite of this block drop the line height without any test noticing.
    expect(computedLineHeightPx('text-xs')).toBe(CAPTION_LINE_HEIGHT_PX);
  });

  it('holds the display range under the scoresheet timer card ceiling', () => {
    // The reason the cap commit exists. Monotonicity does NOT cover this: the
    // ladder only has to stay under Tailwind's default `text-7xl` of 72px,
    // which is well above the ~59px the timer card can actually hold. Without
    // this assertion a `text-5xl` of 70px passes every other test here and
    // clips an 8-character time by ~29px on a judge's phone.
    for (const [utility, ceiling] of Object.entries(DISPLAY_CEILING_PX)) {
      expect(
        computedSizePx(utility),
        `.${utility} exceeds the ceiling set by the ${SCORESHEET_TIMER_CARD_PX}px ` +
          `scoresheet timer card — re-measure that card before raising it`
      ).toBeLessThanOrEqual(ceiling);
    }
  });

  it('keeps every step’s line height at least as tall as its font size', () => {
    for (const utility of SCALE_UTILITIES) {
      const size = computedSizePx(utility);
      expect(
        computedLineHeightPx(utility),
        `.${utility} sets a line height below its own font size`
      ).toBeGreaterThanOrEqual(size);
    }
  });
});
