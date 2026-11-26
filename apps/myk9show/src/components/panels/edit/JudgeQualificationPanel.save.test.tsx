/**
 * MYK9-2382 / MYK9-2394: Save replaces the person's whole qualification list, so the form only
 * appears once the latest read succeeded. A failed, pending or offline read shows its state with
 * no form to fill in, and never says "no qualifications". Drives the real query hook.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import { render, screen, createTestQueryClient } from '@/test/utils/testUtils';
import { judgeQueryKeys } from '@/hooks/queries/useJudgeDatabase';
import { UserRole } from '@/types/auth-types';
import type { JudgeQualification } from '@/types/judge-management';
import { JudgeQualificationPanel } from './JudgeQualificationPanel';

const svc = vi.hoisted(() => ({ read: vi.fn(), replace: vi.fn() }));
vi.mock('@/services/database/judges', async importOriginal => ({
  ...(await importOriginal<object>()),
  getJudgeQualificationsByJudgeId: svc.read,
  replaceJudgeQualifications: svc.replace,
}));
vi.mock('@/hooks/useRBAC', () => ({ useRBAC: () => ({ hasPermission: () => false }) }));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'secretary-1' },
    hasRole: (role: UserRole) => role === UserRole.SECRETARY,
  }),
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

const renderPanel = (queryClient = createTestQueryClient()) =>
  render(<JudgeQualificationPanel open onClose={vi.fn()} userId="p1" userName="Ada Lovelace" />, {
    queryClient,
  });

const noForm = () => {
  expect(screen.queryByText('No Qualifications')).toBeNull();
  expect(screen.queryByRole('button', { name: /Add First Qualification/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /Add Another Qualification/ })).toBeNull();
  expect(screen.getByRole('button', { name: /Save Changes/ })).toBeDisabled();
};

describe('JudgeQualificationPanel: the form waits for the list', () => {
  beforeEach(() => {
    svc.read.mockReset();
    svc.replace.mockReset();
  });
  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it('shows a retry in place of the form when the list failed to load', async () => {
    svc.read.mockRejectedValue(new Error('network'));
    const { user } = renderPanel();
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't load/);
    noForm();
    svc.read.mockResolvedValue([]);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: /Add First Qualification/ })).toBeEnabled();
  });

  it('shows no form while offline with nothing cached', () => {
    onlineManager.setOnline(false);
    renderPanel();
    expect(screen.getByRole('status')).toHaveTextContent(/offline/i);
    noForm();
  });

  it('turns the form off when a refresh fails after a good read', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(judgeQueryKeys.qualificationsByJudge('p1', undefined), [akc]);
    renderPanel(queryClient);
    expect(screen.getByDisplayValue('12345')).toBeInTheDocument();

    svc.read.mockRejectedValue(new Error('network'));
    await act(() => queryClient.refetchQueries().catch(() => undefined));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't refresh/);
    expect(screen.queryByDisplayValue('12345')).toBeNull();
    noForm();
    expect(svc.replace).not.toHaveBeenCalled();
  });

  it('lets a secretary without show:manage save once an empty list has loaded', async () => {
    svc.read.mockResolvedValue([]);
    const { user } = renderPanel();
    await user.click(await screen.findByRole('button', { name: /Add First Qualification/ }));
    expect(screen.getByRole('button', { name: /Save Changes/ })).toBeEnabled();
  });
});
