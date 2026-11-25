/**
 * MYK9-2382: saving qualifications replaces the person's whole list, so the card offers no way
 * to edit until that list has loaded. A failed read shows a retry, never "no qualifications".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import JudgeQualificationsCard from './JudgeQualificationsCard';

const query = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  refetch: vi.fn(),
}));
vi.mock('@/hooks/queries/useJudgeDatabase', () => ({
  useJudgeQualifications: () => ({ data: [], refetch: query.refetch, ...query.state }),
}));

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
  });

  it('shows a retry and no add or manage button when the read failed', async () => {
    query.state = { isError: true, isSuccess: false, isLoading: false };
    const { user } = renderCard();
    expect(screen.getByRole('alert')).toHaveTextContent(/Couldn't load/);
    expect(screen.queryByRole('button', { name: /Add Qualifications/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Manage Qualifications/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(query.refetch).toHaveBeenCalled();
  });

  it('offers no manage button while the list is loading', () => {
    query.state = { isError: false, isSuccess: false, isLoading: true };
    renderCard();
    expect(screen.queryByRole('button', { name: /Manage Qualifications/ })).toBeNull();
  });

  it('offers Add Qualifications once an empty list has loaded', () => {
    query.state = { isError: false, isSuccess: true, isLoading: false };
    renderCard();
    expect(screen.getByRole('button', { name: /Add Qualifications/ })).toBeEnabled();
  });
});
