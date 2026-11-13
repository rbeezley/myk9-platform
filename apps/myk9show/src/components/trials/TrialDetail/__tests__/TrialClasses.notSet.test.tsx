import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { TrialClassesTable } from '../TrialClassesTable';
import { TrialClassesCards } from '../TrialClassesCards';
import type { TrialClass } from '../../types/trial.types';

/**
 * Owner decision 6 (MYK9-930): a field the secretary should fill (judge, start
 * time) reads "Not set", never "TBD".
 */
vi.mock('@myk9/ui', async importOriginal => ({
  ...(await importOriginal<typeof import('@myk9/ui')>()),
  ClassCard: ({ judgeName }: { judgeName?: string }) => (
    <div data-testid="class-card">{judgeName ? `Judge: ${judgeName}` : 'no judge line'}</div>
  ),
}));
vi.mock('@/hooks/useClassEntriesPreview', () => ({ useClassEntriesPreview: () => new Map() }));
vi.mock('@/store/favoriteClassesStore', () => ({
  useFavoriteClassesStore: () => ({
    loadFavorites: vi.fn(),
    toggleFavorite: vi.fn(),
    isFavorite: () => false,
    justToggled: null,
  }),
}));

const blank = {
  id: 'c1',
  element: 'Container',
  level: 'Novice',
  section: 'A',
  judgeId: '',
  startTime: '',
  status: 'scheduled',
  entries: 0,
} as unknown as TrialClass;

const filled = {
  ...blank,
  id: 'c2',
  judgeName: 'Jane Smith',
  startTime: '2026-05-01T09:00:00',
} as unknown as TrialClass;

describe('trial class table Not set (MYK9-930)', () => {
  // A visitor opens on cards (decision 8); these read the table, so choose it.
  beforeEach(() => {
    localStorage.setItem('view-pref-trial-classes', 'table');
  });

  it('reads To be announced for the judge and Not set for the start time, both muted', () => {
    render(<TrialClassesTable showId="s1" classes={[blank]} />);

    const notSet = screen.getAllByText('Not set');
    expect(notSet).toHaveLength(1);
    for (const el of notSet) expect(el).toHaveClass('text-muted-foreground');
    expect(screen.getByText('To be announced')).toHaveClass('text-muted-foreground');
    expect(screen.queryByText('TBD')).not.toBeInTheDocument();
  });

  it('positive control: a filled class shows its judge and no Not set', () => {
    render(<TrialClassesTable showId="s1" classes={[filled]} />);

    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.queryByText('Not set')).not.toBeInTheDocument();
    expect(screen.queryByText('To be announced')).not.toBeInTheDocument();
  });
});

describe('trial class cards Not set (MYK9-930)', () => {
  it('says To be announced, not TBD, for a class with no judge', () => {
    render(<TrialClassesCards classes={[blank]} showId="s1" trialId="t1" />);

    expect(screen.getByTestId('class-card')).toHaveTextContent(/^Judge: To be announced$/);
    expect(screen.queryByText(/TBD/)).not.toBeInTheDocument();
  });

  it('says To be announced for a stored TBD judge, in the cards and the table', () => {
    const stored = { ...blank, judgeName: 'TBD' } as unknown as TrialClass;
    const { unmount } = render(<TrialClassesCards classes={[stored]} showId="s1" trialId="t1" />);
    expect(screen.getByTestId('class-card')).toHaveTextContent(/^Judge: To be announced$/);
    unmount();

    localStorage.setItem('view-pref-trial-classes', 'table');
    render(<TrialClassesTable showId="s1" classes={[stored]} />);
    expect(screen.getByText('To be announced')).toBeInTheDocument();
    expect(screen.queryByText('TBD')).not.toBeInTheDocument();
    expect(screen.queryByText(/Judge to be announced/)).not.toBeInTheDocument();
  });
});
