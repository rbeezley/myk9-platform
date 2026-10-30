/**
 * MYK9-1502: Class Options leads with Requirements and Set Max Time, groups the
 * rest, keeps every role gate, offers no printing, and Statistics opens a class
 * statistics dialog computed from the replicated entries.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@/test/utils/testUtils';

const replica = vi.hoisted(() => ({
  classes: new Map<string, Record<string, unknown>>(),
  entries: [] as Record<string, unknown>[],
  failEntries: false,
  /** When set, each entry read waits for a manual resolve (see `held`). */
  hold: false,
  held: [] as Array<() => void>,
  listeners: [] as Array<() => void>,
}));
vi.mock('@/services/replication', () => ({
  replicatedClassesTable: {
    getClassById: vi.fn(async (id: string) => replica.classes.get(id) ?? null),
    subscribe: vi.fn(() => () => {}),
  },
  replicatedEntriesTable: {
    getEntriesByClass: vi.fn(async () => {
      if (replica.failEntries) throw new Error('read failed');
      const snapshot = replica.entries;
      if (replica.hold) await new Promise<void>(resolve => replica.held.push(resolve));
      return snapshot;
    }),
    subscribe: vi.fn((listener: () => void) => {
      replica.listeners.push(listener);
      return () => {};
    }),
  },
}));

import { ClassOptionsDialog } from './ClassOptionsDialog';

const classData = { id: 'c1', element: 'Interior', level: 'Novice', class_name: 'Interior Novice' };

function renderDialog(props: Partial<React.ComponentProps<typeof ClassOptionsDialog>> = {}) {
  const handlers = {
    onRequirements: vi.fn(),
    onSetMaxTime: vi.fn(),
    onSettings: vi.fn(),
    onStatistics: vi.fn(),
    onStatus: vi.fn(),
  };
  const onClose = vi.fn();
  render(
    <ClassOptionsDialog isOpen onClose={onClose} classData={classData} {...handlers} {...props} />
  );
  return { ...handlers, onClose };
}

const tileNames = () =>
  within(screen.getByRole('dialog'))
    .getAllByRole('button')
    .map(button => button.querySelector('span > span')?.textContent)
    .filter(Boolean);

beforeEach(() => {
  replica.classes.clear();
  replica.entries = [];
  replica.failEntries = false;
  replica.hold = false;
  replica.held = [];
  replica.listeners = [];
});

describe('ClassOptionsDialog (MYK9-1502)', () => {
  it('leads with Requirements and Set Max Time, then Statistics and Status; no Settings or print', () => {
    renderDialog();
    expect(tileNames()).toEqual(['Requirements', 'Set Max Time', 'Statistics', 'Status']);
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
    expect(screen.queryByText(/Print/)).not.toBeInTheDocument();
    expect(screen.getByText('See the rules and time limits for this class')).toBeInTheDocument();
    expect(screen.getByText('View class performance data')).toBeInTheDocument();
    expect(screen.getByText('Update class status')).toBeInTheDocument();
  });

  it('fires the tile callbacks', () => {
    const { onRequirements, onSetMaxTime, onStatus } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /Requirements/ }));
    fireEvent.click(screen.getByRole('button', { name: /Set Max Time/ }));
    fireEvent.click(screen.getByRole('button', { name: /Status/ }));
    expect(onRequirements).toHaveBeenCalledTimes(1);
    expect(onSetMaxTime).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenCalledTimes(1);
  });

  it('shows the saved max time, or a highlighted Not set', async () => {
    replica.classes.set('c1', { id: 'c1', timeLimitSeconds: 180 });
    renderDialog();
    expect(await screen.findByText('Max time 3:00')).toBeInTheDocument();
  });

  it('says Not set when the class has no max time', async () => {
    replica.classes.set('c1', { id: 'c1' });
    renderDialog();
    expect(await screen.findByText('Not set')).toBeInTheDocument();
  });

  it.each([
    ['hideRequirements', ['Set Max Time', 'Statistics', 'Status']],
    ['hideMaxTime', ['Requirements', 'Statistics', 'Status']],
    ['hideStatistics', ['Requirements', 'Set Max Time', 'Status']],
    ['hideStatus', ['Requirements', 'Set Max Time', 'Statistics']],
  ])('%s drops only that tile', (flag, expected) => {
    renderDialog({ [flag]: true });
    expect(tileNames()).toEqual(expected);
  });

  it('renders just the primary tier, or just the compact tiles, with no holes', () => {
    renderDialog({ hideStatistics: true, hideStatus: true });
    expect(tileNames()).toEqual(['Requirements', 'Set Max Time']);
  });

  it('a lone compact tile spans the row', () => {
    renderDialog({ hideRequirements: true, hideMaxTime: true, hideStatus: true });
    expect(screen.getByRole('button', { name: /Statistics/ })).toHaveClass('col-span-full');
  });

  it('renders a bare shell when nothing is offered', () => {
    renderDialog({
      onRequirements: undefined,
      onSetMaxTime: undefined,
      onStatistics: undefined,
      onStatus: undefined,
    });
    expect(screen.getByText('Interior Novice')).toBeInTheDocument();
    expect(tileNames()).toEqual([]);
  });

  it('renders nothing when closed', () => {
    renderDialog({ isOpen: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Statistics opens the class statistics from known entries, offline', async () => {
    replica.entries = [
      { id: 'a', isScored: true, resultStatus: 'qualified', searchTimeSeconds: 60 },
      { id: 'b', isScored: true, resultStatus: 'qualified', searchTimeSeconds: 90 },
      { id: 'c', isScored: true, resultStatus: 'nq', searchTimeSeconds: 200 },
      { id: 'd', isScored: false, resultStatus: 'pending' },
      { id: 'e', entryStatus: 'withdrawn' },
    ];
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /Statistics/ }));
    expect(await screen.findByText('Fastest time')).toBeInTheDocument();
    const stat = (label: string) => screen.getByText(label).closest('div')!;
    await waitFor(() => expect(stat('Entries')).toHaveTextContent('4'));
    expect(stat('Scored')).toHaveTextContent('3 of 4');
    expect(stat('Qualified')).toHaveTextContent('67%');
    expect(stat('Fastest time')).toHaveTextContent('1:00.00');
    expect(stat('Average time')).toHaveTextContent('1:15.00');
  });

  it('Statistics with nothing scored says so instead of showing zeros as results', async () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /Statistics/ }));
    expect(await screen.findByText('Nothing scored yet')).toBeInTheDocument();
  });

  it('a failed entry read is an error with a retry, not an empty class', async () => {
    replica.failEntries = true;
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /Statistics/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't read/);
    expect(screen.queryByText('Nothing scored yet')).not.toBeInTheDocument();
    replica.failEntries = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Nothing scored yet')).toBeInTheDocument();
  });

  it('reopening after Statistics lands on the menu again', async () => {
    const props = { onClose: vi.fn(), classData, onRequirements: vi.fn(), onStatistics: vi.fn() };
    const { rerender } = render(<ClassOptionsDialog isOpen {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Statistics/ }));
    await screen.findByText('Fastest time');
    rerender(<ClassOptionsDialog isOpen={false} {...props} />);
    rerender(<ClassOptionsDialog isOpen {...props} />);
    expect(await screen.findByRole('button', { name: /Requirements/ })).toBeInTheDocument();
  });

  it('an older read that resolves late does not overwrite the newer statistics', async () => {
    replica.hold = true;
    replica.entries = [
      { id: 'a', isScored: true, resultStatus: 'qualified', searchTimeSeconds: 60 },
    ];
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /Statistics/ }));
    await waitFor(() => expect(replica.held).toHaveLength(1));
    // A score lands while the first read is still in flight.
    replica.entries = [
      { id: 'a', isScored: true, resultStatus: 'qualified', searchTimeSeconds: 60 },
      { id: 'b', isScored: true, resultStatus: 'qualified', searchTimeSeconds: 90 },
    ];
    replica.listeners.forEach(listener => listener());
    await waitFor(() => expect(replica.held).toHaveLength(2));
    replica.held[1]!(); // the newer read finishes first
    const stat = (label: string) => screen.getByText(label).closest('div')!;
    await waitFor(() => expect(stat('Entries')).toHaveTextContent('2'));
    replica.held[0]!(); // then the older one, stale
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(stat('Entries')).toHaveTextContent('2');
  });
});
