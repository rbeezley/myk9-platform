import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { createTestQueryClient } from '@/test/utils/testUtils';
import { useAKCOfficialPdfAction } from '../useAKCOfficialPdfAction';
import type { ReportProps } from '@/lib/reports/types';

function createWrapper() {
  const queryClient = createTestQueryClient();
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const chairReportProps: ReportProps = {
  showId: 'show-1',
  showName: 'Demo Show',
  entries: [],
  sortOrder: '',
  trial: { date: '2026-06-12', judgeName: 'Pat Judge', trialNumber: 'Trial 1', registryId: 'AKC' },
  officials: null,
};

function renderChairAction(officialsLoading: boolean) {
  return renderHook(
    () =>
      useAKCOfficialPdfAction({
        reportType: 'trial-chairman-report',
        showId: 'show-1',
        showName: 'Demo Show',
        currentShowName: 'Demo Show',
        isDataReady: true,
        hasShow: true,
        trialId: 'trial-1',
        classId: 'all',
        dogId: 'all',
        officialPdfProps: chairReportProps,
        officialClassPdfProps: null,
        ukcTrialReportContextLoading: false,
        officialsLoading,
      }),
    { wrapper: createWrapper() }
  );
}

describe('useAKCOfficialPdfAction — show officials readiness (MYK9-1386)', () => {
  it('names no missing official, and disables the download, while officials load', () => {
    const { result } = renderChairAction(true);
    expect(result.current?.disabled).toBe(true);
    expect(result.current?.missingFieldLabels).toEqual([]);
  });

  it('names the Trial Chair once officials have settled with none set', () => {
    const { result } = renderChairAction(false);
    expect(result.current?.missingFieldLabels).toContain('Trial Chair');
  });
});
