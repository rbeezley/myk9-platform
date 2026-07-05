import { describe, expect, it } from 'vitest';
import { getEntryCloseSubmitBlocker } from './entryCloseGuard';

describe('getEntryCloseSubmitBlocker', () => {
  it('blocks exhibitor submit after entries have closed', () => {
    expect(
      getEntryCloseSubmitBlocker({
        startDate: '2026-08-01',
        entryCloseDate: '2026-07-15',
        today: '2026-07-16',
        isLateEntryMode: false,
        workflowMode: 'exhibitor',
      })
    ).toBe('Entries are closed for this show. Contact the trial secretary for late-entry help.');
  });

  it('does not block secretary late-entry mode after close', () => {
    expect(
      getEntryCloseSubmitBlocker({
        startDate: '2026-08-01',
        entryCloseDate: '2026-07-15',
        today: '2026-07-16',
        isLateEntryMode: true,
        workflowMode: 'secretary_new',
      })
    ).toBeNull();
  });

  it('does not block the demo-style close date after show start', () => {
    expect(
      getEntryCloseSubmitBlocker({
        startDate: '2026-08-01',
        entryCloseDate: '2026-09-01',
        today: '2026-08-02',
        isLateEntryMode: false,
        workflowMode: 'exhibitor',
      })
    ).toBeNull();
  });
});
