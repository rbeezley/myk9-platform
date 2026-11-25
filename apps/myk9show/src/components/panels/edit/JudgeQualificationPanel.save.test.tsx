/**
 * MYK9-2382: Save replaces the person's whole qualification list, so it must never run on a list
 * that did not load. A failed or pending read would otherwise erase what is on record.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import { JudgeQualificationPanel } from './JudgeQualificationPanel';

// `data` must be one stable array, as the real hook guarantees, or the panel's sync effect loops.
const state = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  replace: vi.fn(),
  empty: [] as never[],
}));
vi.mock('@/hooks/queries/useJudgeDatabase', () => ({
  useJudgeQualifications: () => ({ data: state.empty, ...state.query }),
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

describe('JudgeQualificationPanel: Save waits for the list', () => {
  beforeEach(() => {
    state.replace.mockReset();
  });

  it('keeps Save off after adding a qualification while the list failed to load', async () => {
    state.query = { isSuccess: false, isError: true };
    const { user } = renderPanel();
    await user.click(screen.getByRole('button', { name: /Add First Qualification/ }));
    expect(screen.getByRole('button', { name: /Save Changes/ })).toBeDisabled();
    expect(state.replace).not.toHaveBeenCalled();
  });

  it('lets a secretary without show:manage save once the list has loaded', async () => {
    state.query = { isSuccess: true, isError: false };
    const { user } = renderPanel();
    await user.click(screen.getByRole('button', { name: /Add First Qualification/ }));
    expect(screen.getByRole('button', { name: /Save Changes/ })).toBeEnabled();
  });
});
