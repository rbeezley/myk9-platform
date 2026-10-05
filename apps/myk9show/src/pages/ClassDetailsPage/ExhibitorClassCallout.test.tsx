import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ExhibitorClassCallout } from './ExhibitorClassCallout';
import type { UseMyEntriesInClassResult } from './useMyEntriesInClass';

vi.mock('./useMyEntriesInClass', () => ({ useMyEntriesInClass: vi.fn() }));

import { useMyEntriesInClass } from './useMyEntriesInClass';

function mockHook(result: UseMyEntriesInClassResult) {
  vi.mocked(useMyEntriesInClass).mockReturnValue(result);
}

function makeEntry(overrides = {}) {
  return {
    entryId: 'e1',
    dogId: 'd1',
    dogName: 'Maggie',
    armband: '101',
    // Stored number deliberately high and gappy: it must never be rendered.
    runOrder: 31,
    queue: { kind: 'waiting-unknown' as const },
    hasResult: false,
    ...overrides,
  };
}

describe('ExhibitorClassCallout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when user has no entries', () => {
    mockHook({ myEntries: [], isAfterClass: false });
    const { container } = render(<ExhibitorClassCallout classId="c1" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders "Your dogs in this class" callout before class', () => {
    mockHook({ myEntries: [makeEntry()], isAfterClass: false });
    render(<ExhibitorClassCallout classId="c1" />);
    expect(screen.getByRole('region', { name: /your dogs in this class/i })).toBeInTheDocument();
    expect(screen.getByText('Maggie')).toBeInTheDocument();
  });

  it('shows dog count in header for multiple dogs', () => {
    mockHook({
      myEntries: [makeEntry(), makeEntry({ entryId: 'e2', dogName: 'Daisy' })],
      isAfterClass: false,
    });
    render(<ExhibitorClassCallout classId="c1" />);
    expect(screen.getByText(/2 dogs in this class/i)).toBeInTheDocument();
  });

  it('without a server count, says "Waiting", never "up next" or a wait estimate', () => {
    mockHook({
      myEntries: [makeEntry({ runOrder: 31, queue: { kind: 'waiting-unknown' } })],
      isAfterClass: false,
    });
    render(<ExhibitorClassCallout classId="c1" />);
    expect(screen.getByText('Waiting')).toBeInTheDocument();
    expect(screen.queryByText(/31/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\bup\b/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ahead|min/)).not.toBeInTheDocument();
  });

  it('shows nothing about order when the secretary has not set one', () => {
    mockHook({ myEntries: [makeEntry({ runOrder: 0, queue: null })], isAfterClass: false });
    render(<ExhibitorClassCallout classId="c1" />);
    expect(screen.queryByText('Waiting')).not.toBeInTheDocument();
    expect(screen.queryByText(/\bup\b/i)).not.toBeInTheDocument();
  });

  it("shows the dog's state when it is in the ring or pulled", () => {
    mockHook({
      myEntries: [
        makeEntry({ entryId: 'e1', queue: { kind: 'in-ring' } }),
        makeEntry({ entryId: 'e2', dogName: 'Daisy', queue: { kind: 'pulled' } }),
      ],
      isAfterClass: false,
    });
    render(<ExhibitorClassCallout classId="c1" />);
    expect(screen.getByText('In ring')).toBeInTheDocument();
    expect(screen.getByText('Pulled')).toBeInTheDocument();
  });

  it('labels a withdrawn dog Withdrawn, never Pulled', () => {
    mockHook({ myEntries: [makeEntry({ queue: { kind: 'withdrawn' } })], isAfterClass: false });
    render(<ExhibitorClassCallout classId="c1" />);
    expect(screen.getByText('Withdrawn')).toBeInTheDocument();
    expect(screen.queryByText('Pulled')).not.toBeInTheDocument();
  });

  it('renders "Your results" region after class', () => {
    mockHook({
      myEntries: [makeEntry({ hasResult: true, result: { qualified: true, time: '00:38.2' } })],
      isAfterClass: true,
    });
    render(<ExhibitorClassCallout classId="c1" />);
    expect(screen.getByRole('region', { name: /your results/i })).toBeInTheDocument();
  });

  it('shows QUALIFIED chip and search time for a passing result', () => {
    mockHook({
      myEntries: [makeEntry({ hasResult: true, result: { qualified: true, time: '00:38.2' } })],
      isAfterClass: true,
    });
    render(<ExhibitorClassCallout classId="c1" />);
    expect(screen.getByText('QUALIFIED')).toBeInTheDocument();
    expect(screen.getByText('00:38.2')).toBeInTheDocument();
  });

  it('shows "Not qualified" chip for a failing result', () => {
    mockHook({
      myEntries: [makeEntry({ hasResult: true, result: { qualified: false } })],
      isAfterClass: true,
    });
    render(<ExhibitorClassCallout classId="c1" />);
    expect(screen.getByText('Not qualified')).toBeInTheDocument();
  });

  it('shows placement pill for a placed qualifying result', () => {
    mockHook({
      myEntries: [
        makeEntry({ hasResult: true, result: { qualified: true, time: '00:31.5', placement: 1 } }),
      ],
      isAfterClass: true,
    });
    render(<ExhibitorClassCallout classId="c1" />);
    expect(screen.getByText('1st')).toBeInTheDocument();
  });

  it('does not show placement section when not qualified', () => {
    mockHook({
      myEntries: [makeEntry({ hasResult: true, result: { qualified: false, placement: 1 } })],
      isAfterClass: true,
    });
    render(<ExhibitorClassCallout classId="c1" />);
    expect(screen.queryByText('1st')).not.toBeInTheDocument();
  });
});
