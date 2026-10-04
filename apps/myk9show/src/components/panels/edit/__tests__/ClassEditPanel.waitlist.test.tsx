/**
 * MYK9-998: Edit class sets the class's entry limit and "Allow wait list". Setup hands the panel
 * the mapped class (a judgeId, no estimatedJudgingTime), which renders the SIMPLE form, so the
 * controls are asserted there as well as in full mode.
 */
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ClassEditPanel } from '../ClassEditPanel';
import type { ClassData } from '@/components/classes/types/classTypes';

vi.mock('@/store/showStore', () => ({ useShowStore: () => ({ shows: [] }) }));
vi.mock('@/store/userStore', () => ({ useUserStore: () => ({ people: [] }) }));
vi.mock('@/hooks/useClassRequirements', () => ({
  useClassRequirements: () => ({ autoFill: undefined }),
}));

const setupClass = (extra: Partial<ClassData> = {}) =>
  ({
    id: 'cls-1',
    element: 'Interior',
    level: 'Novice',
    section: 'A',
    judgeId: 'TBD',
    judge: 'TBD',
    status: 'Scheduled',
    classOrder: '1',
    ...extra,
  }) as Partial<ClassData>;

function open(initial: Partial<ClassData>, onSave = vi.fn().mockResolvedValue(undefined)) {
  const view = render(
    <ClassEditPanel
      open
      onClose={vi.fn()}
      classId="cls-1"
      className="Interior Novice"
      initialClassData={initial}
      onSave={onSave}
    />
  );
  return { ...view, onSave };
}

describe('ClassEditPanel: entry limit and wait list', () => {
  it('saves the limit and the wait list switch from the Setup (simple) form', async () => {
    const { user, onSave } = open(setupClass());
    const limit = await screen.findByLabelText(/Entry limit/);
    await user.type(limit, '12');
    await user.click(screen.getByRole('switch', { name: 'Allow wait list' }));
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ maxEntries: 12, allowsWaitlist: true })
    );
  });

  it('shows the existing values and clears the limit with null, not 0 or 40', async () => {
    const { user, onSave } = open(setupClass({ maxEntries: 8, allowsWaitlist: true }));
    const limit = await screen.findByLabelText(/Entry limit/);
    expect(limit).toHaveValue(8);
    expect(screen.getByRole('switch', { name: 'Allow wait list' })).toBeChecked();
    await user.clear(limit);
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ maxEntries: null, allowsWaitlist: true })
    );
  });

  it('offers the same controls in full mode', async () => {
    open(setupClass({ estimatedJudgingTime: '00:02' }));
    expect(await screen.findByLabelText(/Entry limit/)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Allow wait list' })).toBeInTheDocument();
  });
});
