/**
 * Shared locators for the registration wizard's class chips.
 *
 * Two specs assert on the same chips, and every trap here has already cost a
 * false failure once:
 *  - `.first()` on the role query is a coin flip on shared staging — the
 *    leading chip may be already entered, blocked or full, all of which render
 *    it unclickable and make the failure read as "Next never enabled".
 *  - the chip's `chip-<classId>` id is the only stable anchor; Base UI mints
 *    its own generated id inside the same <label> and that one CHANGES across
 *    a reload, so anchoring on it fails a page that restored correctly.
 */

import { expect, type Locator, type Page } from '@playwright/test';
import {
  formatProbeFailure,
  probeStepForViewport,
  scrollProbeOffsets,
  type ProbeOutcome,
} from '../../utils/stickyClickProbe';

export function enabledClassChips(page: Page): Locator {
  return page
    .getByRole('checkbox', { name: /^Select / })
    .and(
      page.locator(
        ':not([disabled]):not([aria-disabled="true"]):not([data-disabled]):not([data-checked])'
      )
    );
}

export function selectedClassChips(page: Page): Locator {
  return page.getByRole('checkbox', { name: /^Select / }).and(page.locator('[data-checked]'));
}

export function chipById(page: Page, id: string): Locator {
  return page
    .getByRole('checkbox', { name: /^Select / })
    .and(page.locator(`[id="${id}"], label:has([id="${id}"]) [role="checkbox"]`));
}

export async function chipClassId(chip: Locator): Promise<string> {
  return chip.evaluate(el => {
    const owner = el.closest('label') ?? el;
    const match = Array.from(owner.querySelectorAll<HTMLElement>('[id]')).find(node =>
      /^(chip|single)-/.test(node.id)
    );
    return match?.id ?? (/^(chip|single)-/.test(el.id) ? el.id : '');
  });
}

/**
 * Availability arrives after the chips render, so a chip enabled on the first
 * frame can turn disabled once its class comes back full. Wait until the
 * enabled set has held still across two polls. An already-selected chip counts
 * as a settled outcome: on shared staging this exhibitor's cart accumulates,
 * and a dog with nothing left to add is a legitimate state, not a hang.
 *
 * Returns how many chips are still addable.
 */
export async function waitForChipsToSettle(page: Page): Promise<number> {
  let previous = -1;
  let settled = 0;
  await expect
    .poll(
      async () => {
        settled = await enabledClassChips(page).count();
        const stable = settled === previous;
        previous = settled;
        return stable && (settled > 0 || (await selectedClassChips(page).count()) > 0);
      },
      { timeout: 30000, intervals: [500] }
    )
    .toBe(true);
  return settled;
}

/**
 * Put exactly one class into a known-selected state and hand back its stable
 * id, plus whether THIS test selected it — the cleanup must only ever un-select
 * a chip the test clicked (LESSONS `confirm-click-destructive`).
 */
export async function aSelectedClass(page: Page): Promise<{ id: string; added: boolean }> {
  if ((await waitForChipsToSettle(page)) > 0) {
    const id = await chipClassId(enabledClassChips(page).first());
    expect(id, 'the chip must carry a chip-<classId> id to anchor the assertion to').not.toBe('');
    const chip = chipById(page, id);
    await expect(chip).toHaveCount(1);
    await clickClearOfStickyChrome(page, chip);
    // Toggling a chip in the exhibitor flow WRITES the cart row before the
    // checkbox settles, so this is a network round trip, not a render. The 5s
    // default is not enough on a loaded machine and fails as "the click did
    // nothing".
    await expect(chip.and(page.locator('[data-checked]'))).toHaveCount(1, { timeout: 20000 });
    return { id, added: true };
  }
  // Nothing left to add for this dog — assert on a class already selected. The
  // claim under test (the selection survives) is the same either way.
  const id = await chipClassId(selectedClassChips(page).first());
  expect(id, 'this dog must have at least one class selected to assert on').not.toBe('');
  return { id, added: false };
}

/**
 * Add ONE more class beyond whatever is already selected, and hand back its
 * stable id — or null when this dog genuinely has nothing left to add.
 *
 * The null case is real on shared staging (this exhibitor's cart accumulates,
 * and classes fill), so the caller decides whether that is a skip or a failure
 * rather than this helper inventing a click that cannot happen.
 */
export async function addAnotherClass(page: Page): Promise<{ id: string } | null> {
  if ((await waitForChipsToSettle(page)) === 0) return null;
  const id = await chipClassId(enabledClassChips(page).first());
  if (!id) return null;
  const chip = chipById(page, id);
  await expect(chip).toHaveCount(1);
  await clickClearOfStickyChrome(page, chip);
  // A cart write, not a render — see `aSelectedClass`.
  await expect(chip.and(page.locator('[data-checked]'))).toHaveCount(1, { timeout: 20000 });
  return { id };
}

/** Undo `aSelectedClass`, but only when this test is what selected it. */
export async function releaseSelectedClass(
  page: Page,
  { id, added }: { id: string; added: boolean }
): Promise<void> {
  if (!added) return;
  const chip = chipById(page, id);
  await clickClearOfStickyChrome(page, chip);
  await expect(chip.and(page.locator('[data-checked]'))).toHaveCount(0, { timeout: 20000 });
}

/**
 * How far, in scroll steps, the probe walks from where it starts. Twelve steps
 * of a twelfth of the viewport reaches a full viewport height in each
 * direction, in increments finer than any gap the chrome leaves.
 */
const MAX_PROBE_STEPS = 12;

/**
 * Ask the BROWSER what is at the target's centre, and accept only when that is
 * the target or one of its descendants — which is the same question
 * Playwright's actionability check asks before it clicks.
 *
 * A toast needs no special case here, which is the point: it either loses the
 * point at another scroll position or it dismisses itself (Sonner's 4s default;
 * `AppToaster` sets no duration and raises no sticky toast) well inside the
 * caller's retry loop. An explicit bounded wait for one was written and then
 * deleted — mutating it out left every spec green, including
 * `checkoutCancelRecovery` on `mobile-chrome`, whose only interceptor was a
 * toast.
 *
 * This replaces the overlay list two earlier rounds maintained by hand. Each
 * round a review found an overlay the list was missing (the Sonner toaster,
 * then the fixed AppHeader), and each time the helper cheerfully reported
 * "clear" and scrolled the target into it. A hit test cannot miss an overlay:
 * anything fixed, sticky, layered or transient simply wins the point and fails.
 */
async function probeAtCentre(page: Page, target: Locator): Promise<ProbeOutcome> {
  const scrollTop = await shellScrollTop(page);
  const measured = await target.evaluate(el => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return { accepted: false, hit: null, targetBox: null };
    }
    const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const winner = document.elementFromPoint(point.x, point.y);
    if (!winner) {
      return {
        accepted: false,
        hit: null,
        targetBox: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      };
    }
    const winnerRect = winner.getBoundingClientRect();
    const asElement = winner as HTMLElement;
    return {
      accepted: winner === el || el.contains(winner),
      hit: {
        tag: winner.tagName,
        testId: asElement.dataset?.testid ?? null,
        role: winner.getAttribute('role'),
        text: (winner.textContent ?? '').trim().slice(0, 40),
        box: {
          x: winnerRect.left,
          y: winnerRect.top,
          width: winnerRect.width,
          height: winnerRect.height,
        },
      },
      targetBox: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
    };
  });
  return { ...measured, scrollTop };
}

/** The scroll position of the target's own scrollport, for the failure report. */
async function shellScrollTop(page: Page): Promise<number> {
  return page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>('[data-testid="registration-wizard-shell"]');
    return shell ? Math.round(shell.scrollTop) : Math.round(window.scrollY);
  });
}

/** Move the target's own scroll container to `base + offset`, and report where it landed. */
async function scrollTargetTo(target: Locator, position: number): Promise<void> {
  await target.evaluate((el, top) => {
    let node: HTMLElement | null = el as HTMLElement;
    while (node) {
      const style = getComputedStyle(node);
      if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) {
        node.scrollTop = top;
        return;
      }
      node = node.parentElement;
    }
    window.scrollTo(0, top);
  }, position);
}

/**
 * Scroll until the browser's own hit test says the target is what a click at
 * its centre would reach, then hand back. Throws a report naming the element
 * that won the point when no position works.
 *
 * The probe tries the current position first — the desktop fast path, and the
 * common phone case — then walks outward in both directions. It never reasons
 * about WHERE the clear region is; two rounds of doing that produced two bugs
 * of the same shape.
 */
async function scrollUntilClickable(page: Page, target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const viewport = page.viewportSize() ?? { width: 0, height: 0 };
  const base = await shellScrollTop(page);
  const outcomes: ProbeOutcome[] = [];

  for (const offset of scrollProbeOffsets(probeStepForViewport(viewport.height), MAX_PROBE_STEPS)) {
    if (offset !== 0) {
      await scrollTargetTo(target, base + offset);
      await page.waitForTimeout(100);
    }
    const outcome = await probeAtCentre(page, target);
    outcomes.push(outcome);
    if (!outcome.accepted) continue;
    // Accept only when the point holds still: the wizard keeps settling while
    // the cart loads, and a single accepting probe can be stale by the time
    // Playwright runs its own check a beat later.
    await page.waitForTimeout(150);
    const confirmation = await probeAtCentre(page, target);
    outcomes.push(confirmation);
    if (confirmation.accepted) return;
  }

  throw new Error(formatProbeFailure(String(target), viewport, outcomes));
}

/**
 * Click `target` only once a click at its centre would actually reach it.
 *
 * Positioning once is not enough: Playwright runs its OWN `scrollIntoViewIfNeeded`
 * as part of the click's actionability check, and the page keeps settling while
 * the cart and the dog list load, so a row that was reachable can be covered
 * again by the time the click lands. Re-probe and retry rather than forcing the
 * click — a `force: true` click would pass on the very overlap this exists to
 * catch.
 *
 * The probe is INSIDE the retry: a transient overlap on the first attempt is
 * exactly what the retry exists for, and hard-failing there would abort
 * `releaseSelectedClass` and leave this test's row selected on shared staging.
 * The last probe runs outside it so a genuine, permanent interceptor fails with
 * that element named rather than as Playwright's raw intercept error.
 */
export async function clickClearOfStickyChrome(page: Page, target: Locator): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await scrollUntilClickable(page, target);
      await target.click({ timeout: 7000 });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  await scrollUntilClickable(page, target);
  throw lastError;
}

export async function selectFirstDogAndContinue(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Select Dogs to Register' })).toBeVisible({
    timeout: 20000,
  });
  const namedDogOptions = page.locator('[role="checkbox"][aria-label^="Select "]');
  const dogOption =
    (await namedDogOptions.count()) > 0
      ? namedDogOptions.first()
      : page.getByRole('checkbox').first();
  await clickClearOfStickyChrome(page, dogOption);
  const next = page.getByRole('button', { name: /^Next$/ });
  await expect(next).toBeEnabled();
  await clickClearOfStickyChrome(page, next);
}
