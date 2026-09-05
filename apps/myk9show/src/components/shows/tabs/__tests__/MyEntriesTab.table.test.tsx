import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { MyEntriesTab } from '../MyEntriesTab';
import { fromAny } from '@total-typescript/shoehorn';

vi.mock('@/hooks/useShowEntriesForUser', () => ({ useShowEntriesForUser: vi.fn() }));
vi.mock('@/store/entryStore', () => ({ useEntryStore: vi.fn() }));
vi.mock('@/components/shows/tabs/WhereToBe', () => ({
  WhereToBe: () => <div data-testid="where-to-be" />,
}));
vi.mock('@/components/shows/tabs/DogEntriesSection', () => ({
  DogEntriesSection: ({ group }: { group: { dogName: string } }) => (
    <div data-testid="dog-section">{group.dogName}</div>
  ),
}));

import { useShowEntriesForUser } from '@/hooks/useShowEntriesForUser';
import { useEntryStore } from '@/store/entryStore';

function setupEntryStore() {
  vi.mocked(useEntryStore).mockImplementation(
    fromAny((sel: (s: unknown) => unknown) => sel({ loadEntries: vi.fn() }))
  );
}

describe('MyEntriesTab copy variants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupEntryStore();
  });

  it('uses singular "class" and "dog" for counts of 1', () => {
    vi.mocked(useShowEntriesForUser).mockReturnValue({
      dogGroups: [{ dogId: 'd1', dogName: 'Maggie', entries: [] }],
      allEntries: [{}] as never,
      scheduleEntries: [{}] as never,
      totalClasses: 1,
      scheduleDogCount: 1,
      isLoading: false,
      isError: false,
    });
    render(<MyEntriesTab showId="s1" />);
    expect(screen.getByText(/1 scheduled run across 1 dog/)).toBeInTheDocument();
  });

  it('uses plural for counts > 1', () => {
    vi.mocked(useShowEntriesForUser).mockReturnValue({
      dogGroups: [
        { dogId: 'd1', dogName: 'Maggie', entries: [] },
        { dogId: 'd2', dogName: 'Daisy', entries: [] },
      ],
      allEntries: [{}, {}] as never,
      scheduleEntries: [{}, {}] as never,
      totalClasses: 4,
      scheduleDogCount: 2,
      isLoading: false,
      isError: false,
    });
    render(<MyEntriesTab showId="s1" />);
    expect(screen.getByText(/4 scheduled runs across 2 dogs/)).toBeInTheDocument();
  });

  it('passes the route canonical entry source through to the tab hook', () => {
    vi.mocked(useShowEntriesForUser).mockReturnValue({
      dogGroups: [],
      allEntries: [],
      scheduleEntries: [],
      totalClasses: 0,
      scheduleDogCount: 0,
      isLoading: true,
      isError: false,
    });
    const canonicalEntries = [
      { id: 'entry-1', show_id: 'show-1', dog_id: 'dog-1', class_id: 'class-1' },
    ];

    render(
      <MyEntriesTab
        showId="show-1"
        canonicalEntries={canonicalEntries}
        entryDataState="loading"
      />
    );

    expect(useShowEntriesForUser).toHaveBeenCalledWith('show-1', {
      rows: canonicalEntries,
      state: 'loading',
    });
  });
});
