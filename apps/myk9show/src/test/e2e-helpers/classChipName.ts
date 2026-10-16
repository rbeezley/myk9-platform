/**
 * The accessible-name shape of a registration-wizard CLASS chip, in one place.
 *
 * The Select Classes step names each chip `Enter <dog> in <element> <level>`
 * (MYK9-1181), while the Select Dogs rows keep `Select <dog>`. The two shapes
 * must stay disjoint: a class-chip locator that also matched a dog row would
 * click the wrong control. An already-entered chip reads `<dog> is already
 * entered in <element>`, which neither pattern matches, so it is never offered
 * as an addable chip.
 *
 * Playwright-free on purpose, so a vitest unit test can pin it against the real
 * component (`ClassSelectionStep.classLabels.test.tsx`).
 */

/** Any addable class chip. Anchored so it cannot match a `Select <dog>` row. */
export const CLASS_CHIP_NAME = /^Enter .+ in .+$/;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The class chip for one level (e.g. `Novice A`), on whichever dog is showing. */
export function classChipNameForLevel(level: string): RegExp {
  return new RegExp(`^Enter .+ in .+ ${escapeRegExp(level)}$`);
}
