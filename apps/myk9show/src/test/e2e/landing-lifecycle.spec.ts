import { expect, test, type Page } from '@playwright/test';

const STEPS = ['setup', 'entries', 'before', 'showday', 'results', 'after'];
const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
];

// The page is client-rendered: wait for the hero and the timeline before measuring anything.
async function openLanding(page: Page) {
  await page.goto('/');
  await expect(page.locator('#top h1')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('#showday-dot')).toBeAttached({ timeout: 30000 });
}

const reachedDots = (page: Page) =>
  page.evaluate(
    ids => ids.map(id => document.getElementById(`${id}-dot`)?.getAttribute('data-reached')),
    STEPS
  );

// Read down the page the way a person does: short instant steps, so every dot passes through
// the viewport. (The site sets `scroll-behavior: smooth`, which would race the assertions.)
// Lazy images above the dot keep shifting layout, so the target is re-read on every step.
async function scrollDotToMiddle(page: Page, id: string, at = 0.4) {
  for (let step = 0; step < 80; step += 1) {
    const delta = await page.evaluate(
      ([stepId, frac]) => {
        const dot = document.getElementById(`${stepId}-dot`)!;
        return dot.getBoundingClientRect().top - window.innerHeight * frac;
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

async function scrollToTop(page: Page) {
  for (let step = 0; step < 80; step += 1) {
    const y = await page.evaluate(() => window.scrollY);
    if (y <= 0) break;
    await page.evaluate(() => window.scrollBy({ top: -300, behavior: 'instant' }));
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

    test('hero: two-line H1, Bring your club above the fold', async ({ page }) => {
      await openLanding(page);
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

    test('dots follow the reader both ways; content stays revealed', async ({ page }) => {
      await openLanding(page);
      // Below the viewport's middle a dot is not reached yet; this is what pins the 50% line.
      await scrollDotToMiddle(page, 'showday', 0.7);
      expect(await reachedDots(page)).toEqual(['true', 'true', 'true', 'false', 'false', 'false']);
      await scrollDotToMiddle(page, 'showday');
      expect(await reachedDots(page)).toEqual(['true', 'true', 'true', 'true', 'false', 'false']);
      await scrollToTop(page);
      expect(await reachedDots(page)).toEqual(Array(6).fill('false'));
      const revealed = await page.evaluate(() =>
        document.getElementById('showday')!.getAttribute('data-revealed')
      );
      expect(revealed).toBe('true');
    });

    test('switching audience keeps progress and swaps the story', async ({ page }) => {
      await openLanding(page);
      await scrollDotToMiddle(page, 'showday');
      // A programmatic click: Playwright's own click would scroll the switch into view, and
      // the reader would no longer be at show day.
      await page
        .getByRole('button', { name: 'I’m entering a show' })
        .evaluate(el => (el as HTMLElement).click());
      await expect(page.locator('#entries h3')).toHaveText('Enter in a few minutes');
      await page.waitForTimeout(400);
      // Progress is position, not story: after the swap each dot is reached exactly when it
      // sits in the top half of the viewport (or above it), and the reader keeps some progress.
      const { reached, expected } = await page.evaluate(ids => {
        const dots = ids.map(id => document.getElementById(`${id}-dot`)!);
        return {
          reached: dots.map(d => d.getAttribute('data-reached')),
          expected: dots.map(d => String(d.getBoundingClientRect().top < window.innerHeight * 0.5)),
        };
      }, STEPS);
      expect(reached).toEqual(expected);
      expect(reached.filter(r => r === 'true').length).toBeGreaterThanOrEqual(3);
    });

    test('practice scoresheet queues scores offline and syncs them', async ({ page }) => {
      await openLanding(page);
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

    test('the scent trail follows the reader and marks Alert at Results', async ({ page }) => {
      await openLanding(page);
      const alert = page.locator('#results .lc-alert');
      await expect(alert).toHaveAttribute('data-shown', 'false');
      await scrollDotToMiddle(page, 'results');
      await expect(alert).toHaveAttribute('data-shown', 'true');
      await scrollToTop(page);
      await expect(alert).toHaveAttribute('data-shown', 'false');
    });

    test('night-before card ticks green once revealed', async ({ page }) => {
      await openLanding(page);
      const card = page.locator('#before .lc-night');
      await card.scrollIntoViewIfNeeded();
      await expect(card.getByText('All set')).toBeVisible({ timeout: 6000 });
      await expect(card.getByText('Everything is handled. See you at the ring.')).toBeVisible();
    });

    test('exhibitor explainer pauses and steps', async ({ page }) => {
      await openLanding(page);
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

    test('guest header sits at the top with no blank band', async ({ page }) => {
      await openLanding(page);
      // The page fades in on load, so wait for it to settle before reading its position.
      const top = (selector: string) => () =>
        page.evaluate(sel => document.querySelector(sel)!.getBoundingClientRect().top, selector);
      await expect.poll(top('.landing-v2'), { timeout: 5000 }).toBeLessThanOrEqual(1);
      await expect.poll(top('.landing-v2 .l-hdr'), { timeout: 5000 }).toBeLessThanOrEqual(1);
    });

    test('og image is a real image', async ({ request }) => {
      const res = await request.get('/og-image.jpg');
      expect(res.status()).toBe(200);
      expect(res.headers()['content-type']).toContain('image/jpeg');
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

    // The probe span has a known low ratio, so a broken harness cannot pass by accident.
    test('step copy, meanwhile copy and captions meet 4.5:1 on their rendered ground', async ({
      page,
    }) => {
      await openLanding(page);
      await scrollToBottom(page);
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
      await openLanding(page);
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
    await openLanding(page);
    for (const id of STEPS) {
      expect(await page.locator(`#${id}`).getAttribute('data-revealed')).toBe('true');
    }
    await page.getByRole('button', { name: 'I’m entering a show' }).click();
    const fig = page.locator('#showday figure');
    await fig.scrollIntoViewIfNeeded();
    await expect(fig.getByRole('button', { name: 'Play' })).toBeVisible();
    const t = await page
      .locator('.lc-dot')
      .first()
      .evaluate(el => getComputedStyle(el).transitionProperty);
    // The app's global reduced-motion rule forces transition-duration to 100ms, so the duration
    // is not the signal; no transition property means nothing animates.
    expect(t).toBe('none');
  });
});
