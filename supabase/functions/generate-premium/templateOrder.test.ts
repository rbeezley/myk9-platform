import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * MYK9-2286: the pre-publish checklist checks the club template the PDF prints, so the generator
 * and the app must read a club's templates in one order. Both pick the first one matching the
 * trial type, so the same order means the same template when a club has several of one type.
 */
const ORDER_CHAIN =
  /\.order\('is_default', \{ ascending: false \}\)\s*(?:\/\/[^\n]*\n\s*)*\.order\('name'\)\s*(?:\/\/[^\n]*\n\s*)*\.order\('id'\)/;

const read = (relative: string) => readFileSync(resolve(__dirname, relative), 'utf8');

describe('club template order (MYK9-2286)', () => {
  it('generate-premium reads templates default first, then name, then id', () => {
    expect(read('./index.ts')).toMatch(ORDER_CHAIN);
  });

  it("the app's checklist reads them in the same order", () => {
    expect(
      read('../../../apps/myk9show/src/services/database/premium-templates/templates.ts')
    ).toMatch(ORDER_CHAIN);
  });
});
