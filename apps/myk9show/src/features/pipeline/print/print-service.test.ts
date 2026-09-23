import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getEntriesByClass: vi.fn(),
  useShowStore: vi.fn(),
  useTrialStore: vi.fn(),
}));

vi.mock('@/services/database/entries', () => ({
  getEntriesByClass: (...args: unknown[]) => mocks.getEntriesByClass(...args),
}));

vi.mock('@/store/showStore', () => ({ useShowStore: mocks.useShowStore }));
vi.mock('@/store/trialStore', () => ({ useTrialStore: mocks.useTrialStore }));

import { generateScoreSheet } from './print-service';
import { usePipelinePrint } from './usePipelinePrint';
import type { PrintClassInfo } from './print-types';

const classInfo: PrintClassInfo = {
  className: '</title><script>alert(1)</script>',
  element: null,
  level: null,
  section: null,
  judgeName: null,
  trialDate: '2026-07-03',
  trialNumber: '1',
  showName: 'Spring Trial',
  timeLimitSeconds: null,
  areaCount: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useShowStore.mockImplementation((selector: (state: unknown) => unknown) =>
    selector({ shows: [{ id: 'show-1', name: 'Spring Trial' }] })
  );
  mocks.useTrialStore.mockImplementation((selector: (state: unknown) => unknown) =>
    selector({ trials: [{ id: 'trial-1', trialDate: '2026-07-03', trialNumber: '1' }] })
  );
  vi.spyOn(window, 'open').mockReturnValue({
    document: { write: vi.fn(), close: vi.fn() },
  } as unknown as Window);
});

describe('print-service', () => {
  it('escapes generated document titles before writing print windows', () => {
    generateScoreSheet(classInfo, []);

    const openedWindow = vi.mocked(window.open).mock.results[0]?.value as Window;
    const html = vi.mocked(openedWindow.document.write).mock.calls[0]?.[0] ?? '';
    expect(html).not.toContain('</title><script>alert(1)</script>');
    expect(html).toContain('&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('prints the projected assigned handler on the run-order sheet', async () => {
    mocks.getEntriesByClass.mockResolvedValue({
      data: [
        {
          id: 'entry-1',
          armband: '42',
          run_order: 1,
          dog: {
            call_name: 'Scout',
            breed: 'Beagle',
            owner: { first_name: 'Olivia', last_name: 'Owner' },
          },
          handler: null,
          handler_id: 'handler-1',
          handler_identity: {
            name: 'Harper Handler',
            person: null,
            source: 'assigned-person',
          },
        },
      ],
      error: null,
    });

    const { result } = renderHook(() => usePipelinePrint('show-1', 'trial-1'));
    await act(async () => {
      await result.current.printRunOrder({
        id: 'class-1',
        name: 'Container Novice A',
        judge_name: null,
        status: null,
        stage: 'not-started',
        scored_count: 0,
        total_entries: 1,
        is_scoring_finalized: false,
        is_results_reviewed: false,
        start_time: null,
        planned_start_time: null,
        display_order: null,
      });
    });

    const openedWindow = vi.mocked(window.open).mock.results[0]?.value as Window;
    const html = vi.mocked(openedWindow.document.write).mock.calls[0]?.[0] ?? '';
    expect(html).toContain('Harper Handler');
    expect(html).not.toContain('Olivia Owner');
  });

  it('uses the projected owner identity when the handler is legacy-unassigned', async () => {
    mocks.getEntriesByClass.mockResolvedValue({
      data: [
        {
          id: 'entry-1',
          armband: '42',
          run_order: 1,
          dog: { call_name: 'Scout', breed: 'Beagle', owner: null },
          handler: null,
          handler_id: null,
          handler_identity: {
            name: 'Olivia Owner',
            person: null,
            source: 'owner',
          },
        },
      ],
      error: null,
    });

    const { result } = renderHook(() => usePipelinePrint('show-1', 'trial-1'));
    await act(async () => {
      await result.current.printRunOrder({
        id: 'class-1',
        name: 'Container Novice A',
        judge_name: null,
        status: null,
        stage: 'not-started',
        scored_count: 0,
        total_entries: 1,
        is_scoring_finalized: false,
        is_results_reviewed: false,
        start_time: null,
        planned_start_time: null,
        display_order: null,
      });
    });

    const openedWindow = vi.mocked(window.open).mock.results[0]?.value as Window;
    const html = vi.mocked(openedWindow.document.write).mock.calls[0]?.[0] ?? '';
    expect(html).toContain('Olivia Owner');
  });
});
