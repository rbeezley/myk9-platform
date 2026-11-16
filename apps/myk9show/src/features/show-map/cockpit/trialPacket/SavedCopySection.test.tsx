import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen, waitFor, within } from '@/test/utils/testUtils';
import { EmergencyPacketDeliveryError } from '@/features/emergency-trial-packet/deliverEmergencyTrialPacket';
import type { DeliveredPacketRow } from '@/pages/secretary/ReportsPage/deliveredPacketRows';

const DAY = '2026-12-08';
const OTHER_DAY = '2026-12-07';

const mocks = vi.hoisted(() => ({
  packetData: null as unknown,
  copies: [] as unknown[],
  rows: [] as unknown[],
  isError: false,
  build: vi.fn(),
  deliver: vi.fn(),
  record: vi.fn(),
  reportData: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useFastShowDetails', () => ({ useFastShowDetails: () => ({ show: {} }) }));
vi.mock('@/hooks/queries/useReportData', () => ({
  useReportData: (...args: unknown[]) => {
    mocks.reportData(...args);
    return {
      show: {},
      trials: [],
      classes: [],
      entries: [],
      isReady: true,
      registrationsReadComplete: true,
    };
  },
}));
vi.mock('@/features/emergency-trial-packet/completePacketRows', () => ({
  completePacketRows: () => ({
    trials: [
      { id: 't-sat', timezone: 'America/Chicago' },
      { id: 't-sun', timezone: null },
    ],
    classes: [],
    entries: [],
  }),
}));
vi.mock('@/pages/secretary/ReportsPage/reportDataMapping', () => ({
  buildEmergencyPacketData: () => mocks.packetData,
}));
vi.mock('@/pages/secretary/ReportsPage/useDeliveredPackets', async importOriginal => ({
  ...(await importOriginal<typeof import('@/pages/secretary/ReportsPage/useDeliveredPackets')>()),
  useDeliveredPackets: () => ({ rows: mocks.rows, copies: mocks.copies, isError: mocks.isError }),
}));
vi.mock('./buildSavedCopy', () => ({ buildSavedCopy: mocks.build }));
vi.mock('@/features/emergency-trial-packet/deliverEmergencyTrialPacket', async importOriginal => ({
  ...(await importOriginal<
    typeof import('@/features/emergency-trial-packet/deliverEmergencyTrialPacket')
  >()),
  deliverEmergencyTrialPacket: mocks.deliver,
}));
vi.mock('../paperworkPrintActions', () => ({ recordPaperworkPrinted: mocks.record }));

import { SavedCopySection } from './SavedCopySection';

function packetData() {
  return {
    show: { id: 'show-1', name: 'Winter Trial', startDate: OTHER_DAY, endDate: DAY },
    trials: [
      { id: 't-sun', date: DAY, name: 'Trial 2', trialNumber: '2', registryId: 'AKC' },
      { id: 't-sat', date: OTHER_DAY, name: 'Trial 1', trialNumber: '1', registryId: 'AKC' },
    ],
    classes: [
      { id: 'c-sun', trialId: 't-sun', judgeName: 'TBD' },
      { id: 'c-sat', trialId: 't-sat', judgeName: 'Pat Donovan' },
    ],
    entries: [],
  };
}

function latestRow(overrides: Partial<DeliveredPacketRow>): DeliveredPacketRow {
  return {
    trialDate: DAY,
    snapshotId: 'snap-new',
    generatedAt: '2026-12-07T23:00:00.000Z',
    pageCount: 12,
    printState: 'unconfirmed',
    descriptor: { reportId: 'emergency-trial-packet' } as never,
    ...overrides,
  };
}

const COPIES = [
  {
    snapshotId: 'snap-new',
    trialDate: DAY,
    generatedAt: '2026-12-07T23:00:00.000Z',
    createdAt: '2026-12-07T23:00:01.000Z',
    pageCount: 12,
    recipientCount: 3,
  },
  {
    snapshotId: 'snap-old',
    trialDate: DAY,
    generatedAt: '2026-12-06T23:00:00.000Z',
    createdAt: '2026-12-06T23:00:01.000Z',
    pageCount: 10,
    recipientCount: 2,
  },
  {
    snapshotId: 'snap-other-day',
    trialDate: OTHER_DAY,
    generatedAt: '2026-12-06T23:00:00.000Z',
    createdAt: '2026-12-06T23:00:01.000Z',
    pageCount: 99,
    recipientCount: 9,
  },
];

/** Renders the section and opens it, as the secretary does. */
async function openSection(trialDate = DAY) {
  const user = userEvent.setup();
  render(<SavedCopySection showId="show-1" trialDate={trialDate} />);
  await user.click(screen.getByRole('button', { name: 'Show saved copies' }));
  return user;
}

describe('SavedCopySection', () => {
  it('reads the show data only once the secretary opens it', async () => {
    const user = userEvent.setup();
    render(<SavedCopySection showId="show-1" trialDate={DAY} />);
    expect(mocks.reportData).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Save and email a copy' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show saved copies' }));

    expect(mocks.reportData).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save and email a copy' })).toBeInTheDocument();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.packetData = packetData();
    mocks.copies = [];
    mocks.rows = [];
    mocks.isError = false;
    mocks.build.mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]), pageCount: 7 });
    mocks.deliver.mockResolvedValue({ recipientCount: 4, snapshotId: 's', pageCount: 7 });
    mocks.record.mockResolvedValue(undefined);
  });

  it("lists only this day's copies with pages and officials, and the printed state of the newest", async () => {
    mocks.copies = COPIES;
    mocks.rows = [latestRow({ printState: 'printed' })];
    await openSection();

    const list = screen.getByRole('list', { name: 'Copies already sent' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('12 pages');
    expect(items[0]).toHaveTextContent('received by 3 officials');
    expect(items[0]).toHaveTextContent('Paper matching this copy is marked printed.');
    expect(items[1]).toHaveTextContent('10 pages');
    expect(items[1]).toHaveTextContent('received by 2 officials');
    expect(items[1]).toHaveTextContent('A newer copy replaced this one.');
    expect(screen.queryByText(/99 pages/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark printed' })).not.toBeInTheDocument();
  });

  it('says so when no copy has been sent for the day', async () => {
    await openSection();
    expect(screen.getByText('No copy has been sent for this day yet.')).toBeInTheDocument();
  });

  it('marks the newest copy printed through the confirmation dialog', async () => {
    mocks.copies = COPIES;
    mocks.rows = [latestRow({})];
    const user = await openSection();

    await user.click(screen.getByRole('button', { name: 'Mark printed' }));
    expect(mocks.record).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Mark printed' }));

    await waitFor(() =>
      expect(mocks.record).toHaveBeenCalledWith(
        expect.objectContaining({ descriptor: { reportId: 'emergency-trial-packet' } })
      )
    );
  });

  it("builds the chosen day from that day only and delivers with that day's date", async () => {
    const user = await openSection();
    expect(mocks.build).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Save and email a copy' }));

    await waitFor(() => expect(mocks.deliver).toHaveBeenCalledTimes(1));
    const built = mocks.build.mock.calls[0]![0] as {
      trials: Array<{ id: string; date: string; timezone: string }>;
      classes: Array<{ id: string; judgeName: string }>;
    };
    expect(built.trials).toEqual([
      expect.objectContaining({ id: 't-sun', date: DAY, timezone: 'America/New_York' }),
    ]);
    expect(built.classes).toEqual([expect.objectContaining({ id: 'c-sun', judgeName: '' })]);
    expect(mocks.deliver).toHaveBeenCalledWith({
      showId: 'show-1',
      snapshotId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      generatedAt: expect.any(String),
      bytes: new Uint8Array([1, 2, 3]),
      pageCount: 7,
      trialDate: DAY,
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'copy stored and emailed to 4 show officials.'
    );
  });

  it('says the copy was stored but not emailed', async () => {
    mocks.deliver.mockRejectedValue(new EmergencyPacketDeliveryError('show-1/x.pdf'));
    const user = await openSection();
    await user.click(screen.getByRole('button', { name: 'Save and email a copy' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The copy was stored, but the email could not be sent. Try again.'
    );
  });

  it('says the copy could not be saved when the build or upload fails', async () => {
    mocks.build.mockRejectedValue(new Error('boom'));
    const user = await openSection();
    await user.click(screen.getByRole('button', { name: 'Save and email a copy' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The copy could not be saved.');
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it('sends nothing for a day the show has no trial on', async () => {
    const user = await openSection('2027-01-01');
    await user.click(screen.getByRole('button', { name: 'Save and email a copy' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The copy could not be saved.');
    expect(mocks.build).not.toHaveBeenCalled();
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it('warns when the list of sent copies could not be read', async () => {
    mocks.isError = true;
    await openSection();
    expect(screen.getByRole('alert')).toHaveTextContent('could not check which copies');
  });

  it('keeps the button off until the show data is ready', async () => {
    mocks.packetData = null;
    await openSection();
    expect(screen.getByRole('button', { name: 'Save and email a copy' })).toBeDisabled();
  });
});
