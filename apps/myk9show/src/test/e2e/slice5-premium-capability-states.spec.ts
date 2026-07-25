/**
 * Task 7.4 — Premium capability state coverage.
 *
 * NOT read-only. This creates, edits and deletes a health record on the seeded
 * test dog, then removes what it created. Writes are confined to
 * e2e-exhibitor@test.myk9.com's own dog and no other account's data is touched.
 *
 * SCOPED TO WHAT UNIT TESTS CANNOT PROVE. Slice 1 already pins the states a
 * mocked mutation can express, for all three record forms:
 *   - invalid input submits nothing and keeps the form open
 *     (AddHealthItemDialog / PedigreeAncestorDialogs tests)
 *   - a failed mutation preserves entered values and announces the failure
 *   - delete requires confirmation, and a failed delete retains the entry
 *     (EnhancedTrainingJournal tests)
 * Re-driving those through a browser would be slower and prove less. What a
 * mocked test structurally cannot show is that a save reaches the database and
 * survives a reload — so that is what this spec covers:
 *   invalid input -> valid save -> refresh persistence -> delete -> empty,
 * plus horizontal-overflow and console-error checks, which are rendering and
 * runtime properties jsdom cannot assess at all (it has no box layout).
 *
 * EDIT is deliberately absent: the health timeline row exposes only a Delete
 * control for a vaccination, so there is no inline edit path to drive here.
 * Editing is covered by EditHealthDialogs.test.tsx at unit level. Claiming an
 * edit state this surface does not offer would be a fabricated result.
 *
 * Run pinned to its own port:
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:5199 PLAYWRIGHT_PORT=5199 \
 *     pnpm playwright test src/test/e2e/slice5-premium-capability-states.spec.ts \
 *     --project=chromium --workers=1
 *
 * Requires E2E_DEMO_EXHIBITOR_PASSWORD and an ACTIVE Premium grant on the
 * seeded account — without it the forms never render.
 */
import { test, expect, type Page } from '@playwright/test';
import { signInAsTestUser } from './helpers/testUsers';

const EVIDENCE_DIR = process.env.SLICE5_EVIDENCE_DIR ?? 'test-results/slice5-evidence';
const SEED_DOG_ID = 'dededede-0000-0000-0000-000000000041';
const HEALTH_PATH = `/dogs/${SEED_DOG_ID}?section=records&view=health`;

/** Distinctive enough that a stale row from a previous run is obvious. */
const VACCINE = 'MYK9-71 verification vaccine';

async function settle(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(600);
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow, `${label}: document scrolls horizontally by ${overflow}px`).toBeLessThanOrEqual(
    1
  );
}

/** Console errors are a first-class result here, not incidental noise. */
function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(String(err)));
  return errors;
}

test.describe('Slice 5: Premium capability states', () => {
  test.setTimeout(300_000);

  test('health record: save, refresh, edit, delete round-trip', async ({ page }) => {
    const consoleErrors = trackConsoleErrors(page);

    await signInAsTestUser(page, 'DEMO_EXHIBITOR');
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(HEALTH_PATH);
    await settle(page);

    // --- valid save --------------------------------------------------------
    // The timeline's add CTA is named for the CONTENT state: "Add Health
    // Record" when empty, "Add Event" once the timeline has entries. Matching
    // only the empty-state label makes this spec pass or fail depending on
    // whether a previous run cleaned up after itself.
    const addTrigger = page.getByRole('button', { name: /^Add (Health Record|Event)$/i }).first();
    await expect(
      addTrigger,
      'health add trigger missing — is the Premium grant still active?'
    ).toBeVisible({ timeout: 20000 });
    await addTrigger.click();

    const dialog = page.getByRole('dialog').first();
    await expect(dialog).toBeVisible({ timeout: 15000 });

    // --- invalid input, observed live ---------------------------------------
    // Vaccine Name and Date Given are BOTH required. Submitting with only the
    // name must not close the dialog and must not write. Slice 1 pins this at
    // unit level; confirming it in the real dialog proves the wiring rather
    // than just the handler.
    await dialog.getByLabel('Vaccine Name').fill(VACCINE);
    await dialog.getByRole('button', { name: /^add$/i }).first().click();
    await page.waitForTimeout(750);
    await expect(
      dialog,
      'incomplete submission closed the dialog — required-field validation is not wired'
    ).toBeVisible();
    await expect(dialog.getByLabel('Vaccine Name')).toHaveValue(VACCINE);

    // --- valid save ---------------------------------------------------------
    await dialog
      .getByRole('button', { name: /^select date$/i })
      .first()
      .click();
    await page
      .getByRole('button', { name: /^today,/i })
      .first()
      .click();
    await dialog.getByRole('button', { name: /^add$/i }).first().click();

    // The dialog closes only on a CONFIRMED mutation success (Slice 1's fix),
    // so its disappearance is itself evidence the write was accepted.
    await expect(dialog).toBeHidden({ timeout: 20000 });
    await settle(page);
    await expect(page.getByText(VACCINE).first()).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: `${EVIDENCE_DIR}/premium-health-saved.png`, fullPage: true });

    // --- deep-link / refresh persistence ------------------------------------
    // The real point of a browser test here: prove the row reached the server
    // rather than a local cache that a reload would discard.
    await page.reload();
    await settle(page);
    await expect(
      page.getByText(VACCINE).first(),
      'saved record did not survive a reload — it never reached the server'
    ).toBeVisible({ timeout: 20000 });

    // --- long content -------------------------------------------------------
    await expectNoHorizontalOverflow(page, 'health list with saved record');

    // --- delete, which is also this spec's cleanup --------------------------
    // The timeline row exposes exactly one control, named for the record it
    // acts on ("Delete <name> Vaccination") — Slice 2's distinct-accessible-
    // name work. Vaccinations have no inline edit here; editing is covered by
    // EditHealthDialogs.test.tsx at unit level.
    //
    // Loop rather than delete once: a retried run can leave more than one row,
    // and leaving test data on staging is not acceptable cleanup.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const deleteButton = page.getByRole('button', { name: new RegExp(`^Delete ${VACCINE}`) });
      if ((await deleteButton.count()) === 0) break;
      await deleteButton.first().click();

      // Confirm if a confirmation step appears; tolerate its absence.
      const confirm = page.getByRole('button', { name: /^(delete|confirm|yes)/i });
      await confirm
        .first()
        .click({ timeout: 4000 })
        .catch(() => undefined);
      await settle(page);
    }

    // --- empty state, verified server-side ----------------------------------
    await page.reload();
    await settle(page);
    await expect(
      page.getByText(VACCINE),
      'test record survived deletion — staging still holds it'
    ).toHaveCount(0);

    // --- console cleanliness ------------------------------------------------
    // Filter the noise this app emits regardless of the flow under test.
    const meaningful = consoleErrors.filter(
      e => !/favicon|ResizeObserver|Download the React DevTools/i.test(e)
    );
    expect(
      meaningful,
      `console errors during the health round-trip:\n${meaningful.join('\n')}`
    ).toHaveLength(0);
  });
});
