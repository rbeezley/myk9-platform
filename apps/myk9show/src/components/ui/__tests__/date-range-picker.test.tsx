import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DateRange } from 'react-day-picker';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DateRangePicker } from '../date-range-picker';

vi.mock('@/components/ui/calendar', () => ({
  Calendar: ({ onSelect }: { onSelect?: (range: DateRange | undefined) => void }) => (
    <div>
      <button
        type="button"
        onClick={() =>
          onSelect?.({
            from: new Date(2026, 4, 11),
            to: new Date(2026, 5, 5),
          })
        }
      >
        Select May to June
      </button>
      <button type="button" onClick={() => onSelect?.(undefined)}>
        Empty selection
      </button>
    </div>
  ),
}));

describe('DateRangePicker', () => {
  const onStartDateChange = vi.fn();
  const onEndDateChange = vi.fn();

  beforeEach(() => {
    onStartDateChange.mockClear();
    onEndDateChange.mockClear();
  });

  it('persists a cross-month range instead of collapsing to the end date', async () => {
    const user = userEvent.setup();

    render(
      <DateRangePicker
        onStartDateChange={onStartDateChange}
        onEndDateChange={onEndDateChange}
        startDefaultTime="8:00 AM"
        endDefaultTime="11:59 PM"
      />
    );

    await user.click(screen.getByRole('button', { name: /select date range/i }));
    await user.click(screen.getByRole('button', { name: /select may to june/i }));

    expect(onStartDateChange).toHaveBeenCalledWith(new Date(2026, 4, 11, 8, 0, 0, 0));
    expect(onEndDateChange).toHaveBeenCalledWith(new Date(2026, 5, 5, 23, 59, 0, 0));
  });

  it('does not wipe existing dates when the calendar emits an empty selection', async () => {
    const user = userEvent.setup();

    render(
      <DateRangePicker
        startDate={new Date(2026, 5, 12, 8, 0)}
        endDate={new Date(2026, 5, 14, 17, 0)}
        onStartDateChange={onStartDateChange}
        onEndDateChange={onEndDateChange}
      />
    );

    await user.click(screen.getByRole('button', { name: /jun 12, 2026/i }));
    await user.click(screen.getByRole('button', { name: /empty selection/i }));

    expect(onStartDateChange).not.toHaveBeenCalledWith(undefined);
    expect(onEndDateChange).not.toHaveBeenCalledWith(undefined);
  });
});
