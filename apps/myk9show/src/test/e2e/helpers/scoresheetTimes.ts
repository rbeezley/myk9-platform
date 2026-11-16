import type { Page } from '@playwright/test';

/** A time under every class limit the specs use (2:00 and 3:00). */
const VALID_AREA_TIME = '01:02.03';

/**
 * Types a valid time into every area of the open scoresheet. Since MYK9-2004 a Qualified saves only
 * when every area has a time above zero and at or under its limit, so a spec that taps Q must fill
 * the times first (a two-area class needs both).
 */
export async function fillEveryAreaTime(page: Page, time = VALID_AREA_TIME): Promise<void> {
  const fields = page.getByRole('textbox', { name: /^Area \d+ time$/ });
  const count = await fields.count();
  if (count === 0) throw new Error('No "Area N time" field on the scoresheet');
  for (let i = 0; i < count; i += 1) {
    await fields.nth(i).fill(time);
  }
}
