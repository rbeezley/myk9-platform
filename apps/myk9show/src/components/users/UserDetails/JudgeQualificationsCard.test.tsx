/**
 * MYK9-2382 / MYK9-2394: saving qualifications replaces the person's whole list, so the card
 * offers no way to edit until the latest read succeeded, and it never says "no qualifications"
 * unless a read confirmed the list is empty. Drives the real query hook; only the read is mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import { render, screen, createTestQueryClient } from '@/test/utils/testUtils';
import { judgeQueryKeys } from '@/hooks/queries/useJudgeDatabase';
import type { JudgeQualification } from '@/types/judge-management';
import JudgeQualificationsCard from './JudgeQualificationsCard';

const read = vi.hoisted(() => vi.fn());
vi.mock('@/services/database/judges', async importOriginal => ({
  ...(await importOriginal<object>()),
  getJudgeQualificationsByJudgeId: read,
}));

const akc: JudgeQualification = {
  id: 'q1',
  person_id: 'p1',
  organization: 'AKC',
  qualification_level: '',
  disciplines: ['Scent Work'],
  judge_number: '12345',
  date_obtained: '2024-01-01',
  is_active: true,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const renderCard = (queryClient = createTestQueryClient()) => ({
  queryClient,
  ...render(
    <JudgeQualificationsCard
      personId="p1"
      canManageQualifications
      onManageQualifications={vi.fn()}
    />,
    { queryClient }
  ),
});

const noEditing = () => {
  expect(screen.queryByRole('button', { name: /Add Qualifications/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /Manage Qualifications/ })).toBeNull();
};

describe('JudgeQualificationsCard: one clear list state', () => {
  beforeEach(() => {
    read.mockReset();
  });
  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it('shows a retry and no add or manage button when the read failed', async () => {
    read.mockRejectedValue(new Error('network'));
    const { user } = renderCard();
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't load/);
    expect(screen.queryByText('No Judge Qualifications')).toBeNull();
    noEditing();
    read.mockResolvedValue([]);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No Judge Qualifications')).toBeInTheDocument();
  });

  it('offers no manage button while the list is loading', () => {
    read.mockReturnValue(new Promise(() => {}));
    renderCard();
    expect(screen.getByRole('status', { name: 'Loading judge qualifications' })).toBeVisible();
    expect(screen.queryByText('No Judge Qualifications')).toBeNull();
    noEditing();
  });

  it('never says "no qualifications" offline with nothing cached', () => {
    onlineManager.setOnline(false);
    renderCard();
    expect(screen.getByRole('status')).toHaveTextContent(/offline/i);
    expect(screen.queryByText('No Judge Qualifications')).toBeNull();
    expect(read).not.toHaveBeenCalled();
    noEditing();
  });

  it('keeps cached credentials readable when a refresh fails, with editing off', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(judgeQueryKeys.qualificationsByJudge('p1', undefined), [akc]);
    renderCard(queryClient);
    expect(screen.getByRole('button', { name: /Manage Qualifications/ })).toBeEnabled();

    read.mockRejectedValue(new Error('network'));
    await act(() => queryClient.refetchQueries().catch(() => undefined));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't refresh/);
    expect(screen.getByText('12345')).toBeVisible();
    noEditing();
  });

  it('offers Add Qualifications once an empty list has loaded', async () => {
    read.mockResolvedValue([]);
    renderCard();
    expect(await screen.findByText('No Judge Qualifications')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add Qualifications/ })).toBeEnabled();
  });
});
