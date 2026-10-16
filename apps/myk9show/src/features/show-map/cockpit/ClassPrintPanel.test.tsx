import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen, waitFor } from '@/test/utils/testUtils';
import type { SecretaryCockpitPaperwork } from './secretaryCockpitTypes';

const mocks = vi.hoisted(() => ({
  printIframeAndWait: vi.fn(),
  recordPaperworkPrinted: vi.fn(),
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
  dataState: 'ready' as string,
}));

vi.mock('sonner', () => ({ toast: mocks.toast }));
vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useFastShowDetails', () => ({
  useFastShowDetails: () => ({ show: { id: 'show-1', trials: [] } }),
}));
vi.mock('@/hooks/queries/useReportData', () => ({
  useReportData: () => ({
    show: { id: 'show-1' },
    trials: [],
    classes: [],
    entries: [],
    catalogProfilesReadComplete: true,
    dataState: mocks.dataState,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/pages/secretary/ReportsPage/ReportPreviewBody', () => ({
  ReportPreviewBody: ({ reportType }: { reportType: string }) => (
    <iframe title={`frame-${reportType}`} />
  ),
}));
vi.mock('@/pages/secretary/ReportsPage/reportPreviewUtils', () => ({
  printIframeAndWait: mocks.printIframeAndWait,
}));
vi.mock('./MergedSheetsPreview', () => ({
  MergedSheetsPreview: ({ reportIds }: { reportIds: string[] }) => (
    <iframe title={`merged-${reportIds.join('+')}`} />
  ),
  unmergeableReportIds: (ids: string[]) => ids.filter(id => id === 'results-sheet'),
}));
vi.mock('./paperworkPrintActions', () => ({
  recordPaperworkPrinted: mocks.recordPaperworkPrinted,
}));

import { ClassPrintPanel } from './ClassPrintPanel';

function sheet(
  reportId: string,
  label: string,
  withConfirmation = true
): SecretaryCockpitPaperwork {
  return {
    reportId,
    label,
    state: 'unconfirmed',
    printHref: `/print/${reportId}`,
    ...(withConfirmation
      ? {
          confirmation: {
            scope: { kind: 'class', showId: 'show-1', trialId: 't1', classId: 'c1' },
            coverage: { scopeKind: 'class' },
            fingerprint: `fp-${reportId}`,
          },
        }
      : {}),
  } as SecretaryCockpitPaperwork;
}

function renderPanel(items: SecretaryCockpitPaperwork[], onClose = vi.fn()) {
  render(
    <ClassPrintPanel
      open
      showId="show-1"
      trialId="t1"
      classId="c1"
      classLabel="Novice Container"
      items={items}
      onClose={onClose}
    />
  );
  return onClose;
}

describe('ClassPrintPanel', () => {
  beforeEach(() => {
    mocks.printIframeAndWait.mockReset().mockResolvedValue(true);
    mocks.recordPaperworkPrinted.mockReset().mockResolvedValue({ id: 'r1' });
    mocks.toast.mockReset();
    mocks.toast.error.mockReset();
    mocks.dataState = 'ready';
  });

  it('merges a batch into ONE preview and ONE print job, recording every sheet when it closes', async () => {
    const onClose = renderPanel([
      sheet('check-in-sheet', 'Check-in sheet'),
      sheet('scoresheet', 'Score sheets'),
      sheet('scoresheet-2', 'Score sheets 2'),
    ]);
    expect(screen.getByTitle('merged-check-in-sheet+scoresheet+scoresheet-2')).toBeInTheDocument();
    expect(screen.queryByTitle('frame-check-in-sheet')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Print 3 sheets' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(mocks.printIframeAndWait).toHaveBeenCalledTimes(1);
    expect(mocks.recordPaperworkPrinted).toHaveBeenCalledTimes(3);
    expect(
      mocks.recordPaperworkPrinted.mock.calls.map(call => call[0].descriptor.reportId)
    ).toEqual(['check-in-sheet', 'scoresheet', 'scoresheet-2']);
    expect(mocks.recordPaperworkPrinted.mock.calls[0]![0].descriptor.fingerprint).toBe(
      'fp-check-in-sheet'
    );
    // The row's persistent line is the confirmation: no toast, and no undo-toast message.
    expect(mocks.recordPaperworkPrinted.mock.calls[0]![0].message).toBeUndefined();
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('previews a single sheet as itself', () => {
    renderPanel([sheet('check-in-sheet', 'Check-in sheet')]);
    expect(screen.getByTitle('frame-check-in-sheet')).toBeInTheDocument();
  });

  it('names a sheet that cannot join the batch and does not print', async () => {
    renderPanel([sheet('check-in-sheet', 'Check-in sheet'), sheet('results-sheet', 'Results')]);
    expect(screen.getByRole('alert')).toHaveTextContent('Results cannot be printed together');
    expect(screen.getByRole('button', { name: 'Print 2 sheets' })).toBeDisabled();
    expect(mocks.printIframeAndWait).not.toHaveBeenCalled();
  });

  it('records nothing when the preview was not ready to print', async () => {
    mocks.printIframeAndWait.mockResolvedValueOnce(false);
    renderPanel([sheet('check-in-sheet', 'Check-in sheet'), sheet('scoresheet', 'Score sheets')]);
    await userEvent.click(screen.getByRole('button', { name: 'Print 2 sheets' }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledOnce());
    expect(mocks.recordPaperworkPrinted).not.toHaveBeenCalled();
  });

  it('refuses to print while the class data is not current', async () => {
    mocks.dataState = 'loading';
    renderPanel([sheet('check-in-sheet', 'Check-in sheet')]);
    await userEvent.click(screen.getByRole('button', { name: 'Print' }));
    expect(mocks.printIframeAndWait).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledOnce();
  });

  it('says so when a sheet cannot be recorded, and still prints it', async () => {
    renderPanel([sheet('check-in-sheet', 'Check-in sheet', false)]);
    expect(screen.getByText(/will print without being recorded as printed/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Print' }));
    await waitFor(() => expect(mocks.printIframeAndWait).toHaveBeenCalledOnce());
    expect(mocks.recordPaperworkPrinted).not.toHaveBeenCalled();
  });
});
