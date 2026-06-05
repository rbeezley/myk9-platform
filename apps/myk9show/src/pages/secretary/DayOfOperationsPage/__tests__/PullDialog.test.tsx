import { render, screen } from '@/test/utils/testUtils';
import { PullDialog } from '../PullDialog';
import type { PullableEntry } from '../types';

const updateReplicatedDayOfScratch = vi.fn();
const scratchEntry = vi.fn().mockResolvedValue({ error: null });

vi.mock('@/services/show-day/checkInStatus', () => ({
  updateReplicatedDayOfScratch: (...args: unknown[]) => updateReplicatedDayOfScratch(...args),
}));

vi.mock('@/services/database/day-of-operations', () => ({
  scratchEntry: (...args: unknown[]) => scratchEntry(...args),
}));

const entry: PullableEntry = {
  id: 'entry-1',
  class_id: 'class-1',
  trial_id: 'trial-1',
  entry_status: 'checked-in',
  jump_height: '12',
  handler: 'Jane Handler',
  armband: '101',
  dog: { id: 'dog-1', name: 'Rex', call_name: 'Rexy' },
  class: { id: 'class-1', name: 'Novice Agility', class_number: '1' },
};

describe('PullDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateReplicatedDayOfScratch.mockResolvedValue('mutation-1');
  });

  it('pulls entries through replicated day-of scratch updates', async () => {
    const onOpenChange = vi.fn();
    const onSuccess = vi.fn();
    const { user } = render(
      <PullDialog open onOpenChange={onOpenChange} entry={entry} onSuccess={onSuccess} />
    );

    await user.type(screen.getByPlaceholderText(/reason for pulling/i), 'Handler pulled');
    await user.click(screen.getByRole('button', { name: /confirm pull/i }));

    expect(updateReplicatedDayOfScratch).toHaveBeenCalledWith('entry-1', 'Handler pulled');
    expect(scratchEntry).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
