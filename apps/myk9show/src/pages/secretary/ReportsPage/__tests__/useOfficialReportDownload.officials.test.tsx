import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { fromAny } from '@total-typescript/shoehorn';
import type { ReportProps, TrialOfficials } from '@/lib/reports/types';
import type { DbTrial } from '@/types/database-mappings';
import type { Show } from '@/types/show-types';
import { useOfficialReportDownload } from '../useOfficialReportDownload';

const useTrialOfficialsMock = vi.fn();
const actionMock = vi.fn();

vi.mock('@/hooks/queries/useTrialOfficials', () => ({
  useTrialOfficials: (...args: unknown[]) => useTrialOfficialsMock(...args),
}));
vi.mock('@/hooks/queries/useUKCTrialReportContext', () => ({
  useUKCTrialReportContext: () => ({ data: undefined, isLoading: false }),
}));
vi.mock('../useAKCOfficialPdfAction', () => ({
  useAKCOfficialPdfAction: (input: unknown) => {
    actionMock(input);
    return {};
  },
}));

const officials: TrialOfficials = {
  chairperson: {
    name: 'Casey Chair',
    streetAddress: null,
    city: null,
    state: null,
    zipCode: null,
    phone: null,
    email: null,
  },
  secretary: null,
};

const show = { id: 'show-1', name: 'Spring Trial', clubName: 'Demo Club' } as Show;

function trial(registry: string) {
  return fromAny<DbTrial, unknown>({
    id: 'trial-1',
    date: '2026-04-12',
    registry_id: registry,
    trial_number: '1',
  });
}

function run(reportType: string, registry: string, trialId = 'trial-1') {
  renderHook(() =>
    useOfficialReportDownload({
      reportType,
      showId: 'show-1',
      currentShowName: 'Spring Trial',
      show,
      trials: [trial(registry)],
      classes: [],
      entries: [],
      trialId,
      classId: 'all',
      dogId: 'all',
      sortOrder: '',
      isReady: true,
    })
  );
  return actionMock.mock.lastCall![0] as {
    officialPdfProps: ReportProps | null;
    officialsLoading: boolean;
  };
}

describe('useOfficialReportDownload officials (MYK9-1386)', () => {
  beforeEach(() => {
    useTrialOfficialsMock.mockReset();
    actionMock.mockReset();
  });

  it.each(['trial-chairman-report', 'trial-secretary-report'])(
    'merges the officials into the %s props for an AKC trial',
    reportType => {
      useTrialOfficialsMock.mockReturnValue({ data: officials, isLoading: false });
      const input = run(reportType, 'AKC');

      expect(useTrialOfficialsMock).toHaveBeenLastCalledWith('show-1', true);
      expect(input.officialPdfProps?.officials).toBe(officials);
      expect(input.officialsLoading).toBe(false);
    }
  );

  it('passes the in-flight read as officialsLoading', () => {
    useTrialOfficialsMock.mockReturnValue({ data: undefined, isLoading: true });
    expect(run('trial-chairman-report', 'AKC').officialsLoading).toBe(true);
  });

  it('does not read officials for a UKC trial', () => {
    useTrialOfficialsMock.mockReturnValue({ data: undefined, isLoading: false });
    const input = run('trial-secretary-report', 'UKC');

    expect(useTrialOfficialsMock).toHaveBeenLastCalledWith('show-1', false);
    expect(input.officialPdfProps?.officials).toBeNull();
  });

  it("does not read officials for 'all' trials", () => {
    useTrialOfficialsMock.mockReturnValue({ data: undefined, isLoading: false });
    run('trial-chairman-report', 'AKC', 'all');
    expect(useTrialOfficialsMock).toHaveBeenLastCalledWith('show-1', false);
  });

  it('does not read officials for another official report', () => {
    useTrialOfficialsMock.mockReturnValue({ data: undefined, isLoading: false });
    run('akc-judge-report', 'AKC');
    expect(useTrialOfficialsMock).toHaveBeenLastCalledWith('show-1', false);
  });
});
