import { expect, test } from '@playwright/test';
import { signInAsExhibitor } from '../helpers/testUsers';
import { installSharedStagingWriteGuard } from '../helpers/sharedStagingWriteGuard';
import {
  applyRegistrationClock,
  SEEDED_EXHIBITOR_DOG_COUNT,
  SEEDED_EXHIBITOR_DOG_NAMES,
} from './seedRoster';
import { LIVE_REGISTRATION_SHOW_ID } from '../uat/shared/seededShows';
// The demo show, whose entry window the lean seed keeps open (seed-demo.sql
// section 2). This was MYK9-109 Load Show 1 until MYK9-558 made the load
// fixture opt-in.
const REGISTRATION_SHOW_ID = LIVE_REGISTRATION_SHOW_ID;

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
]) {
  test(`dog search preserves selection and drafts at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    await page.setViewportSize(viewport);
    await installSharedStagingWriteGuard(page, { strictRpcWrites: true });
    await applyRegistrationClock(page);
    await signInAsExhibitor(page, `/shows/${REGISTRATION_SHOW_ID}/register`);
    const search = page.getByRole('textbox', { name: 'Search dogs by call name' });
    // First-load budget, not a behavioural relaxation: the default 5s expect
    // timeout failed two of three viewports at this line under `--workers=2`
    // while all three passed serially. 30s, not the 15s siblings use, because
    // the measured worst case is larger than that: 41s wall for the cold test
    // including sign-in, of which this paint is the tail. The picker renders
    // every row unvirtualised (~260 with the opt-in MYK9-109 load fixture) and
    // the search box only mounts after them, so this wait scales with the roster.
    await expect(search).toBeVisible({ timeout: 30000 });
    const dogs = page.getByRole('checkbox', { name: /^Select / });
    // MYK9-545: this used to pin `toHaveCount(252)`. Staging is shared and the
    // demo exhibitor's roster only grows (the seed's dog delete is id-scoped),
    // so an absolute count expires on the first walk that creates a dog.
    //
    // The replacement needs an anchor the picker cannot fabricate. Both the
    // status line and the checkboxes render from the same `eligibleDogs` array
    // (`DogSelectionStep`), so comparing them to each other only catches a
    // render bug that drops rows — a `.limit(25)` regression on the dogs read
    // would report "25 of 25", render 25 checkboxes, and pass. So assert BOTH:
    // every dog the seed guarantees is addressable by name, AND the rendered
    // rows agree with the count the picker claims. Read the total while the
    // list is still unfiltered, before anything is typed into the search.
    const rosterStatus = page.getByText(/^\d+ of \d+ dogs shown$/);
    await expect(rosterStatus).toBeVisible();
    const unfiltered = /^(\d+) of (\d+) dogs shown$/.exec((await rosterStatus.innerText()).trim());
    expect(unfiltered).toBeTruthy();
    const [shown, rosterTotal] = [Number(unfiltered![1]), Number(unfiltered![2])];
    expect(shown).toBe(rosterTotal);
    expect(rosterTotal).toBeGreaterThanOrEqual(SEEDED_EXHIBITOR_DOG_COUNT);
    await expect(dogs).toHaveCount(rosterTotal);
    // `.first()` rather than a strict match: these names are unique in the seed,
    // but a walk that creates a dog called "Willow" would otherwise turn this
    // anchor into a strict-mode failure instead of the presence check it is.
    for (const seededName of SEEDED_EXHIBITOR_DOG_NAMES) {
      await expect(
        page.getByRole('checkbox', { name: `Select ${seededName}`, exact: true }).first()
      ).toBeAttached();
    }
    // The opt-in MYK9-109 load fixture, when applied, repeats call names (three
    // dogs answer to "Birch"), so the aria-label of `.last()` can resolve to several
    // checkboxes and every later name-based locator would break strict mode.
    // Take the LAST label that is unique in the roster: still far down the
    // list, but addressable.
    const labels = await dogs.evaluateAll(nodes =>
      nodes.map(node => node.getAttribute('aria-label') ?? '')
    );
    const labelCounts = new Map<string, number>();
    for (const label of labels) labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
    const lastLabel = [...labels].reverse().find(label => label && labelCounts.get(label) === 1);
    expect(lastLabel).toBeTruthy();
    const callName = lastLabel!.replace(/^Select /, '');
    await search.fill(callName);
    const dog = page.getByRole('checkbox', { name: lastLabel!, exact: true });
    await expect(dog).toBeVisible();
    // MYK9-485 put the 44px touch floor on the WRAPPER around the checkbox, on
    // purpose: sizing the control itself painted a 44px square around a 16px
    // tick. Measure the hit area the exhibitor actually taps, not the tick
    // (MYK9-545 — this assertion had never run, the count above failed first).
    const dogHitArea = dog.locator('..');
    for (const control of [
      search,
      dogHitArea,
      page.getByRole('button', { name: 'Clear search' }),
    ]) {
      const box = await control.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
    await dog.focus();
    await page.keyboard.press('Space');
    await expect(dog).toBeChecked();
    await search.fill('no-matching-dog-myk9-369');
    await expect(page.getByText(/No dogs match your search/)).toBeVisible();
    await expect(page.getByText('1 dog selected')).toBeVisible();
    await page.getByRole('button', { name: 'Clear search' }).click();
    await search.fill(callName);
    await expect(dog).toBeChecked();
    await page.screenshot({ path: testInfo.outputPath('filtered-selection.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false
    );
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    // Assert step 2 actually rendered before going Back. Without this the round
    // trip proves nothing: a Next that silently did nothing leaves the page on
    // step 1, Back is a no-op, and the selection is "preserved" only because it
    // was never navigated away from (MYK9-545).
    await expect(page.getByRole('heading', { name: 'Select Classes', exact: true })).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Select Dogs to Register' })).toBeVisible();
    await search.fill(callName);
    await expect(dog).toBeChecked();
    await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
    await page.getByLabel('Draft Title').fill('MYK9-369 search selection');
    await page.getByRole('dialog').getByRole('button', { name: 'Save Draft', exact: true }).click();
    await dog.click();
    await expect(dog).not.toBeChecked();
    await page.getByRole('button', { name: /Load Draft \(/ }).click();
    await page.getByText('MYK9-369 search selection', { exact: true }).click();
    await page.getByRole('button', { name: 'Load Selected Draft' }).click();
    await search.fill(callName);
    await expect(dog).toBeChecked();
  });
}
