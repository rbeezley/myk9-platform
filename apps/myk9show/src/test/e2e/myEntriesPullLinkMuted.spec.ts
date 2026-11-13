import { expect, test, type Page } from '@playwright/test';
import { signInAsExhibitor } from './helpers/testUsers';

/**
 * MYK9-1913: on My Entries the "Pull or withdraw…" row control must read as
 * the status text's grey, underlined at rest, while "change" / "Check in" keep
 * the brand link colour. The component used to put `text-primary` and
 * `text-muted-foreground` on the same element, so the stylesheet's order
 * decided and the brand colour won; a class-name assertion passes either way,
 * so this reads the computed style in a real browser.
 *
 * Exhibitor-authed and read-only: it opens My Shows and never taps a control.
 * The reference grey is the row's own "·" separator (`text-muted-foreground`),
 * so no colour literal can drift from the theme token.
 */
const VIEWPORTS = [
  { name: 'phone 390px', width: 390, height: 844 },
  { name: 'desktop 1440px', width: 1440, height: 900 },
] as const;

const PULL_LINK = 'button[aria-label^="Pull or withdraw"]';

async function brandLinkColor(page: Page, rowState: ReturnType<Page['locator']>) {
  const rowLink = rowState.locator('button[aria-label^="Change"], button[aria-label^="Check in"]');
  if ((await rowLink.count()) > 0) {
    return rowLink.first().evaluate(el => getComputedStyle(el).color);
  }
  // A row with only the leave verb (no change/check-in): compare with the
  // brand token through a throwaway probe instead.
  const { color, bodyColor } = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.className = 'text-primary';
    document.body.appendChild(probe);
    const probed = getComputedStyle(probe).color;
    probe.remove();
    return { color: probed, bodyColor: getComputedStyle(document.body).color };
  });
  // A probe that only inherited the body colour proves nothing about the brand token.
  expect(color, 'text-primary probe must resolve to the brand colour, not inherit').not.toBe(
    bodyColor
  );
  return color;
}

for (const viewport of VIEWPORTS) {
  test(`${viewport.name}: Pull or withdraw is muted and underlined, change keeps the brand colour`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await signInAsExhibitor(page, '/exhibitor/entries');
    await page.goto('/exhibitor/entries', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'My Shows', level: 1 })).toBeVisible({
      timeout: 15_000,
    });

    const link = page.locator(PULL_LINK).first();
    await expect(
      link,
      'seeded exhibitor needs a class row with a leave control, or this spec proves nothing'
    ).toBeVisible({ timeout: 15_000 });

    const rowState = link.locator(
      'xpath=ancestor::span[contains(@class,"myk9-entries-class-state")]'
    );
    const separator = link.locator('xpath=preceding-sibling::span[1]');

    const linkStyle = await link.evaluate(el => {
      const s = getComputedStyle(el);
      return { color: s.color, decoration: s.textDecorationLine };
    });
    const mutedColor = await separator.evaluate(el => getComputedStyle(el).color);
    const brandColor = await brandLinkColor(page, rowState);

    expect(linkStyle.color).toBe(mutedColor);
    expect(linkStyle.color).not.toBe(brandColor);
    expect(linkStyle.decoration).toContain('underline');

    const box = await link.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
}
