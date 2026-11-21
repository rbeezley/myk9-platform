import { expect, test, type Page } from '@playwright/test';
import { expectHeaderFits, expectNoLandingSpills } from './helpers/landingGeometry';

const STEPS = ['setup', 'entries', 'before', 'showday', 'results', 'after'];
const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
];

// The page is client-rendered: wait for the hero and the timeline before measuring anything.
async function openLanding(page: Page) {
  await page.goto('/');
  await expect(page.locator('#top h1')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('#showday')).toBeAttached({ timeout: 30000 });
}

// Read down the page the way a person does: short instant steps. (The site sets
// `scroll-behavior: smooth`, which would race the assertions.) Lazy images above the step keep
// shifting layout, so the target is re-read on every step.
async function scrollStepToMiddle(page: Page, id: string, at = 0.4) {
  for (let step = 0; step < 80; step += 1) {
    const delta = await page.evaluate(
      ([stepId, frac]) => {
        const row = document.getElementById(stepId)!;
        return row.getBoundingClientRect().top - window.innerHeight * frac;
      },
      [id, at] as const
    );
    if (Math.abs(delta) < 2 && step > 0) break;
    const move = Math.sign(delta) * Math.min(Math.abs(delta), 300);
    await page.evaluate(m => window.scrollBy({ top: m, behavior: 'instant' }), move);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(250);
}

async function scrollToBottom(page: Page) {
  await page.evaluate(() =>
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' })
  );
  await page.waitForTimeout(600);
}

for (const vp of VIEWPORTS) {
  test.describe(`landing @ ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('hero: two-line H1, Add your club above the fold', async ({ page }) => {
      await openLanding(page);
      const h1 = page.getByRole('heading', { level: 1 });
      const lines = await h1.evaluate(el =>
        Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight))
      );
      expect(lines).toBeLessThanOrEqual(2);
      const box = await page
        .locator('#top')
        .getByRole('link', { name: 'Add your club' })
        .boundingBox();
      expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height);
    });

    test('no sideways scroll, no text under 14px, no control under 44px', async ({ page }) => {
      await openLanding(page);
      await scrollToBottom(page);
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

    test('no numbered rail, dots or connecting line anywhere in the timeline', async ({ page }) => {
      await openLanding(page);
      expect(await page.locator('.lc-rail, .lc-dot, .lc-line, [id$="-dot"]').count()).toBe(0);
      await scrollStepToMiddle(page, 'showday');
      await expect(page.locator('#showday')).toHaveAttribute('data-revealed', 'true');
    });

    test('each scene is a captioned stage: devices on top, the caption under them, then the tabs', async ({
      page,
    }) => {
      await openLanding(page);
      const scenes = page.locator('.lc-row .tl-scene');
      const count = await scenes.count();
      expect(count).toBeGreaterThanOrEqual(3);
      for (let i = 0; i < count; i += 1) {
        const geo = await scenes.nth(i).evaluate(el => {
          const box = (sel: string) => el.querySelector(sel)!.getBoundingClientRect();
          const stage = box('.tl-scene-stage');
          const caption = box('.tl-scene-caption');
          const tabs = box('.tl-scene-tabs');
          return {
            stageBottom: stage.bottom,
            captionTop: caption.top,
            tabsTop: tabs.top,
            captionBottom: caption.bottom,
            tabs: el.querySelectorAll('.tl-scene-tab').length,
            lines: el.querySelectorAll('.tl-scene-tab[aria-current="step"]').length,
          };
        });
        expect(geo.captionTop, `scene ${i}: caption is below the devices`).toBeGreaterThanOrEqual(
          geo.stageBottom
        );
        expect(geo.tabsTop, `scene ${i}: tabs are below the caption`).toBeGreaterThanOrEqual(
          geo.captionBottom - 1
        );
        expect(geo.tabs, `scene ${i}: one tab per line`).toBeGreaterThanOrEqual(4);
        expect(geo.lines, `scene ${i}: exactly one current line`).toBe(1);
      }
    });

    test('on a wide screen the two devices sit side by side; on a phone they stack', async ({
      page,
    }) => {
      await openLanding(page);
      const sides = await page.locator('.lc-row .tl-scene:not([data-solo])').evaluateAll(els =>
        els.map(el => {
          const [a, b] = [...el.querySelectorAll('.tl-scene-device')].map(d =>
            d.getBoundingClientRect()
          );
          return { sideBySide: b!.left >= a!.right - 1, stacked: b!.top >= a!.bottom - 1 };
        })
      );
      expect(sides.length).toBeGreaterThan(0);
      for (const side of sides) {
        if (vp.name === 'desktop') expect(side.sideBySide).toBe(true);
        else expect(side.stacked).toBe(true);
      }
    });

    test('switching audience keeps the reader at the step and swaps the story', async ({
      page,
    }) => {
      await openLanding(page);
      await scrollStepToMiddle(page, 'showday');
      // A programmatic click: Playwright's own click would scroll the switch into view, and
      // the reader would no longer be at show day.
      await page
        .getByRole('button', { name: 'I’m entering a show' })
        .evaluate(el => (el as HTMLElement).click());
      await expect(page.locator('#entries h3')).toHaveText('Enter in a few minutes');
      await page.waitForTimeout(400);
      const top = await page.locator('#showday').evaluate(el => el.getBoundingClientRect().top);
      expect(top).toBeLessThan(vp.height);
    });

    test('practice scoresheet queues scores offline and syncs them', async ({ page }) => {
      await openLanding(page);
      const peak = page.locator('#showday');
      await peak.scrollIntoViewIfNeeded();
      const sw = peak.getByRole('switch', { name: 'Venue signal' });
      await sw.click();
      // The ring scene's numbered lines sit in the same step and are buttons whose names hold
      // these words ("Start, Stop, then Qualified..."), so the lookups stay inside the scoresheet.
      const demo = peak.locator('.lc-demo');
      await demo.getByRole('button', { name: 'Start', exact: true }).click();
      await page.waitForTimeout(600);
      await demo.getByRole('button', { name: 'Stop', exact: true }).click();
      await demo.getByRole('button', { name: 'Qualified', exact: true }).click();
      await demo.getByRole('button', { name: 'Save', exact: true }).click();
      await demo.getByRole('button', { name: 'Absent', exact: true }).click();
      await demo.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(peak.getByText('No signal · 2 waiting')).toBeVisible();
      await sw.click();
      await expect(peak.getByText('All sent')).toBeVisible({ timeout: 4000 });
    });

    test('night-before card ticks green once revealed', async ({ page }) => {
      await openLanding(page);
      const card = page.locator('#before .lc-night');
      await card.scrollIntoViewIfNeeded();
      await expect(card.getByText('All set')).toBeVisible({ timeout: 6000 });
      await expect(card.locator('.lc-night-closing')).toHaveAttribute('data-shown', 'true');
    });

    test('exhibitor explainer pauses and steps', async ({ page }) => {
      await openLanding(page);
      await page.getByRole('button', { name: 'I’m entering a show' }).click();
      const fig = page.locator('#showday figure');
      await fig.scrollIntoViewIfNeeded();
      const caption = fig.locator('figcaption');
      // Positive control: autoplay really advances while playing, so "unchanged" after Pause
      // means something.
      const first = await caption.innerText();
      await expect.poll(() => caption.innerText(), { timeout: 8000 }).not.toBe(first);
      await fig.getByRole('button', { name: 'Pause' }).click();
      const before = await caption.innerText();
      await page.waitForTimeout(3500);
      expect(await caption.innerText()).toBe(before);
      await fig.getByRole('button', { name: 'Next' }).click();
      expect(await fig.locator('figcaption').innerText()).not.toBe(before);
    });

    test('guest header sits at the top with no blank band', async ({ page }) => {
      await openLanding(page);
      // The page fades in on load, so wait for it to settle before reading its position.
      const top = (selector: string) => () =>
        page.evaluate(sel => document.querySelector(sel)!.getBoundingClientRect().top, selector);
      await expect.poll(top('.landing-v2'), { timeout: 5000 }).toBeLessThanOrEqual(1);
      await expect.poll(top('.landing-v2 .l-hdr'), { timeout: 5000 }).toBeLessThanOrEqual(1);
    });

    test('header buttons stay on one line and fit the screen', async ({ page }) => {
      await openLanding(page);
      await expectHeaderFits(page);
    });

    test('rendered copy has no em dash, arrow or pre-launch words', async ({ page }) => {
      await openLanding(page);
      const text = await page.locator('.landing-v2').innerText();
      for (const re of [/—/, /→/, /waitlist/i, /pre-launch/i, /launching/i])
        expect(text).not.toMatch(re);
    });

    test('text uses only Playfair Display and Montserrat', async ({ page }) => {
      await openLanding(page);
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

    // Two known-answer probes print with the result so a broken harness cannot pass by accident:
    // an opaque pair, and translucent text on a translucent layer over a dark ancestor.
    test('step copy, meanwhile copy and captions meet 4.5:1 on their rendered ground', async ({
      page,
    }) => {
      await openLanding(page);
      await scrollToBottom(page);
      const result = await page.evaluate(() => {
        type Rgba = [number, number, number, number];
        const parse = (s: string): Rgba | null => {
          const m = s.match(/^rgba?\(([^)]+)\)$/);
          if (!m) return null;
          const n = m[1]!
            .split(/[\s,/]+/)
            .filter(Boolean)
            .map(Number);
          if (n.length < 3 || n.slice(0, 3).some(Number.isNaN)) return null;
          return [n[0]!, n[1]!, n[2]!, n[3] ?? 1];
        };
        const over = (fg: Rgba, bg: number[]) =>
          [0, 1, 2].map(i => fg[i]! * fg[3] + bg[i]! * (1 - fg[3]));
        const lin = (c: number) =>
          (c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        const lum = (rgb: number[]) =>
          0.2126 * lin(rgb[0]!) + 0.7152 * lin(rgb[1]!) + 0.0722 * lin(rgb[2]!);
        // The colour behind an element: each translucent layer blended over the ones below it.
        const ground = (el: Element): number[] | 'gradient' | 'unreadable' => {
          const layers: Rgba[] = [];
          for (let n: Element | null = el; n; n = n.parentElement) {
            const cs = getComputedStyle(n);
            if (cs.backgroundImage !== 'none') return 'gradient';
            const c = parse(cs.backgroundColor);
            if (!c) return 'unreadable';
            if (c[3] > 0) layers.push(c);
            if (c[3] >= 1) break;
          }
          let acc = [255, 255, 255];
          for (const layer of layers.reverse()) acc = over(layer, acc);
          return acc;
        };
        const measure = (el: Element) => {
          const g = ground(el);
          if (typeof g === 'string') return g;
          const fg = parse(getComputedStyle(el).color);
          if (!fg) return 'unreadable';
          const a = lum(over(fg, g));
          const b = lum(g);
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        };
        const probe = (html: string) => {
          const host = document.createElement('div');
          host.innerHTML = html;
          document.body.appendChild(host);
          const r = measure(host.querySelector('span')!);
          host.remove();
          return r;
        };
        const opaque = probe(
          '<div style="background:#aaa"><span style="color:#999">p</span></div>'
        );
        const translucent = probe(
          '<div style="background:#000"><div style="background:rgba(255,255,255,0.5)">' +
            '<span style="color:rgba(0,0,0,0.3)">p</span></div></div>'
        );
        const selector = [
          '.lc-step-body, .lc-meanwhile-text, .lc-lead, .lc-explainer-text, .lc-switch button',
          '.l-lede, .lc-hero-registries',
          // Header and call-to-action buttons.
          '.l-hdr .l-btn, .lc-hero-ctas .l-btn, .lc-close .l-btn, .l-onboard .l-btn',
          // Footer text and links.
          '.l-footer .l-foot-blurb, .l-footer .l-foot-bot, .l-footer li, .l-footer a',
          // Club onboarding copy.
          '.l-onboard .l-lbl, .l-onboard .l-onboard-optional, .l-onboard .l-fineprint, .l-onboard .l-onboard-status, .l-onboard .l-onboard-card p',
          // Scoresheet demo labels and status.
          '.lc-demo-label, .lc-demo-status, .lc-demo-hint, .lc-demo-meta, .lc-demo-badge, .lc-demo-chip, .lc-demo-remaining',
          // Night-before card.
          '.lc-night-label, .lc-night-sub, .lc-night-summary, .lc-night-when, .lc-night-title, .lc-night-closing, .lc-night-replay',
          // Explainer count chip.
          '.lc-explainer-count',
        ].join(', ');
        const nodes = [...document.querySelectorAll(selector)];
        const rows = nodes.map(el => ({
          selector: `${el.className}: ${el.textContent!.trim().slice(0, 30)}`,
          ratio: measure(el),
        }));
        const numeric = rows.filter(r => typeof r.ratio === 'number').map(r => r.ratio as number);
        return {
          opaque,
          translucent,
          measured: numeric.length,
          min: Math.min(...numeric),
          unmeasured: rows.filter(r => typeof r.ratio === 'string'),
          failures: rows.filter(r => typeof r.ratio === 'number' && r.ratio < 4.5),
        };
      });
      expect(result.opaque).toBeLessThan(1.5);
      // Hand-computed: ground 127.5 grey (white at 50% over black), text 89.25 grey (black at
      // 30% over that ground), WCAG ratio 1.753.
      expect(result.translucent as number).toBeGreaterThan(1.65);
      expect(result.translucent as number).toBeLessThan(1.85);
      expect(result.measured, 'selector list matched too few elements').toBeGreaterThan(40);
      expect(result.unmeasured, 'colours the harness could not read').toEqual([]);
      expect(result.failures, `minimum ratio observed ${result.min.toFixed(2)}`).toEqual([]);
    });

    // The limit was 15 until MYK9-2308 (owner, 2026-11-17, MYK9-1894): the ring scene added about
    // one phone screen. MYK9-2295 dropped the meanwhile screenshots, which took the club page from
    // 14.90 to 12.91 screens and the exhibitor page from 14.02 to 13.31 at 390x844 (measured
    // 2026-11-19). It stayed 15, not 14: that room is what the Entries open scene (MYK9-2296)
    // needs, and the owner chose to drop the stills instead of raising the limit (2026-11-19).
    // The Entries open scene (MYK9-2296) is that room used: club 14.22 and exhibitor 14.45 screens at
    // 390x844 (measured 2026-11-20).
    // 16 (owner, 2026-11-20, MYK9-2308): the Results scene adds about 0.8 of a screen, which puts
    // the club page at 15.02 and the exhibitor page at 15.27 at 390x844 (measured 2026-11-20). The
    // limit was raised to hold the scene, chosen over shortening scenes (fewer frames leave a line
    // without its screen, and smaller frames bring back unreadable phone text) and over dropping
    // the scene.
    test('page length is 8 to 16 screens on phone', async ({ page }) => {
      test.skip(vp.name !== 'phone');
      await openLanding(page);
      const screens = await page.evaluate(
        () => document.documentElement.scrollHeight / window.innerHeight
      );
      expect(screens).toBeGreaterThanOrEqual(8);
      expect(screens).toBeLessThanOrEqual(16);
    });

    // The default test above measures the club's story; the exhibitor's is its own page.
    test('exhibitor page length is 8 to 16 screens on phone', async ({ page }) => {
      test.skip(vp.name !== 'phone');
      await openLanding(page);
      await page.getByRole('button', { name: 'I’m entering a show' }).click();
      await expect(page.locator('#entries h3')).toHaveText('Enter in a few minutes');
      const screens = await page.evaluate(
        () => document.documentElement.scrollHeight / window.innerHeight
      );
      expect(screens).toBeGreaterThanOrEqual(8);
      expect(screens).toBeLessThanOrEqual(16);
    });

    // The peak row's padding rules once beat the phone gap rules, so the show-day text sat flush
    // against the scene. Measured between the content, not the padded boxes that hold it.
    test('on a phone, show day keeps a gap between its scene and the text beside it', async ({
      page,
    }) => {
      test.skip(vp.name !== 'phone');
      await openLanding(page);
      const gap = () =>
        page.evaluate(() => {
          const row = document.querySelector('.lc-row[data-peak="true"]')!;
          const scene = row.querySelector('.tl-scene')!.getBoundingClientRect();
          const text = row.querySelector('.lc-meanwhile-text')!.getBoundingClientRect();
          return text.top >= scene.bottom ? text.top - scene.bottom : scene.top - text.bottom;
        });
      expect(await gap(), 'club: scene above the meanwhile text').toBeGreaterThanOrEqual(10);
      await page.getByRole('button', { name: 'I’m entering a show' }).click();
      await expect(page.locator('#entries h3')).toHaveText('Enter in a few minutes');
      expect(await gap(), 'exhibitor: meanwhile text above the scene').toBeGreaterThanOrEqual(10);
    });
  });
}

const motionOf = (page: Page) =>
  page.evaluate(() => ({
    reveal: getComputedStyle(document.querySelector('.lc-main')!).transitionProperty,
  }));

test.describe('motion with no preference', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  // Positive control for the reduced-motion test below: these elements do animate by default.
  test('the reveal has a transition', async ({ page }) => {
    await openLanding(page);
    expect((await motionOf(page)).reveal).not.toBe('none');
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
  // The storyboard draws every line of every scene at once, so it is the longest the page gets.
  test('page length stays 8 to 16 screens, as a storyboard with no tabs or Play', async ({
    page,
  }) => {
    await openLanding(page);
    for (const audience of ['club', 'exhibitor'] as const) {
      if (audience === 'exhibitor') {
        await page.getByRole('button', { name: 'I’m entering a show' }).click();
        await expect(page.locator('#entries h3')).toHaveText('Enter in a few minutes');
      }
      expect(await page.locator('.lc-row .tl-scene-card').count()).toBeGreaterThan(10);
      expect(
        await page
          .locator('.lc-row .tl-scene-tab, .lc-row .tl-scene-arrow, .lc-row .tl-scene-btn')
          .count()
      ).toBe(0);
      const screens = await page.evaluate(
        () => document.documentElement.scrollHeight / window.innerHeight
      );
      expect(screens, `${audience} page`).toBeGreaterThanOrEqual(8);
      expect(screens, `${audience} page`).toBeLessThanOrEqual(16);
    }
  });

  test('everything is revealed, explainers start paused, nothing animates', async ({ page }) => {
    await openLanding(page);
    for (const id of STEPS) {
      expect(await page.locator(`#${id}`).getAttribute('data-revealed')).toBe('true');
    }
    await page.getByRole('button', { name: 'I’m entering a show' }).click();
    const fig = page.locator('#showday figure');
    await fig.scrollIntoViewIfNeeded();
    await expect(fig.getByRole('button', { name: 'Play' })).toBeVisible();
    // The app's global reduced-motion rule forces transition-duration to 100ms, so the duration
    // is not the signal; no transition property means nothing animates.
    expect(await motionOf(page)).toEqual({ reveal: 'none' });
  });
});

// Wide screens put the photo beside the copy in a tall frame (both dogs whole, not a short
// band cropped to their faces); narrower screens keep the full-width band above the copy.
test('hero: photo beside the copy on wide screens, band above it below 1100px', async ({
  page,
}, testInfo) => {
  const measure = () =>
    page.evaluate(() => {
      const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
      const h1 = document.querySelector<HTMLElement>('#top h1')!;
      const cta = [...document.querySelectorAll<HTMLElement>('#top a')].find(
        a => a.innerText === 'Add your club'
      )!;
      return {
        photo: box('#top .lc-hero-photo').toJSON() as DOMRect,
        h1: h1.getBoundingClientRect().toJSON() as DOMRect,
        h1Lines: Math.round(
          h1.getBoundingClientRect().height / parseFloat(getComputedStyle(h1).lineHeight)
        ),
        ctaBottom: cta.getBoundingClientRect().bottom,
      };
    });

  for (const { width, height } of [
    { width: 1100, height: 800 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize({ width, height });
    await openLanding(page);
    const m = await measure();
    expect(m.photo.left, `${width}px: photo is not beside the copy`).toBeGreaterThan(m.h1.right);
    expect(m.photo.height / m.photo.width, `${width}px: photo is a band`).toBeGreaterThan(0.9);
    expect(m.h1Lines, `${width}px: headline lines`).toBeLessThanOrEqual(2);
    expect(m.ctaBottom, `${width}px: Add your club below the fold`).toBeLessThanOrEqual(height);
    // Evidence for review; the page fades in on load, so let it settle first.
    await page.waitForTimeout(1000);
    await page.screenshot({ path: testInfo.outputPath(`hero-${width}.png`) });
  }

  await page.setViewportSize({ width: 1024, height: 768 });
  await openLanding(page);
  const m = await measure();
  expect(m.photo.width, '1024px: photo is not full width').toBeGreaterThan(1000);
  expect(m.photo.bottom, '1024px: photo is not above the copy').toBeLessThanOrEqual(m.h1.top + 1);
});

test('header fits the narrowest phones', async ({ page }) => {
  for (const width of [320, 360]) {
    await page.setViewportSize({ width, height: 740 });
    await openLanding(page);
    await expectHeaderFits(page);
  }
});

test('nothing spills out of its box on narrow phones', async ({ page }) => {
  for (const width of [320, 360]) {
    await page.setViewportSize({ width, height: 740 });
    await openLanding(page);
    for (const audience of ['club', 'exhibitor']) {
      if (audience === 'exhibitor') {
        await page.getByRole('button', { name: /entering a show/i }).click();
        // The header's primary action becomes Create account; it must still fit.
        await expect(page.locator('.l-hdr .l-btn-primary')).toHaveText('Create account');
        await expectHeaderFits(page);
      }
      await expectNoLandingSpills(page, `${width}px ${audience}`);
    }
  }
});

test('og image is a real image', async ({ request }) => {
  const res = await request.get('/og-image.jpg');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('image/jpeg');
});
