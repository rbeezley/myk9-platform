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

/** Every font-size utility the app uses, smallest name to largest. */
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
] as const;

/** The utility the app uses for body copy, and the one INTENT.md's floor is about. */
const BODY_UTILITY = 'text-sm';

/** INTENT.md: "16px body minimum, never below 14px for anything". */
const BODY_MINIMUM_PX = 16;
const ABSOLUTE_FLOOR_PX = 14;

/**
 * The step ratio below which the issue says a scale stops reading as a
 * hierarchy. Measured at 1.14 before this change.
 */
const MIN_STEP_RATIO = 1.2;

/** px per rem in a default document, so rem declarations can be compared. */
const ROOT_FONT_SIZE_PX = 16;

let computedSizePx: (utility: string) => number;

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

  computedSizePx = (utility: string) => {
    const el = document.createElement('p');
    el.className = utility;
    el.textContent = 'The quick brown fox';
    document.body.appendChild(el);
    const raw = getComputedStyle(el).fontSize;
    el.remove();

    // jsdom reports whatever unit the declaration used rather than resolving it.
    const match = /^([\d.]+)(px|rem|em)$/.exec(raw.trim());
    if (!match) throw new Error(`Could not read a font-size for .${utility} (got "${raw}")`);
    const value = Number(match[1]);
    return match[2] === 'px' ? value : value * ROOT_FONT_SIZE_PX;
  };
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

  it('steps up by a readable ratio from body size upward', () => {
    const fromBody = SCALE_UTILITIES.slice(SCALE_UTILITIES.indexOf(BODY_UTILITY));
    const sizes = fromBody.map(computedSizePx);
    for (let i = 1; i < sizes.length; i += 1) {
      const ratio = sizes[i] / sizes[i - 1];
      expect(
        ratio,
        `.${fromBody[i - 1]} → .${fromBody[i]} steps by ${ratio.toFixed(3)}, a flat hierarchy`
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
});
