import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { MyEntriesTab } from '@/components/shows/tabs/MyEntriesTab';

vi.mock('@/hooks/useShowEntriesForUser', () => ({ useShowEntriesForUser: vi.fn() }));
vi.mock('@/store/entryStore', () => ({ useEntryStore: vi.fn() }));
vi.mock('@/components/shows/tabs/WhereToBe', () => ({
  WhereToBe: ({ entries }: { entries: unknown[] }) => (
    <div data-testid="where-to-be">{entries.length} entries</div>
  ),
}));
vi.mock('@/components/shows/tabs/DogEntriesSection', () => ({
  DogEntriesSection: ({ group }: { group: { dogName: string } }) => (
    <div data-testid="dog-entries-section">{group.dogName}</div>
  ),
}));
vi.mock('@/components/common/LoadingSkeleton', () => ({
  LoadingSkeleton: () => <div data-testid="loading-skeleton" />,
}));
vi.mock('@/components/common/EmptyState', () => ({
  EmptyState: ({ title }: { title: string }) => <div data-testid="empty-state">{title}</div>,
}));

import { useShowEntriesForUser } from '@/hooks/useShowEntriesForUser';
import { useEntryStore } from '@/store/entryStore';

function setupEntryStore() {
  vi.mocked(useEntryStore).mockImplementation(
    (sel: (s: unknown) => unknown) => sel({ loadEntries: vi.fn() })
  );
}

function makeGroup(dogName: string) {
  return { dogId: dogName, dogName, entries: [] };
}

describe('MyEntriesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupEntryStore();
  });

  it('shows loading skeleton while loading', () => {
    vi.mocked(useShowEntriesForUser).mockReturnValue({
      dogGroups: [], allEntries: [], totalClasses: 0, isLoading: true, isError: false,
    });
    render(<MyEntriesTab showId="s1" />);
    expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
  });

  it('shows error state with retry button', () => {
    vi.mocked(useShowEntriesForUser).mockReturnValue({
      dogGroups: [], allEntries: [], totalClasses: 0, isLoading: false, isError: true,
    });
    render(<MyEntriesTab showId="s1" />);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('shows empty state when no entries', () => {
    vi.mocked(useShowEntriesForUser).mockReturnValue({
      dogGroups: [], allEntries: [], totalClasses: 0, isLoading: false, isError: false,
    });
    render(<MyEntriesTab showId="s1" />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  it('renders WhereToBe and one DogEntriesSection per dog', () => {
    vi.mocked(useShowEntriesForUser).mockReturnValue({
      dogGroups: [makeGroup('Maggie'), makeGroup('Daisy')],
      allEntries: [{}] as never,
      totalClasses: 3,
      isLoading: false,
      isError: false,
    });
    render(<MyEntriesTab showId="s1" />);
    expect(screen.getByTestId('where-to-be')).toBeInTheDocument();
    expect(screen.getByText('Maggie')).toBeInTheDocument();
    expect(screen.getByText('Daisy')).toBeInTheDocument();
  });

  it('shows summary count line', () => {
    vi.mocked(useShowEntriesForUser).mockReturnValue({
      dogGroups: [makeGroup('Maggie'), makeGroup('Daisy')],
      allEntries: [{}] as never,
      totalClasses: 3,
      isLoading: false,
      isError: false,
    });
    render(<MyEntriesTab showId="s1" />);
    expect(screen.getByText(/3 classes across 2 dogs/i)).toBeInTheDocument();
  });
});
