import { describe, expect, it } from 'vitest';
import { ENTRY_TABLE_MIN_CONTENT_WIDTH, shouldUseEntryCards } from './entryManagementResponsive';

describe('entry management responsive layout', () => {
  it('uses cards when the actual manager content column is narrower than the table contract', () => {
    expect(shouldUseEntryCards(839, false)).toBe(true);
    expect(shouldUseEntryCards(840, false)).toBe(false);
  });

  it('keeps mobile cards independent of the measured content width', () => {
    expect(shouldUseEntryCards(1200, true)).toBe(true);
  });

  it('keeps the table on a wide content column', () => {
    expect(shouldUseEntryCards(ENTRY_TABLE_MIN_CONTENT_WIDTH + 1, false)).toBe(false);
  });
});
