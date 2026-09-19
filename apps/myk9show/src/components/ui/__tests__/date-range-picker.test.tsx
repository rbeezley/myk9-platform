import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DateRange } from 'react-day-picker';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { DateRangePicker } from '../date-range-picker';

vi.mock('@/components/ui/calendar', () => ({
  Calendar: ({
    onSelect,
    classNames,
    numberOfMonths,
  }: {
    onSelect?: (range: DateRange | undefined) => void;
    classNames?: { range_start?: string; range_end?: string };
    numberOfMonths?: number;
  }) => (
    <div data-testid="date-range-calendar" data-number-of-months={numberOfMonths}>
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
      <button
        type="button"
        onClick={() =>
          onSelect?.({
            from: new Date(2026, 4, 11),
            to: new Date(2026, 4, 13),
          })
        }
      >
        Select May range
      </button>
      <div data-testid="range-start-class">{classNames?.range_start}</div>
      <div data-testid="range-end-class">{classNames?.range_end}</div>
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

  it('keeps the start and end dates when both dates are in the same month', async () => {
    const user = userEvent.setup();

    render(
      <DateRangePicker
        onStartDateChange={onStartDateChange}
        onEndDateChange={onEndDateChange}
        startDefaultTime="8:00 AM"
        endDefaultTime="5:00 PM"
      />
    );

    await user.click(screen.getByRole('button', { name: /select date range/i }));
    await user.click(screen.getByRole('button', { name: /select may range/i }));

    expect(onStartDateChange).toHaveBeenCalledWith(new Date(2026, 4, 11, 8, 0, 0, 0));
    expect(onEndDateChange).toHaveBeenCalledWith(new Date(2026, 4, 13, 17, 0, 0, 0));
  });

  it('explains the range order, continuous panes, and month navigation accessibly', async () => {
    const user = userEvent.setup();

    render(
      <DateRangePicker
        id="show-dates"
        onStartDateChange={onStartDateChange}
        onEndDateChange={onEndDateChange}
      />
    );

    await user.click(screen.getByRole('button', { name: /select date range/i }));

    const dialog = screen.getByRole('dialog', { name: 'Choose a date range' });
    const body = screen.getByTestId('date-range-picker-scroll-body');
    const footer = screen.getByTestId('date-range-picker-footer');
    expect(dialog).toHaveClass(
      'max-h-[calc(100dvh-1rem)]',
      'sm:max-h-[calc(100dvh-2rem)]',
      'w-[calc(100vw-1rem)]',
      'overflow-hidden'
    );
    expect(dialog).toHaveAccessibleDescription(
      'Select the first date for the start of your range, then select the last date for the end. Both panes are one continuous calendar. Use the Previous Month and Next Month buttons to move through the calendar.'
    );
    expect(body).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto');
    expect(body).toContainElement(screen.getByRole('group', { name: 'Date range key' }));
    expect(body).toContainElement(screen.getByTestId('date-range-calendar'));
    expect(screen.getByTestId('date-range-calendar')).toHaveAttribute('data-number-of-months', '2');
    expect(body).toContainElement(screen.getByPlaceholderText('8:00 AM'));
    expect(dialog).toContainElement(footer);
    expect(footer).toHaveClass('shrink-0', 'border-t');
    expect(screen.getByRole('group', { name: 'Date range key' })).toHaveTextContent(
      'StartEndDates in between'
    );
    expect(screen.getByTestId('range-start-class')).toHaveTextContent(/range_start.*ring-2/);
    expect(screen.getByTestId('range-end-class')).toHaveTextContent(/range_end.*ring-2/);
  });

  it('dismisses on Escape, contains focus, and restores focus to the trigger', async () => {
    const user = userEvent.setup();

    render(
      <DateRangePicker onStartDateChange={onStartDateChange} onEndDateChange={onEndDateChange} />
    );

    const trigger = screen.getByRole('button', { name: /select date range/i });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Choose a date range' });
    await waitFor(() => {
      const activeElement = document.activeElement;
      expect(activeElement instanceof HTMLElement && dialog.contains(activeElement)).toBe(true);
    });

    const focusableCount =
      within(dialog).getAllByRole('button').length +
      within(dialog).getAllByRole('textbox').length +
      within(dialog).queryAllByRole('combobox').length;
    expect(document.querySelectorAll('[data-base-ui-focus-guard]').length).toBeGreaterThanOrEqual(
      2
    );
    for (let index = 0; index < focusableCount; index += 1) {
      await user.tab();
      const activeElement = document.activeElement;
      const isHTMLElement = activeElement instanceof HTMLElement;
      expect(
        isHTMLElement &&
          (activeElement === dialog ||
            dialog.contains(activeElement) ||
            activeElement.hasAttribute('data-base-ui-focus-guard'))
      ).toBe(true);
    }

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
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
