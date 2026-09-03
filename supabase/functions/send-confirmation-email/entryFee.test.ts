import { describe, expect, it } from 'vitest';

import { formatEntryFee } from './entryFee';

describe('formatEntryFee', () => {
  it('formats the dollar-valued entries.entry_fee without scaling it down', () => {
    expect(formatEntryFee(25)).toBe('$25.00');
  });

  it('uses a placeholder for an unset fee', () => {
    expect(formatEntryFee(null)).toBe('—');
  });
});
