import { render, screen } from '@/test/utils/testUtils';
import { MoveUpDialog } from '../MoveUpDialog';
import type { DayOfOperationEntry } from '../types';
import type { ClassWithCapacity } from '@/services/database/day-of-operations';

const moveUpShowMapEntry = vi.fn();
const processMoveUp = vi.fn().mockResolvedValue({
  data: { class: { name: 'Open Agility' } },
  error: null,
});

vi.mock('@/features/show-map/showMapActionMutations', () => ({
  moveUpShowMapEntry: (...args: unknown[]) => moveUpShowMapEntry(...args),
}));

vi.mock('@/services/database/day-of-operations', () => ({
  processMoveUp: (...args: unknown[]) => processMoveUp(...args),
}));

const entry: DayOfOperationEntry = {
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

const classes: ClassWithCapacity[] = [
  {
    id: 'class-1',
    name: 'Novice Agility',
    class_number: '1',
    max_entries: 100,
    trial_id: 'trial-1',
    accepted_count: 10,
    available_spots: 90,
  },
  {
    id: 'class-2',
    name: 'Open Agility',
    class_number: '2',
    max_entries: 100,
    trial_id: 'trial-1',
    accepted_count: 9,
    available_spots: 91,
  },
];

describe('MoveUpDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    moveUpShowMapEntry.mockResolvedValue({
      targetClassName: 'Open Agility',
      originalEntryId: 'entry-1',
      newEntryId: 'entry-2',
      previousEntryStatus: 'checked-in',
      previousCheckInStatus: 'checked-in',
      previousSpecialRequests: null,
    });
  });

  it('processes move-up through replicated show-day mutations', async () => {
    const onOpenChange = vi.fn();
    const onSuccess = vi.fn();
    const { user } = render(
      <MoveUpDialog
        open
        onOpenChange={onOpenChange}
        entry={entry}
        classes={classes}
        onSuccess={onSuccess}
      />
    );

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: /open agility/i }));
    await user.type(screen.getByPlaceholderText(/qualified in novice/i), 'Qualified in Novice');
    await user.click(screen.getByRole('button', { name: /process move-up/i }));

    expect(moveUpShowMapEntry).toHaveBeenCalledWith({
      entryId: 'entry-1',
      targetClassId: 'class-2',
      reason: 'Qualified in Novice',
    });
    expect(processMoveUp).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
