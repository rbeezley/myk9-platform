import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen, waitFor } from '@/test/utils/testUtils';

import { printedSheetRowsOf } from '@/test/fixtures/printedSheetRows';
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
  /** Every trial's classes, as the replica read returns them (the earlier-trial note). */
  allClasses: undefined as unknown[] | undefined,
  /** The show's entry rows, as the replica read returns them (class counts for the note). */
  showEntries: [] as unknown[],
  trials: undefined as unknown[] | undefined,
  /** Records the panel's own prints wrote: they land in the print history, as in the app. */
  landed: [] as Array<Record<string, unknown>>,
  prints: {} as { data?: unknown; isLoading: boolean; isError: boolean; syncFailed: boolean },
  show: undefined as { usesPaperPacket?: boolean } | undefined,
}));

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useFastShowDetails', () => ({
  useFastShowDetails: () => ({ show: mocks.show ?? SHOW }),
}));
// One array per read, as the query hook returns, so the packets are built once.
const TRIALS = [TRIAL];
vi.mock('@/hooks/queries/useReportData', () => ({
  useReportData: () => ({
    show: SHOW,
    trials: mocks.trials ?? TRIALS,
    classes: CLASSES,
    entries: mocks.entries,
    dataState: 'ready',
    refetch: mocks.refetch,
  }),
}));
vi.mock('@/services/database/entries', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/entries')>()),
  getEntriesByShowFromReplication: async () => ({ data: mocks.showEntries, error: null }),
}));
vi.mock('@/hooks/queries/useShowClassRows', () => ({
  useShowClassRows: () => ({ data: mocks.allClasses }),
}));
// One array per change, as the query hook returns, so the packets are built once.
let merged: { base: unknown; landed: number; data: unknown[] } | null = null;
vi.mock('../useShowPaperworkPrints', () => ({
  useShowPaperworkPrints: () => {
    const base = mocks.prints.data;
    if (base === undefined) return mocks.prints;
    if (!merged || merged.base !== base || merged.landed !== mocks.landed.length) {
      merged = {
        base,
        landed: mocks.landed.length,
        data: [...(base as unknown[]), ...mocks.landed],
      };
    }
    return { ...mocks.prints, data: merged.data };
  },
}));
vi.mock('@/pages/secretary/ReportsPage/reportPreviewUtils', () => ({
  printIframeAndWait: mocks.printIframeAndWait,
}));
vi.mock('../paperworkPrintActions', () => ({
  recordPaperworkPrinted: mocks.recordPaperworkPrinted,
  voidPaperworkPrint: mocks.voidPaperworkPrint,
}));

import { TrialPacketPanel } from './TrialPacketPanel';
import { useShowStore } from '@/store/showStore';

// Building the packets (jsPDF and pdf-lib) takes a moment under test load.
const BUILT = { timeout: 15000 };

function renderPanel() {
  URL.createObjectURL = vi.fn(() => 'blob:packet');
  URL.revokeObjectURL = vi.fn();
  return render(<TrialPacketPanel open showId="show-1" trialId="trial-1" onClose={vi.fn()} />);
}

describe('TrialPacketPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.entries = ENTRIES;
    mocks.prints = { data: [], isLoading: false, isError: false, syncFailed: false };
    mocks.printIframeAndWait.mockResolvedValue(true);
    mocks.landed = [];
    mocks.allClasses = undefined;
    mocks.showEntries = [];
    mocks.trials = undefined;
    mocks.show = undefined;
    useShowStore.setState({ shows: [] });
    let next = 0;
    mocks.recordPaperworkPrinted.mockImplementation(
      async ({ descriptor }: { descriptor: ReturnType<typeof buildReportPaperworkDescriptor> }) => {
        const scope = descriptor!.scope as { trialId: string; classId: string };
        const id = `record-${++next}`;
        mocks.landed.push({
          id,
          showId: 'show-1',
          trialId: scope.trialId,
          classId: scope.classId,
          scopeKind: 'class',
          reportId: descriptor!.reportId,
          coverage: descriptor!.coverage,
          fingerprint: descriptor!.fingerprint,
          printedBy: 'u1',
          printedByName: 'Jannie',
          printedAt: new Date(Date.UTC(2030, 0, 1) + next * 1000).toISOString(),
        });
        return { id };
      }
    );
    mocks.voidPaperworkPrint.mockImplementation(async ({ recordId }: { recordId: string }) => {
      const row = mocks.landed.find(item => item.id === recordId);
      if (row) row.voidedAt = new Date().toISOString();
    });
  });

  it('opens on the trial, collated by judge, with every packet and its sheet count', async () => {
    renderPanel();
    expect(await screen.findByText(/Trial 1 · Mon, Dec 7/)).toBeInTheDocument();
    expect(screen.getByText(/collated/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pat Donovan/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sam Lee/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /No judge assigned/ })).toBeInTheDocument();
    expect(screen.getByText(/1 class has no dogs running yet and is left out/)).toBeInTheDocument();
  });

  it.each([
    ['unset (on by default)', undefined, undefined, true],
    ['off on the show', false, undefined, false],
    ['turned off in Edit show, ahead of the show snapshot', true, false, false],
  ])(
    'the Saved copy section follows the Paper fallback packet switch: %s',
    async (_, snap, live, shown) => {
      mocks.show = { ...SHOW, usesPaperPacket: snap };
      if (live !== undefined) {
        useShowStore.setState({
          shows: [{ ...SHOW, id: 'show-1', usesPaperPacket: live }] as never,
        });
      }
      renderPanel();
      expect(await screen.findByText(/Trial 1 · Mon, Dec 7/)).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Saved copy' }) !== null).toBe(shown);
    }
  );

  describe('a later trial printed before the earlier one has finished (MYK9-2075)', () => {
    const FIRST = {
      ...TRIAL,
      id: 'trial-0',
      name: 'Trial 1',
      trial_number: '1',
    } as unknown as typeof TRIAL;
    const SECOND = { ...TRIAL, name: 'Trial 2', trial_number: '2' } as unknown as typeof TRIAL;
    const earlierClass = (status: string) => ({ id: 'e1', trial_id: 'trial-0', status });
    const NOTE = "Trial 1 isn't finished. Move-ups may change these sheets.";

    it('shows a plain note and keeps Print available', async () => {
      mocks.trials = [FIRST, SECOND];
      mocks.allClasses = [earlierClass('in_progress'), earlierClass('completed')];
      mocks.showEntries = [{ class_id: 'e1', entry_status: 'confirmed' }];
      renderPanel();
      expect(await screen.findByText(NOTE)).toBeInTheDocument();
      const print = screen.getByRole('button', { name: 'Print all 3 packets' });
      await waitFor(() => expect(print).toBeEnabled(), BUILT);
    });

    it('shows nothing once the earlier trial is finished', async () => {
      mocks.trials = [FIRST, SECOND];
      mocks.allClasses = [earlierClass('completed'), earlierClass('completed')];
      renderPanel();
      await screen.findByText(/collated/);
      expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
    });

    it('shows nothing when the earlier trial only has a class with no dogs left to run', async () => {
      mocks.trials = [FIRST, SECOND];
      mocks.allClasses = [earlierClass('in_progress'), earlierClass('completed')];
      mocks.showEntries = [];
      renderPanel();
      await screen.findByText(/collated/);
      await waitFor(() => expect(screen.queryByText(NOTE)).not.toBeInTheDocument());
    });

    it('shows nothing for the first trial of the day', async () => {
      mocks.trials = [
        { ...TRIAL, trial_number: '1' },
        { ...SECOND, id: 'trial-9' },
      ];
      mocks.allClasses = [{ id: 'l1', trial_id: 'trial-9', status: 'not_started' }];
      renderPanel();
      await screen.findByText(/collated/);
      expect(screen.queryByText(/isn't finished/)).not.toBeInTheDocument();
    });
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
        assignedJudges: [],
        reportId: 'scoresheet',
        scope: { kind: 'class', showId: 'show-1', trialId: 'trial-1', classId },
        classes: CLASSES,
        entries: ENTRIES,
        printedSheets: printedSheetRowsOf(CLASSES, ENTRIES, [TRIAL]),
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
            assignedJudges: [],
            reportId,
            scope: { kind: 'class', showId: 'show-1', trialId: 'trial-1', classId: cls.id },
            classes: CLASSES,
            entries: at,
            printedSheets: printedSheetRowsOf(CLASSES, at, [TRIAL]),
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

    it('after a first-ever print stays on every class, with the marked line and Undo', async () => {
      const user = userEvent.setup();
      renderPanel();
      const print = await screen.findByRole('button', { name: 'Print all 3 packets' });
      await waitFor(() => expect(print).toBeEnabled(), BUILT);
      await user.click(print);
      expect(await screen.findByText('All 4 classes marked as printed with Trial 1')).toBeVisible();
      // The records have landed: every class now reads printed, and the view did not move.
      expect(mocks.landed.length).toBe(8);
      expect(screen.getByRole('button', { name: 'Undo' })).toBeVisible();
      expect(screen.getByRole('button', { name: /Pat Donovan/ })).toBeInTheDocument();
      expect(screen.queryByText('Everything in this trial is printed and unchanged.')).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Undo' }));
      await waitFor(() => expect(mocks.voidPaperworkPrint).toHaveBeenCalledTimes(8));
    });

    it('keeps the printed classes on screen after a narrowed print, with the marked line', async () => {
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
      expect(mocks.landed.length).toBe(2);
      expect(screen.getByRole('button', { name: /Sam Lee/ })).toBeInTheDocument();
      expect(screen.getByText(/Only the 1 class that needed printing/)).toBeVisible();
      expect(screen.getByRole('button', { name: 'Undo' })).toBeVisible();
      expect(screen.queryByText('Everything in this trial is printed and unchanged.')).toBeNull();
    });

    it('shows a class that starts needing printing while the panel is open', async () => {
      mocks.prints = {
        data: printedRecords(),
        isLoading: false,
        isError: false,
        syncFailed: false,
      };
      mocks.entries = [...ENTRIES, entryRow('e9', 'c-exterior', 202, 2)];
      const view = renderPanel();
      expect(await screen.findByRole('button', { name: /Sam Lee/ })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Pat Donovan/ })).toBeNull();
      mocks.entries = [...mocks.entries, entryRow('e10', 'c-container', 104, 4)];
      view.rerender(<TrialPacketPanel open showId="show-1" trialId="trial-1" onClose={vi.fn()} />);
      expect(await screen.findByRole('button', { name: /Pat Donovan/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Sam Lee/ })).toBeInTheDocument();
    });

    it('opens on the empty view and still shows Undo after printing every class instead', async () => {
      const user = userEvent.setup();
      mocks.prints = {
        data: printedRecords(),
        isLoading: false,
        isError: false,
        syncFailed: false,
      };
      renderPanel();
      await user.click(await screen.findByRole('button', { name: 'Print every class instead' }));
      const print = await screen.findByRole('button', { name: 'Print all 3 packets' });
      await waitFor(() => expect(print).toBeEnabled(), BUILT);
      await user.click(print);
      expect(await screen.findByText('All 4 classes marked as printed with Trial 1')).toBeVisible();
      expect(screen.getByRole('button', { name: 'Undo' })).toBeVisible();
      expect(screen.getByRole('button', { name: /Pat Donovan/ })).toBeInTheDocument();
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

    it('shows every class when the history becomes unavailable after opening narrowed, and narrows again when it returns', async () => {
      mocks.prints = {
        data: printedRecords(),
        isLoading: false,
        isError: false,
        syncFailed: false,
      };
      mocks.entries = [...ENTRIES, entryRow('e9', 'c-exterior', 202, 2)];
      const { rerender } = renderPanel();
      expect(await screen.findByText(/Only the 1 class that changed since printing/)).toBeVisible();
      expect(screen.queryByRole('button', { name: /Pat Donovan/ })).not.toBeInTheDocument();

      // The history goes unavailable: the note says every class is shown, and the packet holds them.
      mocks.prints = { ...mocks.prints, syncFailed: true };
      rerender(<TrialPacketPanel open showId="show-1" trialId="trial-1" onClose={vi.fn()} />);
      expect(await screen.findByText(/Could not check which classes changed/)).toBeVisible();
      expect(await screen.findByRole('button', { name: /Pat Donovan/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Sam Lee/ })).toBeInTheDocument();

      // It comes back: the view she opened on returns.
      mocks.prints = { ...mocks.prints, syncFailed: false };
      rerender(<TrialPacketPanel open showId="show-1" trialId="trial-1" onClose={vi.fn()} />);
      expect(await screen.findByText(/Only the 1 class that changed since printing/)).toBeVisible();
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: /Pat Donovan/ })).not.toBeInTheDocument()
      );
    });
  });
});
