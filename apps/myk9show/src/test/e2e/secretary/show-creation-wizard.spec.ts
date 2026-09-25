import { expect, test, type Locator, type Page } from '@playwright/test';
import { signInAsSecretary } from '../uat/shared/auth';
import { currentMonthWizardDates } from '../shared/wizardDates';
import { ADD_TRIALS_SHOW_ID } from '../uat/shared/seededShows';
import { PHONE_AT_150_PERCENT_ZOOM, expectNoHorizontalScroll } from '../shared/horizontalOverflow';

test.describe('Trial Secretary - Show Creation Wizard', () => {
  test('secretary can open the show creation wizard', async ({ page }) => {
    await signInAsSecretary(page, '/secretary/create-show/wizard');

    await expect(page).toHaveURL(/\/secretary\/create-show\/wizard/);
    await expect(page.getByRole('heading', { name: 'Add Show', level: 2 })).toBeVisible({
      timeout: 15000,
    });
  });

  test('Step 1 renders current required show details', async ({ page }) => {
    await signInAsSecretary(page, '/secretary/create-show/wizard');

    await expect(page.getByRole('heading', { name: 'Basics' })).toBeVisible();
    await expect(page.getByLabel(/Show Name/i)).toBeVisible();
    await expect(page.getByLabel(/Organization/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Show Dates/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Entry Period/i })).toBeVisible();
    await expect(page.getByLabel(/Location/i)).toBeVisible();
    await expect(page.getByText('Show Chairman *', { exact: true })).toBeVisible();
    await expect(page.getByText('Show Secretary *', { exact: true })).toBeVisible();
    await expect(page.getByText(/\d+ items? remaining/i)).toBeVisible();

    await page.getByRole('button', { name: /^Next$/ }).click();
    await expect(page.getByRole('alert')).toContainText(/\d+ items? needs? attention/i);
  });

  // MYK9-643: at 150% zoom on a phone the breadcrumb, the clone picker and
  // "Locate address" pushed the page 92px sideways.
  test('Step 1 does not scroll sideways at 150% zoom on a phone', async ({ page }) => {
    await page.setViewportSize(PHONE_AT_150_PERCENT_ZOOM);
    await signInAsSecretary(page, '/secretary/create-show/wizard');
    await expect(page.getByRole('heading', { name: 'Basics' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /Locate address/i })).toBeVisible();
    await expectNoHorizontalScroll(page, 'show wizard step 1');
  });

  // MYK9-643: every one of these measured 40px (the Back button 32px) at
  // 390x844, under docs/INTENT.md's 44px floor.
  test('every Step 1 control meets the 44px touch floor at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAsSecretary(page, '/secretary/create-show/wizard');
    await expect(page.getByRole('heading', { name: 'Basics' })).toBeVisible({ timeout: 15000 });

    const controls = {
      Back: page.getByTestId('show-creation-wizard-header').getByRole('button', { name: 'Back' }),
      'Show Name': page.getByLabel(/Show Name/i),
      Organization: page.getByLabel(/Organization/i),
      'Show Dates': page.getByRole('button', { name: /Show Dates/i }),
      'Entry Period': page.getByRole('button', { name: /Entry Period/i }),
      'Locate address': page.getByRole('button', { name: /Locate address/i }),
      'Show Chairman': page.getByRole('button', { name: /Show Chairman/i }),
    };
    for (const [name, control] of Object.entries(controls)) {
      const box = await control.boundingBox();
      expect(box, `${name} must be rendered`).not.toBeNull();
      // Rounded: layout lands a 44px box on 43.99997 after sub-pixel scaling.
      const height = Math.round(box!.height);
      expect(height, `${name} is ${Math.round(box!.width)}x${height}`).toBeGreaterThanOrEqual(44);
    }
  });

  test('Step 1 exposes premium style options and independent date ranges', async ({ page }) => {
    await signInAsSecretary(page, '/secretary/create-show/wizard');

    // Premium List Style + armband are collapsed by default under "More options".
    await page.getByRole('button', { name: /More options/i }).click();
    await page.getByLabel('Premium List Style').click();
    for (const label of [
      'Monogram (default)',
      'Banner',
      'Headline',
      'Magazine',
      'Poster',
      'Gazette',
      'Field Guide',
      'Heritage',
    ]) {
      await expect(page.getByRole('option', { name: label, exact: true })).toBeVisible();
    }
    await page.keyboard.press('Escape');

    const dates = currentMonthWizardDates();
    await selectRange(page, page.getByRole('button', { name: /Show Dates/i }), {
      start: dates.show.start.pick,
      end: dates.show.end.pick,
    });
    const showRange = new RegExp(`${dates.show.start.display}.*${dates.show.end.display}`, 'i');
    await expect(page.locator('#show-dates')).toContainText(showRange);

    await selectRange(page, page.getByRole('button', { name: /Entry Period/i }), {
      start: dates.entry.start.pick,
      end: dates.entry.end.pick,
    });
    const entryRange = new RegExp(`${dates.entry.start.display}.*${dates.entry.end.display}`, 'i');
    await expect(page.locator('#show-dates')).toContainText(showRange);
    await expect(page.locator('#show-entry-period')).toContainText(entryRange);
  });

  test('secretary can clone a previous show into the wizard and continue reviewing fields', async ({
    page,
  }) => {
    await signInAsSecretary(page, '/secretary/create-show/wizard');

    const sourceName = await selectFirstShowToClone(page);

    await expect(page.getByText(sourceName, { exact: true }).first()).toBeVisible();
    await expect(page.getByLabel(/Show Name/i)).toHaveValue(sourceName);
    await expect(page.locator('#show-dates')).toContainText(/select show start and end dates/i);
    await expect(page.locator('#show-entry-period')).toContainText(
      /select entry open and close dates/i
    );
    await expect(page.getByText(/\d+ items? remaining/i)).toBeVisible();
  });

  test('secretary can set new dates after cloning and continue to trial review', async ({
    page,
  }) => {
    await signInAsSecretary(page, '/secretary/create-show/wizard');

    await selectFirstShowToClone(page);

    const dates = currentMonthWizardDates();
    await selectRange(page, page.getByRole('button', { name: /Show Dates/i }), {
      start: dates.show.start.pick,
      end: dates.show.end.pick,
    });
    await selectRange(page, page.getByRole('button', { name: /Entry Period/i }), {
      start: dates.entry.start.pick,
      end: dates.entry.end.pick,
    });

    await selectFirstChairman(page);
    await selectFirstSecretary(page);

    await page.getByRole('button', { name: /^Next$/ }).click();
    await expect(
      page.getByLabel('Wizard progress').getByText('Step 2 of 4', { exact: true })
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Trials \(\d+\)$/ })).toBeVisible();
  });

  test('Add Trials mode lands on trial configuration with AKC event number guidance', async ({
    page,
  }) => {
    // MYK9-758: before this show's trials are known, the step must never offer
    // an ENABLED "Add First Trial" -- the show has trials. A flash can be too
    // brief for a polled assertion, so record it from the first paint.
    await page.addInitScript(() => {
      const flag = '__myk9SawEnabledAddFirstTrial';
      const scan = () => {
        for (const button of document.querySelectorAll('button')) {
          if (button.textContent?.trim() === 'Add First Trial' && !button.disabled) {
            (window as unknown as Record<string, boolean>)[flag] = true;
          }
        }
      };
      new MutationObserver(scan).observe(document, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['disabled'],
        characterData: true,
      });
    });
    await signInAsSecretary(
      page,
      `/secretary/create-show/wizard?showId=${ADD_TRIALS_SHOW_ID}&mode=add-trials`
    );

    await expect(page.getByRole('heading', { name: 'Add Trials', level: 2 })).toBeVisible({
      timeout: 15000,
    });
    await expect(
      page.getByLabel('Wizard progress').getByText('Step 2 of 4', { exact: true })
    ).toBeVisible();

    // The seeded show already has trials, so once they load the banner names
    // them and the action reads "Add Another Trial" (#2373); until then it is
    // a disabled, neutral "Add Trial" (MYK9-758). Wait for the loaded state;
    // the banner check also fails on the seed, not on a missing button, if the
    // show ever has no trials (MYK9-755).
    await expect(page.getByText(/\d+ existing trials?/)).toBeVisible({ timeout: 15000 });
    const addTrialAction = page
      .getByRole('button', { name: 'Add Another Trial', exact: true })
      .first();
    await expect(addTrialAction).toBeEnabled({ timeout: 15000 });
    expect(
      await page.evaluate(() =>
        Boolean((window as unknown as Record<string, boolean>).__myk9SawEnabledAddFirstTrial)
      ),
      'an enabled "Add First Trial" was offered for a show that has trials'
    ).toBe(false);
    await addTrialAction.click();

    await expect(page.getByPlaceholder('Required: AKC event number')).toBeVisible();
    await expect(page.getByLabel(/Trial Type/i)).toBeVisible();
  });
});

async function selectFirstShowToClone(page: Page) {
  const cloneTrigger = page.getByRole('button', { name: 'Select a past show to clone' });
  await expect(cloneTrigger).toBeVisible({ timeout: 15000 });
  await cloneTrigger.click();

  const search = page.getByPlaceholder('Search shows...');
  await expect(search).toBeVisible();

  const cloneDialog = page.getByRole('dialog').filter({ has: search });
  await expect(cloneDialog).toBeVisible();

  const firstShow = cloneDialog.getByRole('button').first();
  await expect(firstShow).toBeVisible();
  const sourceName = (await firstShow.locator('span').first().textContent())?.trim();
  expect(sourceName).toBeTruthy();
  await firstShow.click();
  await expect(search).not.toBeVisible();

  return sourceName!;
}

async function selectFirstChairman(page: Page) {
  await selectFirstOfficial(page, 'Show Chairman', 'Search show chairman…');
}

/**
 * MYK9-510 / ADR-011. The app shell's `main` used to declare `overflow-auto`,
 * which made it the nearest scroll container for everything inside it while
 * the DOCUMENT was what actually scrolled — so every `position: sticky` box
 * under the shell was pinned inside a box that never moved and scrolled away.
 *
 * These assertions are rendered geometry on purpose. A class-list check
 * (`toHaveClass(/sticky/)`) passed throughout the entire period the header was
 * inert, because the class was always there; only the scrollport was wrong.
 */
test.describe('Show Creation Wizard - sticky chrome (MYK9-510)', () => {
  for (const viewport of [
    { name: 'desktop', width: 1440, height: 600 },
    { name: 'phone', width: 390, height: 600 },
  ]) {
    test(`the wizard header stays pinned while the page scrolls at ${viewport.width}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await signInAsSecretary(page, '/secretary/create-show/wizard');

      const header = page.getByTestId('show-creation-wizard-header');
      const steps = page.getByTestId('show-creation-wizard-steps');
      await expect(header).toBeVisible({ timeout: 30000 });
      await expect(steps).toBeVisible();

      // Known answer first: on a page that cannot scroll, "the header did not
      // move" is true of a plainly-static header too.
      const scrollable = await page.evaluate(
        () => document.documentElement.scrollHeight - window.innerHeight
      );
      expect(
        scrollable,
        'the wizard page must be scrollable for this to mean anything'
      ).toBeGreaterThan(200);

      // Park at the top and let it settle first. The page performs its own
      // scrolls on mount (field focus, draft banner), so a measurement taken
      // straight after load can land mid-flight and read a header that is
      // still travelling — that made this flake at ~4px when run alongside
      // other specs.
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForFunction(() => window.scrollY === 0);
      await page.waitForTimeout(200);
      const stepsTopAtRest = await steps.evaluate(el => el.getBoundingClientRect().top);

      // Two scrolled samples, not rest-vs-scrolled: at rest the header already
      // sits at the chrome height, so "it did not move" would be trivially
      // true. A header that is NOT pinned travels between these two.
      await page.evaluate(() => window.scrollBy(0, 400));
      await page.waitForTimeout(300);
      expect(
        await page.evaluate(() => window.scrollY),
        'the document must be what scrolled'
      ).toBeGreaterThan(0);
      const headerTopFirst = await header.evaluate(el => el.getBoundingClientRect().top);

      await page.evaluate(() => window.scrollBy(0, 400));
      await page.waitForTimeout(300);
      const headerTopSecond = await header.evaluate(el => el.getBoundingClientRect().top);

      expect(
        Math.abs(headerTopSecond - headerTopFirst),
        `wizard header top moved from ${headerTopFirst} to ${headerTopSecond} across 400px of scroll`
      ).toBeLessThanOrEqual(1);

      // It must be pinned BELOW the fixed app bar, not behind it and not
      // carried off the top of the viewport.
      // --app-top-inset is declared as `var(--app-header-height)`, so reading
      // the custom property back returns that literal, not a length. Resolve it
      // the only way CSS will: give a probe element that height and measure it.
      const topInset = await page.evaluate(() => {
        const probe = document.createElement('div');
        probe.style.cssText =
          'position:absolute;top:0;left:0;width:1px;visibility:hidden;height:var(--app-top-inset,3rem)';
        document.body.appendChild(probe);
        const height = probe.getBoundingClientRect().height;
        probe.remove();
        return height;
      });
      expect(
        Math.abs(headerTopSecond - topInset),
        `wizard header top ${headerTopSecond} must sit at the fixed chrome height ${topInset}`
      ).toBeLessThanOrEqual(2);

      // The step indicator sticks too, and clears the header rather than
      // sliding under it.
      const stepsTopAfter = await steps.evaluate(el => el.getBoundingClientRect().top);
      expect(
        stepsTopAfter,
        `step indicator top ${stepsTopAfter} must not rise above where it started (${stepsTopAtRest})`
      ).toBeLessThanOrEqual(stepsTopAtRest + 1);
      const headerBottom = await header.evaluate(el => el.getBoundingClientRect().bottom);
      expect(
        stepsTopAfter,
        `step indicator top ${stepsTopAfter} must clear the sticky header bottom ${headerBottom}`
      ).toBeGreaterThanOrEqual(headerBottom - 1);

      // Structural, LAST on purpose: the geometry above is the real proof, and
      // an assertion placed ahead of it would short-circuit the shell
      // regression this test exists to catch. This one only names the cause.
      expect(
        await page
          .locator('[data-layout="app-shell-main"]')
          .evaluate(el => getComputedStyle(el).overflow),
        'the app shell main must leave overflow visible (ADR-011)'
      ).toBe('visible');
    });
  }
});

async function selectFirstSecretary(page: Page) {
  await selectFirstOfficial(page, 'Show Secretary', 'Search show secretary…');
}

async function selectFirstOfficial(page: Page, label: string, searchPlaceholder: string) {
  const trigger = page.getByRole('button', { name: new RegExp(label, 'i') });
  await expect(trigger).toBeVisible();
  await trigger.click();

  const search = page.getByPlaceholder(searchPlaceholder);
  await expect(search).toBeVisible();

  const popover = page.getByRole('dialog').filter({ has: search });
  const firstPerson = popover.locator('[data-group-key]').first();
  await expect(firstPerson).toBeVisible();
  await firstPerson.click();
  await expect(search).not.toBeVisible();
}

async function selectRange(page: Page, trigger: Locator, dates: { start: RegExp; end: RegExp }) {
  await trigger.click();
  const dialog = page.getByRole('dialog').filter({ has: page.getByRole('grid') });
  await expect(dialog).toBeVisible();
  await clickCalendarDay(dialog, dates.start);
  await clickCalendarDay(dialog, dates.end);
  const done = dialog.getByRole('button', { name: 'Done' });
  await expect(done).toBeVisible();
  // The Base UI popover can briefly reposition after range selection; DOM click
  // keeps this helper from failing on Playwright-only actionability jitter.
  await done.evaluate((button: HTMLButtonElement) => button.click());
  await expect(dialog).not.toBeVisible();
}

async function clickCalendarDay(dialog: Locator, name: RegExp) {
  const day = dialog.getByRole('button', { name }).first();
  await expect(day).toBeVisible();
  await day.click();
}
