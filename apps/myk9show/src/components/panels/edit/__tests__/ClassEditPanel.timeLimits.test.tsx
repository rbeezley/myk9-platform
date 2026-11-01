/**
 * MYK9-1503: Edit class types its time limits and estimated judging time
 * through the one shared time field, so the class editor reads `430` the way
 * Set Max Time does and never saves text it could not read.
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

// An estimatedJudgingTime renders the full form, which carries the Timing tab.
const fullClass = (extra: Partial<ClassData> = {}) =>
  ({
    id: 'cls-1',
    element: 'Interior',
    level: 'Excellent',
    section: 'A',
    judgeId: 'TBD',
    judge: 'TBD',
    status: 'Scheduled',
    classOrder: '1',
    estimatedJudgingTime: '5:00',
    timeLimit1: '3:00',
    ...extra,
  }) as Partial<ClassData>;

async function openTiming(initial: Partial<ClassData>) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const view = render(
    <ClassEditPanel
      open
      onClose={vi.fn()}
      classId="cls-1"
      className="Interior Excellent"
      initialClassData={initial}
      onSave={onSave}
    />
  );
  await view.user.click(await screen.findByRole('tab', { name: /Timing/ }));
  return { ...view, onSave };
}

describe('ClassEditPanel: time limits use the shared time field', () => {
  it('previews the max-time shorthand and saves what the preview showed', async () => {
    const { user, onSave } = await openTiming(fullClass());
    const limit2 = screen.getByLabelText('Time Limit 2');
    expect(limit2).toHaveAttribute('inputmode', 'numeric');
    await user.type(limit2, '430');
    expect(screen.getByTestId('duration-preview')).toHaveTextContent('= 4:30');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ timeLimit2: '4:30' }));
  });

  it('shows the stored limit and flags one above the editor range', async () => {
    const { user } = await openTiming(fullClass());
    const limit1 = screen.getByLabelText('Time Limit 1');
    expect(limit1).toHaveValue('3:00');
    await user.clear(limit1);
    await user.type(limit1, '1200');
    expect(screen.getByRole('alert')).toHaveTextContent('Must be between 0:01 and 9:59.');
  });

  it('refuses to save text it cannot read instead of clearing the limit', async () => {
    const { user, onSave } = await openTiming(fullClass());
    const limit1 = screen.getByLabelText('Time Limit 1');
    await user.clear(limit1);
    await user.type(limit1, '4:75');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(
      await screen.findByText('Please enter time limit 1 as minutes and seconds, like 4:30')
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});
