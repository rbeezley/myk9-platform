import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen, waitFor } from '@/test/utils/testUtils';
import type { SecretaryCockpitPaperwork } from './secretaryCockpitTypes';

const mocks = vi.hoisted(() => ({
  printIframeAndWait: vi.fn(),
  recordPaperworkPrinted: vi.fn(),
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
  dataState: 'ready' as string,
  refetch: vi.fn(),
  entries: [] as unknown[],
}));

const CLASS_ROW = {
  id: 'c1',
  trial_id: 't1',
  element: 'Container',
  level: 'Novice',
  section: null,
  time_limit_seconds: 180,
  num_areas: 1,
  num_hides: 1,
};
function entryRow(id: string, runOrder: number) {
  return {
    id,
    class_id: 'c1',
    dog_id: `d-${id}`,
    armband: 100 + runOrder,
    run_order: runOrder,
    check_in_status: 'no-status',
  };
}
const PREVIEW_ROWS = [entryRow('e1', 1), entryRow('e2', 2)];
const EXPECTED_SCOPE = { kind: 'class', showId: 'show-1', trialId: 't1', classId: 'c1' } as const;
const expectedFor = (reportId: string, entries: unknown[]) =>
  buildReportPaperworkDescriptor({
    reportId,
    scope: EXPECTED_SCOPE,
    classes: [CLASS_ROW] as never,
    entries: entries as never,
  });

vi.mock('sonner', () => ({ toast: mocks.toast }));
vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useFastShowDetails', () => ({
  useFastShowDetails: () => ({ show: { id: 'show-1', trials: [] } }),
}));
vi.mock('@/hooks/queries/useReportData', () => ({
  useReportData: () => ({
    show: { id: 'show-1' },
    trials: [],
    classes: [CLASS_ROW],
    entries: mocks.entries,
    catalogProfilesReadComplete: true,
    dataState: mocks.dataState,
    isLoading: false,
    isError: false,
    refetch: mocks.refetch,
  }),
}));
vi.mock('@/pages/secretary/ReportsPage/ReportPreviewBody', () => ({
  ReportPreviewBody: ({
    reportType,
    onArmbandDescriptorChange,
  }: {
    reportType: string;
    onArmbandDescriptorChange?: (descriptor: unknown) => void;
  }) => (
    <>
      <iframe title={`frame-${reportType}`} />
      <button
        type="button"
        onClick={() =>
          onArmbandDescriptorChange?.({
            reportId: 'armband-labels',
            scope: { kind: 'class', showId: 'show-1', trialId: 't1', classId: 'c1' },
            coverage: { scopeKind: 'class', picked: true },
            fingerprint: 'fp-picked-armbands',
          })
        }
      >
        pick armbands
      </button>
    </>
  ),
}));
vi.mock('@/pages/secretary/ReportsPage/reportPreviewUtils', () => ({
  printIframeAndWait: mocks.printIframeAndWait,
}));
vi.mock('./MergedSheetsPreview', () => ({
  MergedSheetsPreview: function MergedStub({
    reportIds,
    onReadyChange,
  }: {
    reportIds: string[];
    onReadyChange?: (ready: boolean) => void;
  }) {
    useEffect(() => {
      onReadyChange?.(true);
    }, [onReadyChange]);
    return <iframe title={`merged-${reportIds.join('+')}`} />;
  },
  unmergeableReportIds: (ids: string[]) => ids.filter(id => id === 'results-sheet'),
}));
vi.mock('./paperworkPrintActions', () => ({
  recordPaperworkPrinted: mocks.recordPaperworkPrinted,
}));

import { buildReportPaperworkDescriptor } from './buildReportPaperworkDescriptor';
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
    mocks.refetch.mockReset();
    mocks.entries = PREVIEW_ROWS;
  });

  it('merges a batch into ONE preview and ONE print job, recording every sheet when it closes', async () => {
    const onClose = renderPanel([
      sheet('check-in-sheet', 'Check-in sheet'),
      sheet('scoresheet', 'Score sheets'),
      sheet('result-labels', 'Result labels'),
    ]);
    expect(screen.getByTitle('merged-check-in-sheet+scoresheet+result-labels')).toBeInTheDocument();
    expect(screen.queryByTitle('frame-check-in-sheet')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Print 3 sheets' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(mocks.printIframeAndWait).toHaveBeenCalledTimes(1);
    expect(mocks.recordPaperworkPrinted).toHaveBeenCalledTimes(3);
    expect(
      mocks.recordPaperworkPrinted.mock.calls.map(call => call[0].descriptor.reportId)
    ).toEqual(['check-in-sheet', 'scoresheet', 'result-labels']);
    // Every sheet is fingerprinted from the rows the merged preview rendered, not item.confirmation.
    for (const [index, reportId] of ['check-in-sheet', 'scoresheet', 'result-labels'].entries()) {
      expect(mocks.recordPaperworkPrinted.mock.calls[index]![0].descriptor).toEqual(
        expectedFor(reportId, PREVIEW_ROWS)
      );
    }
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
    renderPanel([sheet('unknown-sheet', 'Mystery sheet', false)]);
    expect(screen.getByText(/will print without being recorded as printed/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Print' }));
    await waitFor(() => expect(mocks.printIframeAndWait).toHaveBeenCalledOnce());
    expect(mocks.recordPaperworkPrinted).not.toHaveBeenCalled();
  });

  it('records exactly the armband labels shown, not the full-class descriptor', async () => {
    renderPanel([sheet('armband-labels', 'Armband labels')]);
    await userEvent.click(screen.getByRole('button', { name: 'pick armbands' }));
    await userEvent.click(screen.getByRole('button', { name: 'Print' }));
    await waitFor(() => expect(mocks.recordPaperworkPrinted).toHaveBeenCalledOnce());
    const descriptor = mocks.recordPaperworkPrinted.mock.calls[0]![0].descriptor;
    expect(descriptor.fingerprint).toBe('fp-picked-armbands');
    expect(descriptor.coverage).toEqual({ scopeKind: 'class', picked: true });
  });

  it('records no armband print until the preview has reported what it shows', async () => {
    renderPanel([sheet('armband-labels', 'Armband labels')]);
    await userEvent.click(screen.getByRole('button', { name: 'Print' }));
    await waitFor(() => expect(mocks.printIframeAndWait).toHaveBeenCalledOnce());
    expect(mocks.recordPaperworkPrinted).not.toHaveBeenCalled();
  });

  it('prints armband labels while unrelated report queries are still loading', async () => {
    mocks.dataState = 'loading';
    renderPanel([sheet('armband-labels', 'Armband labels')]);
    await userEvent.click(screen.getByRole('button', { name: 'Print' }));
    expect(mocks.toast).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.printIframeAndWait).toHaveBeenCalledOnce());
  });

  it('shows why a batch cannot preview, with Try again, when the class data failed to load', async () => {
    mocks.dataState = 'error';
    renderPanel([sheet('check-in-sheet', 'Check-in sheet'), sheet('scoresheet', 'Score sheets')]);
    expect(screen.getByRole('alert')).toHaveTextContent('The entries could not be loaded');
    mocks.refetch.mockClear(); // the open-time re-read is covered separately
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mocks.refetch).toHaveBeenCalledOnce();
  });

  it('records a single sheet from the rows its preview used, not the Overview fingerprint', async () => {
    // The Overview's map says something else entirely (a run-order change it already saw)...
    const item = sheet('check-in-sheet', 'Check-in sheet');
    // ...while the cached report rows the preview rendered still carry the OLD order.
    const stale = [entryRow('e1', 2), entryRow('e2', 1)];
    mocks.entries = stale;
    renderPanel([item]);
    await userEvent.click(screen.getByRole('button', { name: 'Print' }));
    await waitFor(() => expect(mocks.recordPaperworkPrinted).toHaveBeenCalledOnce());
    const descriptor = mocks.recordPaperworkPrinted.mock.calls[0]![0].descriptor;
    expect(descriptor).toEqual(expectedFor('check-in-sheet', stale));
    expect(descriptor.fingerprint).not.toBe(item.confirmation!.fingerprint);
    expect(descriptor.fingerprint).not.toBe(
      expectedFor('check-in-sheet', PREVIEW_ROWS)!.fingerprint
    );
  });

  it('records nothing for a sheet whose preview rows describe nothing', async () => {
    mocks.entries = [];
    renderPanel([sheet('check-in-sheet', 'Check-in sheet')]);
    await userEvent.click(screen.getByRole('button', { name: 'Print' }));
    await waitFor(() => expect(mocks.printIframeAndWait).toHaveBeenCalledOnce());
    expect(mocks.recordPaperworkPrinted).not.toHaveBeenCalled();
  });

  it('re-reads the class data when the panel opens, so a cached preview is never recorded as current', () => {
    renderPanel([sheet('check-in-sheet', 'Check-in sheet')]);
    expect(mocks.refetch).toHaveBeenCalledOnce();
  });
});
