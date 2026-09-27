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

const ukcTrialReportProps: ReportProps = {
  showId: 'show-1',
  showName: 'Demo Show',
  entries: [],
  sortOrder: '',
  trial: {
    date: '2026-06-12',
    judgeName: 'Pat Judge',
    trialNumber: 'Trial 1',
    registryId: 'UKC',
  },
};

describe('useAKCOfficialPdfAction — UKC Trial Report context readiness (MYK9-828)', () => {
  it('disables the download while the UKC context query is still loading', () => {
    const { result } = renderHook(
      () =>
        useAKCOfficialPdfAction({
          reportType: 'ukc-nosework-trial-report',
          showId: 'show-1',
          showName: 'Demo Show',
          currentShowName: 'Demo Show',
          isDataReady: true,
          hasShow: true,
          trialId: 'trial-1',
          classId: 'all',
          dogId: 'all',
          officialPdfProps: ukcTrialReportProps,
          officialClassPdfProps: null,
          ukcTrialReportContextLoading: true,
        }),
      { wrapper: createWrapper() }
    );

    expect(result.current?.disabled).toBe(true);
  });

  it('enables the download once the UKC context query has resolved', () => {
    const { result } = renderHook(
      () =>
        useAKCOfficialPdfAction({
          reportType: 'ukc-nosework-trial-report',
          showId: 'show-1',
          showName: 'Demo Show',
          currentShowName: 'Demo Show',
          isDataReady: true,
          hasShow: true,
          trialId: 'trial-1',
          classId: 'all',
          dogId: 'all',
          officialPdfProps: ukcTrialReportProps,
          officialClassPdfProps: null,
          ukcTrialReportContextLoading: false,
        }),
      { wrapper: createWrapper() }
    );

    expect(result.current?.disabled).toBe(false);
  });

  it('does not wait on the UKC context query for an AKC trial secretary report', () => {
    const { result } = renderHook(
      () =>
        useAKCOfficialPdfAction({
          reportType: 'trial-secretary-report',
          showId: 'show-1',
          showName: 'Demo Show',
          currentShowName: 'Demo Show',
          isDataReady: true,
          hasShow: true,
          trialId: 'trial-1',
          classId: 'all',
          dogId: 'all',
          officialPdfProps: {
            ...ukcTrialReportProps,
            trial: { ...ukcTrialReportProps.trial!, registryId: 'AKC' },
          },
          officialClassPdfProps: null,
          // Still true — an AKC report never needs the UKC-only context.
          ukcTrialReportContextLoading: true,
        }),
      { wrapper: createWrapper() }
    );

    expect(result.current?.disabled).toBe(false);
  });
});
