import { describe, expect, it } from 'vitest';

import { buildSavedCopy } from './buildSavedCopy';

describe('buildSavedCopy', () => {
  it('renders one trial day with the nightly renderer and counts its real pages', async () => {
    const generatedAt = '2026-12-07T23:00:00.000Z';
    const { bytes, pageCount } = await buildSavedCopy({
      generatedAt,
      show: { id: 'show-1', name: 'Winter Trial', startDate: '2026-12-08', endDate: '2026-12-08' },
      trials: [
        {
          id: 't1',
          date: '2026-12-08',
          name: 'Trial 1',
          trialNumber: '1',
          registryId: 'AKC',
          timezone: 'America/New_York',
        },
      ],
      classes: [],
      entries: [],
    } as never);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(pageCount).toBeGreaterThan(0);
  });
});
