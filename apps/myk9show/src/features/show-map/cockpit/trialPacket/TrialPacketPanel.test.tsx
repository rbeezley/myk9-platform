import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen, waitFor } from '@/test/utils/testUtils';

import { buildReportPaperworkDescriptor } from '../buildReportPaperworkDescriptor';
import type { DbEntry } from '@/types/database-mappings';
import type { ReplicatedPaperworkPrint } from '@/services/replication';

import { CLASSES, ENTRIES, SHOW, TRIAL, entryRow } from './trialPacketFixtures';

const mocks = vi.hoisted(() => ({
  printIframeAndWait: vi.fn(),
  recordPaperworkPrinted: vi.fn(),
  voidPaperworkPrint: vi.fn(),
  refetch: vi.fn(),
  entries: [] as DbEntry[],
  prints: {} as { data?: unknown; isLoading: boolean; isError: boolean; syncFailed: boolean },
}));

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useFastShowDetails', () => ({
  useFastShowDetails: () => ({ show: SHOW }),
}));
// One array per read, as the query hook returns, so the packets are built once.
const TRIALS = [TRIAL];
vi.mock('@/hooks/queries/useReportData', () => ({
  useReportData: () => ({
    show: SHOW,
    trials: TRIALS,
    classes: CLASSES,
    entries: mocks.entries,
    dataState: 'ready',
    refetch: mocks.refetch,
  }),
}));
vi.mock('../useShowPaperworkPrints', () => ({ useShowPaperworkPrints: () => mocks.prints }));
vi.mock('@/pages/secretary/ReportsPage/reportPreviewUtils', () => ({
  printIframeAndWait: mocks.printIframeAndWait,
}));
vi.mock('../paperworkPrintActions', () => ({
  recordPaperworkPrinted: mocks.recordPaperworkPrinted,
  voidPaperworkPrint: mocks.voidPaperworkPrint,
}));

import { TrialPacketPanel } from './TrialPacketPanel';

// Building the packets (jsPDF and pdf-lib) takes a moment under test load.
const BUILT = { timeout: 15000 };

function renderPanel() {
  URL.createObjectURL = vi.fn(() => 'blob:packet');
  URL.revokeObjectURL = vi.fn();
  render(<TrialPacketPanel open showId="show-1" trialId="trial-1" onClose={vi.fn()} />);
}

describe('TrialPacketPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.entries = ENTRIES;
    mocks.prints = { data: [], isLoading: false, isError: false, syncFailed: false };
    mocks.printIframeAndWait.mockResolvedValue(true);
    let next = 0;
    mocks.recordPaperworkPrinted.mockImplementation(async () => ({ id: `record-${++next}` }));
  });

  it('opens on the trial, collated by judge, with every packet and its sheet count', async () => {
    renderPanel();
    expect(await screen.findByText(/Trial 1 · Mon, Dec 7/)).toBeInTheDocument();
    expect(screen.getByText(/collated/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pat Donovan/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sam Lee/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /No judge assigned/ })).toBeInTheDocument();
    expect(screen.getByText(/1 class has no dogs yet and is left out/)).toBeInTheDocument();
  });

  it('marks every class in the trial printed once the print dialog closes, and Undo voids them', async () => {
    const user = userEvent.setup();
    renderPanel();
    const print = await screen.findByRole('button', { name: 'Print all 3 packets' });
    await waitFor(() => expect(print).toBeEnabled(), BUILT);
    await user.click(print);
    expect(await screen.findByText('All 4 classes marked as printed with Trial 1')).toBeVisible();
    for (const classId of ['c-interior', 'c-container', 'c-exterior', 'c-buried']) {
      const expected = buildReportPaperworkDescriptor({
        reportId: 'scoresheet',
        scope: { kind: 'class', showId: 'show-1', trialId: 'trial-1', classId },
        classes: CLASSES,
        entries: ENTRIES,
      });
      expect(mocks.recordPaperworkPrinted).toHaveBeenCalledWith(
        expect.objectContaining({ descriptor: expected })
      );
    }
    expect(mocks.recordPaperworkPrinted).toHaveBeenCalledTimes(8);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(mocks.voidPaperworkPrint).toHaveBeenCalledTimes(8));
  });

  it('prints only the picked judge’s packet and marks only that judge’s classes', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole('button', { name: /Sam Lee/ }));
    const print = screen.getByRole('button', { name: "Print Sam Lee's packet" });
    await waitFor(() => expect(print).toBeEnabled(), BUILT);
    await user.click(print);
    await screen.findByText(/1 class marked as printed \(Sam Lee's packet\)/);
    expect(mocks.recordPaperworkPrinted).toHaveBeenCalledTimes(2);
  });

  it('marks nothing when the secretary only saves the PDF', async () => {
    const user = userEvent.setup();
    renderPanel();
    const save = await screen.findByRole('button', { name: 'Save as PDF' });
    await waitFor(() => expect(save).toBeEnabled(), BUILT);
    await user.click(save);
    expect(mocks.recordPaperworkPrinted).not.toHaveBeenCalled();
  });

  describe('only what changed (MYK9-2074)', () => {
    /** Every class printed at the entries as they stood, as a trial print writes them. */
    function printedRecords(
      only?: readonly string[],
      at: readonly DbEntry[] = ENTRIES
    ): ReplicatedPaperworkPrint[] {
      return CLASSES.filter(cls => !only || only.includes(cls.id)).flatMap(cls =>
        (['check-in-sheet', 'scoresheet'] as const).flatMap(reportId => {
          const descriptor = buildReportPaperworkDescriptor({
            reportId,
            scope: { kind: 'class', showId: 'show-1', trialId: 'trial-1', classId: cls.id },
            classes: CLASSES,
            entries: at,
          });
          if (!descriptor) return [];
          return [
            {
              id: `${reportId}-${cls.id}`,
              showId: 'show-1',
              trialId: 'trial-1',
              classId: cls.id,
              scopeKind: 'class',
              reportId,
              coverage: descriptor.coverage,
              fingerprint: descriptor.fingerprint,
              printedBy: 'u1',
              printedByName: 'Jannie',
              printedAt: '2026-12-07T08:00:00Z',
            } as ReplicatedPaperworkPrint,
          ];
        })
      );
    }

    it('opens on only the class a late entry changed, with a way back to all, and Print still works', async () => {
      const user = userEvent.setup();
      mocks.prints = {
        data: printedRecords(),
        isLoading: false,
        isError: false,
        syncFailed: false,
      };
      mocks.entries = [...ENTRIES, entryRow('e9', 'c-exterior', 202, 2)];
      renderPanel();
      expect(await screen.findByText(/Only the 1 class that changed since printing/)).toBeVisible();
      expect(screen.getByRole('button', { name: /Sam Lee/ })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Pat Donovan/ })).not.toBeInTheDocument();
      const print = screen.getByRole('button', { name: /Print/ });
      await waitFor(() => expect(print).toBeEnabled(), BUILT);
      await user.click(screen.getByRole('button', { name: 'Show all classes' }));
      expect(await screen.findByRole('button', { name: /Pat Donovan/ })).toBeInTheDocument();
      expect(screen.getByText(/1 class needs printing: 1 changed since printing/)).toBeVisible();
    });

    it('prints and marks only the changed class when it stays on only what changed', async () => {
      const user = userEvent.setup();
      mocks.prints = {
        data: printedRecords(),
        isLoading: false,
        isError: false,
        syncFailed: false,
      };
      mocks.entries = [...ENTRIES, entryRow('e9', 'c-exterior', 202, 2)];
      renderPanel();
      const print = await screen.findByRole('button', { name: 'Print all 1 packet' });
      await waitFor(() => expect(print).toBeEnabled(), BUILT);
      await user.click(print);
      await screen.findByText('1 class marked as printed with Trial 1');
      expect(mocks.recordPaperworkPrinted).toHaveBeenCalledTimes(2);
    });

    it('opens on the empty view when everything is printed and unchanged, and Print every class instead undoes it', async () => {
      const user = userEvent.setup();
      mocks.prints = {
        data: printedRecords(),
        isLoading: false,
        isError: false,
        syncFailed: false,
      };
      renderPanel();
      expect(
        await screen.findByText('Everything in this trial is printed and unchanged.')
      ).toBeVisible();
      expect(screen.getByRole('button', { name: 'Print' })).toBeDisabled();
      await user.click(screen.getByRole('button', { name: 'Print every class instead' }));
      expect(await screen.findByRole('button', { name: /Pat Donovan/ })).toBeInTheDocument();
      await waitFor(
        () => expect(screen.getByRole('button', { name: 'Print all 3 packets' })).toBeEnabled(),
        BUILT
      );
    });

    it('opens on every class, with no note, when nothing was ever printed', async () => {
      renderPanel();
      expect(await screen.findByRole('button', { name: /Pat Donovan/ })).toBeInTheDocument();
      expect(screen.queryByText(/need printing|changed since printing|not printed yet/)).toBeNull();
      expect(screen.queryByText(/Could not check/)).toBeNull();
    });

    it('names both the changed and the never printed classes', async () => {
      mocks.prints = {
        data: printedRecords(['c-container', 'c-exterior', 'c-interior']),
        isLoading: false,
        isError: false,
        syncFailed: false,
      };
      mocks.entries = [...ENTRIES, entryRow('e9', 'c-exterior', 202, 2)];
      renderPanel();
      expect(
        await screen.findByText(
          'Only the 2 classes that need printing: 1 changed since printing, 1 not printed yet.'
        )
      ).toBeVisible();
      expect(screen.getByRole('button', { name: /Sam Lee/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /No judge assigned/ })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Pat Donovan/ })).not.toBeInTheDocument();
    });

    it('keeps the printed classes on screen after printing, and does not say All', async () => {
      const user = userEvent.setup();
      mocks.prints = {
        data: printedRecords(),
        isLoading: false,
        isError: false,
        syncFailed: false,
      };
      mocks.entries = [...ENTRIES, entryRow('e9', 'c-exterior', 202, 2)];
      renderPanel();
      const print = await screen.findByRole('button', { name: 'Print all 1 packet' });
      await waitFor(() => expect(print).toBeEnabled(), BUILT);
      await user.click(print);
      expect(await screen.findByText('1 class marked as printed with Trial 1')).toBeVisible();
      // The record now matches the entries, as it does once the print is written.
      mocks.prints = {
        data: printedRecords(undefined, mocks.entries),
        isLoading: false,
        isError: false,
        syncFailed: false,
      };
      expect(screen.getByRole('button', { name: /Sam Lee/ })).toBeInTheDocument();
      expect(screen.getByText(/Only the 1 class that needed printing/)).toBeVisible();
    });

    it('says a picked judge has nothing to print in the narrowed view', async () => {
      const user = userEvent.setup();
      mocks.prints = {
        data: printedRecords(),
        isLoading: false,
        isError: false,
        syncFailed: false,
      };
      mocks.entries = [...ENTRIES, entryRow('e9', 'c-exterior', 202, 2)];
      renderPanel();
      await user.click(await screen.findByRole('button', { name: 'Show all classes' }));
      await user.click(await screen.findByRole('button', { name: /Pat Donovan/ }));
      await user.click(screen.getByRole('button', { name: 'Show only what needs printing' }));
      expect(await screen.findByText('Pat Donovan has nothing that needs printing.')).toBeVisible();
    });

    it('says a class that changed and now has no dogs has nothing to reprint', async () => {
      const emptyPrint = {
        id: 'p-empty',
        showId: 'show-1',
        trialId: 'trial-1',
        classId: 'c-empty',
        scopeKind: 'class',
        reportId: 'check-in-sheet',
        coverage: {},
        fingerprint: 'x',
        printedBy: 'u1',
        printedByName: 'Jannie',
        printedAt: '2026-12-07T08:00:00Z',
      } as ReplicatedPaperworkPrint;
      mocks.prints = {
        data: [...printedRecords(), emptyPrint],
        isLoading: false,
        isError: false,
        syncFailed: false,
      };
      renderPanel();
      expect(
        await screen.findByText(/1 class changed since printing and now has no dogs/)
      ).toBeVisible();
    });

    it('says nothing about checking while the print history is still loading', async () => {
      mocks.prints = { data: undefined, isLoading: true, isError: false, syncFailed: false };
      renderPanel();
      expect(await screen.findByRole('button', { name: /Pat Donovan/ })).toBeInTheDocument();
      expect(screen.queryByText(/Could not check/)).toBeNull();
    });

    it('says it could not check, and shows every class, when the print history is unavailable', async () => {
      mocks.prints = { data: printedRecords(), isLoading: false, isError: false, syncFailed: true };
      mocks.entries = [...ENTRIES, entryRow('e9', 'c-exterior', 202, 2)];
      renderPanel();
      expect(await screen.findByText(/Could not check which classes changed/)).toBeVisible();
      expect(screen.getByRole('button', { name: /Pat Donovan/ })).toBeInTheDocument();
    });
  });
});
