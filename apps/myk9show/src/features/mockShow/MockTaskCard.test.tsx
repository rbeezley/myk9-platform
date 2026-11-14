import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { MockTaskCard } from './MockTaskCard';
import { MOCK_SHOW_TASKS } from './mockShowSheet';

vi.mock('./MockNoteBox', () => ({ MockNoteBox: () => <div>note box</div> }));

const task = MOCK_SHOW_TASKS[2]!;

describe('MockTaskCard', () => {
  it('ticks once per click and keeps the minutes it already had', async () => {
    const onProgress = vi.fn();
    const { user } = render(
      <MockTaskCard
        task={task}
        progress={{ done: false, minutes: 20 }}
        ticket={null}
        onProgress={onProgress}
      />
    );

    await user.click(screen.getByRole('checkbox', { name: 'Task 3 done' }));

    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith({ done: true, minutes: 20 });
  });

  it('saves minutes when the field loses focus, and only if they changed', async () => {
    const onProgress = vi.fn();
    const { user } = render(
      <MockTaskCard
        task={task}
        progress={{ done: true, minutes: null }}
        ticket={null}
        onProgress={onProgress}
      />
    );

    const minutes = screen.getByLabelText('Minutes it took');
    await user.type(minutes, '35');
    expect(onProgress).not.toHaveBeenCalled();
    await user.tab();

    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith({ done: true, minutes: 35 });
  });
});
