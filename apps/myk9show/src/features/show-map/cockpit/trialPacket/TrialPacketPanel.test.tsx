import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen, waitFor } from '@/test/utils/testUtils';

import { buildReportPaperworkDescriptor } from '../buildReportPaperworkDescriptor';
import { CLASSES, ENTRIES, SHOW, TRIAL } from './trialPacketFixtures';

const mocks = vi.hoisted(() => ({
  printIframeAndWait: vi.fn(),
  recordPaperworkPrinted: vi.fn(),
  voidPaperworkPrint: vi.fn(),
  refetch: vi.fn(),
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
    entries: ENTRIES,
    dataState: 'ready',
    refetch: mocks.refetch,
  }),
}));
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
});
