import { render, screen } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ActivityTab from '../ActivityTab';

// UX walk remediation 2.B: the dog-profile upcoming-entry badge must show the
// composed status line in the viewer's voice — never the raw enum ("submitted").

const useEntriesByDogQueryMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useEntriesByDogQuery: useEntriesByDogQueryMock,
}));

const FUTURE = '2099-08-01';

const upcomingRow = {
  id: 'entry-1',
  entry_status: 'submitted',
  show: { id: 'show-1', name: 'Heartland Scent Work', start_date: FUTURE },
  class: { id: 'class-1', name: 'Container Novice A' },
};

describe('ActivityTab upcoming-entry status line (2.B)', () => {
  beforeEach(() => {
    useEntriesByDogQueryMock.mockReturnValue({ data: [upcomingRow], isLoading: false });
  });

  it('speaks the exhibitor voice and never the raw enum', () => {
    render(<ActivityTab dogId="dog-1" dogName="Buddy" role="exhibitor" />);
    expect(screen.getByText('Submitted — awaiting review')).toBeVisible();
    expect(screen.queryByText('submitted')).toBeNull();
  });

  it('speaks the secretary voice for the same entry', () => {
    render(<ActivityTab dogId="dog-1" dogName="Buddy" role="secretary" />);
    expect(screen.getByText('Needs review')).toBeVisible();
    expect(screen.queryByText('submitted')).toBeNull();
  });
});
