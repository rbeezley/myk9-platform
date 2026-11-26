/**
 * MYK9-2382 / MYK9-2394: saving qualifications replaces the person's whole list, so the card
 * offers no way to edit until a fresh read succeeds. It shows exactly one of loading, could not
 * load (with retry) or the loaded list, and "No Judge Qualifications" only after a confirmed read.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import JudgeQualificationsCard from './JudgeQualificationsCard';

const query = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  data: [] as unknown[],
  refetch: vi.fn(),
}));
vi.mock('@/hooks/queries/useJudgeDatabase', () => ({
  useJudgeQualifications: () => ({ data: query.data, refetch: query.refetch, ...query.state }),
}));

const aqual = {
  id: 'q1',
  organization: 'AKC',
  disciplines: ['Scent Work'],
  is_active: true,
  judge_number: '123',
  date_obtained: '2020-01-02',
};

const renderCard = () =>
  render(
    <JudgeQualificationsCard
      personId="p1"
      canManageQualifications
      onManageQualifications={vi.fn()}
    />
  );

describe('JudgeQualificationsCard: editing waits for the list', () => {
  beforeEach(() => {
    query.refetch.mockClear();
    query.data = [];
  });

  it('shows a retry and no add or manage button when the read failed', async () => {
    query.state = { hasList: false, isError: true, fetchStatus: 'idle' };
    const { user } = renderCard();
    expect(screen.getByRole('alert')).toHaveTextContent(/Couldn't load/);
    expect(screen.queryByText('No Judge Qualifications')).toBeNull();
    expect(screen.queryByRole('button', { name: /Add Qualifications/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Manage Qualifications/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(query.refetch).toHaveBeenCalled();
  });

  it('does not say "no qualifications" when the read is paused offline with nothing cached', () => {
    query.state = { hasList: false, isError: false, fetchStatus: 'paused' };
    renderCard();
    expect(screen.queryByText('No Judge Qualifications')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(/Couldn't load/);
    expect(screen.queryByRole('button', { name: /Manage Qualifications/ })).toBeNull();
  });

  it('offers no manage button while the list is loading', () => {
    query.state = { hasList: false, isError: false, fetchStatus: 'fetching' };
    renderCard();
    expect(screen.queryByText('No Judge Qualifications')).toBeNull();
    expect(screen.queryByRole('button', { name: /Manage Qualifications/ })).toBeNull();
  });

  it('keeps loaded credentials visible with a note, and editing off, when a refresh failed', async () => {
    query.data = [aqual];
    query.state = { hasList: true, isError: true, fetchStatus: 'idle' };
    const { user } = renderCard();
    expect(screen.getByText('Scent Work')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/Could not refresh/);
    expect(screen.queryByRole('button', { name: /Manage Qualifications/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(query.refetch).toHaveBeenCalled();
  });

  it('offers Add Qualifications once an empty list has loaded', () => {
    query.state = { hasList: true, isError: false, fetchStatus: 'idle' };
    renderCard();
    expect(screen.getByText('No Judge Qualifications')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add Qualifications/ })).toBeEnabled();
  });
});
