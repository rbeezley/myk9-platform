/**
 * MYK9-2382 / MYK9-2394: Save replaces the person's whole qualification list, so the form and Save
 * must never be available on a list that did not load. A failed, paused or pending read shows
 * loading or a retry instead of the form.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import { JudgeQualificationPanel } from './JudgeQualificationPanel';

// `data` must be one stable array, as the real hook guarantees, or the panel's sync effect loops.
const state = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  refetch: vi.fn(),
  replace: vi.fn(),
  empty: [] as never[],
  suspended: [
    {
      id: 'q-1',
      person_id: 'p1',
      organization: 'AKC',
      qualification_level: 'Master',
      disciplines: ['Scent Work'],
      judge_number: 'J-1',
      date_obtained: null,
      is_active: false,
      suspension_date: '2026-01-05',
      suspension_reason: 'Dues',
    },
  ] as never[],
}));
vi.mock('@/hooks/queries/useJudgeDatabase', () => ({
  useJudgeQualifications: () => ({ data: state.empty, refetch: state.refetch, ...state.query }),
  judgeQueryKeys: { qualificationsByJudge: (id: string) => ['judges', 'qualifications', id] },
}));
vi.mock('@/services/database/judges', () => ({ replaceJudgeQualifications: state.replace }));
vi.mock('@/hooks/useRBAC', () => ({ useRBAC: () => ({ hasPermission: () => false }) }));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'secretary-1' },
    hasRole: (role: UserRole) => role === UserRole.SECRETARY,
  }),
}));

const renderPanel = () =>
  render(<JudgeQualificationPanel open onClose={vi.fn()} userId="p1" userName="Ada Lovelace" />);

const addButton = () => screen.queryByRole('button', { name: /Add First Qualification/ });

describe('JudgeQualificationPanel: the form waits for the list', () => {
  beforeEach(() => {
    state.replace.mockReset();
    state.refetch.mockReset();
  });

  it('shows a retry instead of the form when the list failed to load', async () => {
    state.query = { hasList: false, isError: true, fetchStatus: 'idle' };
    const { user } = renderPanel();
    expect(addButton()).toBeNull();
    expect(screen.getByRole('button', { name: /Save Changes/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(state.refetch).toHaveBeenCalled();
    expect(state.replace).not.toHaveBeenCalled();
  });

  it('shows a retry, not "No Qualifications", when the read is paused offline', () => {
    state.query = { hasList: false, isError: false, fetchStatus: 'paused' };
    renderPanel();
    expect(addButton()).toBeNull();
    expect(screen.queryByText('No Qualifications')).toBeNull();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('shows loading, not the form, while the first read is in flight', () => {
    state.query = { hasList: false, isError: false, fetchStatus: 'fetching' };
    renderPanel();
    expect(addButton()).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(/Loading/);
  });

  it('turns editing off when a refresh failed after a good read', () => {
    state.query = { hasList: true, isError: true, fetchStatus: 'idle' };
    renderPanel();
    expect(addButton()).toBeNull();
    expect(screen.getByRole('button', { name: /Save Changes/ })).toBeDisabled();
  });

  it('lets a secretary without show:manage save once the list has loaded', async () => {
    state.query = { hasList: true, isError: false, fetchStatus: 'idle' };
    const { user } = renderPanel();
    await user.click(addButton()!);
    expect(screen.getByRole('button', { name: /Save Changes/ })).toBeEnabled();
  });

  it('sends a suspended row back with its id and status when another organization is added (MYK9-2393)', async () => {
    state.query = { data: state.suspended, hasList: true, isError: false, fetchStatus: 'idle' };
    state.replace.mockResolvedValue(undefined);
    const { user } = renderPanel();
    await user.click(screen.getByRole('button', { name: /Add Another Qualification/ }));
    await user.click(screen.getByRole('button', { name: /Save Changes/ }));

    expect(state.replace).toHaveBeenCalledWith('p1', [
      expect.objectContaining({ id: 'q-1', is_active: false, date_obtained: null }),
      expect.not.objectContaining({ id: expect.anything() }),
    ]);
  });
});
