/**
 * WCAG contrast of rendered text against the surface it is actually read on,
 * composited through every ancestor layer (MYK9-784).
 *
 * The harness this replaces reported impossible readings ("Used for this show"
 * at 1.52, 1.90 and 3.325 across runs where the hand value is 4.78 / 4.45):
 *  - its `over()` always returned alpha 1, so a translucent layer composited
 *    over ANOTHER translucent layer was treated as opaque. The caption's badge
 *    (`bg-primary/10`) over a tinted dog card became "10% primary over the
 *    card's primary-coloured RGB, opaque", a near-solid orange surface, and the
 *    real card and page beneath were dropped;
 *  - it multiplied every ancestor's `opacity` into the TEXT alpha only, while
 *    opacity on an element fades its whole subtree, own background included,
 *    toward what lies beneath it;
 *  - it measured whatever frame it landed on, including mid-fade.
 *
 * Rendering model (normal blending, no filters): an element with opacity `o`
 * paints its subtree as a group, and for source-over the group's result over a
 * backdrop B is lerp(B, subtreeOver(B), o). So the pixel under the text and the
 * pixel of the text are both computed by walking root -> element, compositing
 * each background with straight-alpha source-over and applying each opacity as
 * that lerp. The walk starts from both white and black; where an opaque layer
 * exists the two agree, and where none does the worse one is reported.
 *
 * Not modelled: background images/gradients, pseudo-element or sibling layers,
 * filters and blend modes. A layer with a background image is flagged in the
 * details so a reading that depends on one is not silently trusted.
 *
 * Known answers (`CONTRAST_KNOWN_ANSWERS`) run through the SAME page function
 * on every run and print with the findings (LESSONS `measurement-harness`).
 */

import { expect, type Page } from '@playwright/test';

export interface ContrastReading {
  worst: number;
  worstText: string;
  details: {
    text: string;
    fontSize: string;
    ratio: number;
    textPixel: number[];
    surfacePixel: number[];
    layers: string[];
    bottomUndetermined: boolean;
    backgroundImage: boolean;
  };
  count: number;
  /** Finite WAAPI animations still running when the call began, then awaited. */
  awaitedAnimations: number;
  /** Lowest effective (ancestor-multiplied) opacity among matches at call time. */
  initialMinOpacity: number;
  unsettledAnimations: number;
}

/**
 * Runs in the page (serialized by `page.evaluate`), so it must not reference
 * anything outside its own body. Returns the WORST ratio across every visible,
 * enabled match, never the first one: the first match was once a caption on the
 * flat background that passes regardless, which made the assertion vacuous.
 */
export const CONTRAST_OF = async (selector: string): Promise<ContrastReading | null> => {
  // Settle before measuring: a fade-in caught mid-flight is a reading of the
  // animation, not of the design. Two kinds of fade run here: CSS/WAAPI ones,
  // which `getAnimations()` lists, and framer-motion's JS-driven ones (the
  // router's PageTransition fades every page in from opacity 0), which only
  // show up as a changing computed opacity. So: await every finite WAAPI
  // animation, then poll until the effective opacity of every match has held
  // still for several frames. Infinite animations (spinners) are skipped;
  // anything still moving at the deadline is reported so the caller can refuse
  // the reading rather than certify a frame of a fade.
  const effectiveOpacity = (el: Element) => {
    let o = 1;
    for (let cur: Element | null = el; cur; cur = cur.parentElement) {
      o *= Number(getComputedStyle(cur).opacity);
    }
    return o;
  };
  const opacities = () =>
    Array.from(document.querySelectorAll(selector)).map(el => effectiveOpacity(el).toFixed(4));
  const finite = () =>
    document
      .getAnimations()
      .filter(
        a =>
          a.playState !== 'finished' &&
          a.effect?.getComputedTiming().iterations !== Infinity &&
          a.effect?.getComputedTiming().endTime !== Infinity
      );
  const initialOpacities = Array.from(document.querySelectorAll(selector)).map(effectiveOpacity);
  const initialMinOpacity = initialOpacities.length ? Math.min(...initialOpacities) : 1;
  const awaitedAnimations = finite().length;
  const deadline = performance.now() + 5000;
  await Promise.race([
    Promise.all(finite().map(a => a.finished.catch(() => undefined))),
    new Promise(resolve => setTimeout(resolve, 5000)),
  ]);
  const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
  let stableFrames = 0;
  let last = opacities().join();
  while (stableFrames < 6 && performance.now() < deadline) {
    await frame();
    const next = opacities().join();
    stableFrames = next === last ? stableFrames + 1 : 0;
    last = next;
  }
  const unsettledAnimations =
    finite().filter(a => a.playState === 'running').length + (stableFrames < 6 ? 1 : 0);

  const els = Array.from(document.querySelectorAll(selector)).filter(el => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (!(r.width > 0 && r.height > 0)) return false;
    if (cs.visibility === 'hidden') return false;
    if (!(el.textContent || '').trim()) return false;
    // WCAG 1.4.3 exempts inactive controls, and this app dims them with
    // disabled:opacity-50 — "Load Draft (0)" measures 3.46:1 while disabled.
    return !el.closest('[disabled],[aria-disabled="true"],:disabled');
  });
  if (!els.length) return null;

  // Channels are read by compositing over black and over white rather than by
  // parsing the colour string: computed styles here serialise as
  // color(srgb 0..1), whose components are NOT 8-bit.
  const cv = document.createElement('canvas');
  cv.width = 1;
  cv.height = 1;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  const sample = (c: string, backdrop: string) => {
    ctx.globalCompositeOperation = 'copy';
    ctx.fillStyle = backdrop;
    ctx.fillRect(0, 0, 1, 1);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, 1, 1);
    return ctx.getImageData(0, 0, 1, 1).data;
  };
  /** Straight (non-premultiplied) [r, g, b, a], channels 0..255. */
  const parse = (c: string): number[] => {
    const w = sample(c, '#fff');
    const b = sample(c, '#000');
    // Average the three channels' estimates to halve the 8-bit rounding error.
    const a = 1 - (w[0] - b[0] + (w[1] - b[1]) + (w[2] - b[2])) / (3 * 255);
    return a <= 0.002 ? [0, 0, 0, 0] : [b[0] / a, b[1] / a, b[2] / a, Math.min(1, a)];
  };
  const lum = (rgb: number[]) => {
    const f = (v: number) => {
      const s = Math.min(255, Math.max(0, v)) / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
  };
  const ratio = (x: number[], y: number[]) => {
    const l1 = lum(x);
    const l2 = lum(y);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  /** Straight-alpha source-over of `c` onto an OPAQUE backdrop `b`. */
  const over = (c: number[], b: number[]) => [0, 1, 2].map(i => c[i] * c[3] + b[i] * (1 - c[3]));
  const lerp = (b: number[], x: number[], t: number) =>
    [0, 1, 2].map(i => b[i] + (x[i] - b[i]) * t);

  interface Layer {
    bg: number[];
    opacity: number;
    bgImage: boolean;
    tag: string;
  }
  // Root first, measured element last.
  const pixel = (chain: Layer[], i: number, backdrop: number[], fg: number[] | null): number[] => {
    const layer = chain[i];
    const onOwnBg = over(layer.bg, backdrop);
    const inner =
      i === chain.length - 1
        ? fg
          ? over(fg, onOwnBg)
          : onOwnBg
        : pixel(chain, i + 1, onOwnBg, fg);
    return lerp(backdrop, inner, layer.opacity);
  };

  let worst = Infinity;
  let worstText = '';
  let details: ContrastReading['details'] | null = null;
  for (const el of els) {
    const chain: Layer[] = [];
    for (let cur: Element | null = el; cur; cur = cur.parentElement) {
      const cs = getComputedStyle(cur);
      chain.unshift({
        bg: parse(cs.backgroundColor),
        opacity: Number(cs.opacity),
        bgImage: cs.backgroundImage !== 'none',
        tag: cur.tagName.toLowerCase() + (cur.id ? '#' + cur.id : ''),
      });
    }
    const fg = parse(getComputedStyle(el).color);
    let elWorst = Infinity;
    let pair: [number[], number[]] = [[], []];
    const readings: number[] = [];
    for (const start of [
      [255, 255, 255],
      [0, 0, 0],
    ]) {
      const textPixel = pixel(chain, 0, start, fg);
      const surfacePixel = pixel(chain, 0, start, null);
      const r = ratio(textPixel, surfacePixel);
      readings.push(r);
      if (r < elWorst) {
        elWorst = r;
        pair = [textPixel, surfacePixel];
      }
    }
    if (elWorst < worst) {
      const text = (el.textContent || '').trim().slice(0, 40);
      const fontSize = getComputedStyle(el).fontSize;
      worst = elWorst;
      worstText = text + ' [' + fontSize + ', n=' + els.length + ']';
      details = {
        text,
        fontSize,
        ratio: elWorst,
        textPixel: pair[0].map(v => Math.round(v * 10) / 10),
        surfacePixel: pair[1].map(v => Math.round(v * 10) / 10),
        // Only the layers that contribute: translucent backgrounds, opacity.
        layers: chain
          .filter(l => l.bg[3] > 0 || l.opacity < 1)
          .map(
            l =>
              l.tag +
              ' bg=rgba(' +
              l.bg
                .slice(0, 3)
                .map(v => Math.round(v))
                .join(',') +
              ',' +
              l.bg[3].toFixed(3) +
              ')' +
              (l.opacity < 1 ? ' opacity=' + l.opacity : '')
          ),
        bottomUndetermined: Math.abs(readings[0] - readings[1]) > 0.01,
        backgroundImage: chain.some(l => l.bgImage),
      };
    }
  }
  return {
    worst,
    worstText,
    details: details!,
    count: els.length,
    awaitedAnimations,
    initialMinOpacity,
    unsettledAnimations,
  };
};

/**
 * Fixed stacks with hand-computed answers (WCAG 2.x relative luminance). Each
 * row is outermost layer first; the text colour sits in the innermost one.
 * Rows C and D are the ones the old harness got wrong (it read 2.81 and 3.98).
 */
export const CONTRAST_KNOWN_ANSWERS = [
  {
    // #faf7f2 text on #1e1c19: L = 0.9322 vs 0.0117 -> 0.9822 / 0.0617.
    id: 'A-opaque',
    layers: [{ bg: '#1e1c19' }],
    color: '#faf7f2',
    expected: 15.908,
  },
  {
    // 10% #d97757 over #1e1c19 = rgb(48.7,37.1,31.2); #9a9184 on it.
    id: 'B-one-tint',
    layers: [{ bg: '#1e1c19' }, { bg: 'rgba(217,119,87,0.1)' }],
    color: '#9a9184',
    expected: 4.776,
  },
  {
    // Two translucent layers: 20% white over the card = rgb(75,73.4,71), then
    // 10% #d97757 over that = rgb(89.2,78.0,72.6); #9a9184 on it.
    id: 'C-stacked-tints',
    layers: [{ bg: '#1e1c19' }, { bg: 'rgba(255,255,255,0.2)' }, { bg: 'rgba(217,119,87,0.1)' }],
    color: '#9a9184',
    expected: 2.589,
  },
  {
    // opacity 0.5 on a white box with black text, over the card: the surface
    // is lerp(card, white, .5) = rgb(142.5,141.5,140) and the text
    // lerp(card, black, .5) = rgb(15,14,12.5).
    id: 'D-group-opacity',
    layers: [{ bg: '#1e1c19' }, { bg: '#ffffff', opacity: 0.5 }],
    color: '#000000',
    expected: 5.858,
  },
  {
    // Text alpha alone: 50% #faf7f2 on the card = rgb(140,137.5,133.5).
    id: 'E-text-alpha',
    layers: [{ bg: '#1e1c19' }],
    color: 'rgba(250,247,242,0.5)',
    expected: 4.908,
  },
] as const;

/**
 * Injects every known-answer stack, measures each with `CONTRAST_OF`, prints
 * the readings and fails if any is off its hand value by more than 0.05.
 */
export async function assertContrastHarness(page: Page): Promise<void> {
  const rows: string[] = [];
  for (const probe of CONTRAST_KNOWN_ANSWERS) {
    const id = 'contrast-known-' + probe.id;
    await page.evaluate(
      ({ id, layers, color }) => {
        document.getElementById(id)?.remove();
        let parent: HTMLElement = document.body;
        layers.forEach((layer, i) => {
          const el = document.createElement('div');
          el.style.background = layer.bg;
          if ('opacity' in layer && layer.opacity !== undefined) {
            el.style.opacity = String(layer.opacity);
          }
          if (i === 0) {
            el.id = id;
            el.style.cssText +=
              ';position:fixed;left:0;bottom:0;z-index:2147483647;pointer-events:none;padding:2px';
          }
          parent.appendChild(el);
          parent = el;
        });
        parent.style.color = color;
        parent.setAttribute('data-contrast-known', '');
        parent.textContent = 'x';
      },
      {
        id,
        layers: probe.layers as readonly { bg: string; opacity?: number }[],
        color: probe.color,
      }
    );
    const reading = await page.evaluate(CONTRAST_OF, '[data-contrast-known]');
    await page.evaluate(id => document.getElementById(id)?.remove(), id);
    const got = reading?.worst ?? NaN;
    rows.push(probe.id + ' expected=' + probe.expected.toFixed(3) + ' got=' + got.toFixed(3));
    expect(
      Math.abs(got - probe.expected),
      'contrast harness known answer ' + probe.id + ': ' + JSON.stringify(reading?.details)
    ).toBeLessThanOrEqual(0.05);
  }
  console.log('CONTRAST_KNOWN_ANSWERS ' + rows.join(' | '));
}
