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
    runOrder: 2,
    position: 2,
    dogsAhead: 1,
    hasResult: false,
    ...overrides,
  };
}

describe('ExhibitorClassCallout', () => {
  beforeEach(() => vi.clearAllMocks());

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

  it('shows position badge with run order number', () => {
    mockHook({ myEntries: [makeEntry({ position: 3 })], isAfterClass: false });
    render(<ExhibitorClassCallout classId="c1" />);
    expect(screen.getByText('#3')).toBeInTheDocument();
  });

  it('shows dogs-ahead info when dogsAhead > 0', () => {
    mockHook({ myEntries: [makeEntry({ dogsAhead: 2 })], isAfterClass: false });
    render(<ExhibitorClassCallout classId="c1" />);
    expect(screen.getByText('2 dogs ahead')).toBeInTheDocument();
    expect(screen.getByText(/~6 min/)).toBeInTheDocument();
  });

  it('shows "You\'re up next!" chip when dogsAhead is 0 and runOrder is set', () => {
    mockHook({ myEntries: [makeEntry({ dogsAhead: 0, runOrder: 1, position: 1 })], isAfterClass: false });
    render(<ExhibitorClassCallout classId="c1" />);
    expect(screen.getByText(/you.re up next/i)).toBeInTheDocument();
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
      myEntries: [makeEntry({ hasResult: true, result: { qualified: true, time: '00:31.5', placement: 1 } })],
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
