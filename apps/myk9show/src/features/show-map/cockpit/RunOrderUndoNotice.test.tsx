import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { render } from '@/test/utils/testUtils';
import { RunOrderUndoNotice } from './RunOrderUndoNotice';

describe('RunOrderUndoNotice', () => {
  const base = {
    onAutoSort: vi.fn(),
    isAutoSorting: false,
    onPlaceEntry: vi.fn(),
    onUndo: vi.fn(),
  };

  it('offers Undo for a change in this class only', async () => {
    const onUndo = vi.fn();
    render(
      <RunOrderUndoNotice
        classId="c1"
        runOrder={{
          ...base,
          onUndo,
          lastChange: { classId: 'c1', summary: 'Moved #104 to position 1' },
        }}
      />
    );
    await userEvent.setup().click(screen.getByRole('button', { name: /Undo/ }));
    expect(onUndo).toHaveBeenCalled();
  });

  it('is absent for another class', () => {
    render(
      <RunOrderUndoNotice
        classId="c2"
        runOrder={{ ...base, lastChange: { classId: 'c1', summary: 'x' } }}
      />
    );
    expect(screen.queryByRole('button', { name: /Undo/ })).toBeNull();
  });
});
