import { describe, expect, it } from 'vitest';

import { RINGSIDE_PACKAGE_VERSION } from './index';

/**
 * Sanity test for the empty PR-A scaffold.
 *
 * Confirms vitest + jsdom + the test-utils setup file all resolve and
 * the package's sentinel export is importable. Replaced by real tests
 * starting in PR B.
 */
describe('@myk9/ringside scaffold', () => {
  it('exports the sentinel constant', () => {
    expect(RINGSIDE_PACKAGE_VERSION).toBe('0.0.1');
  });
});
