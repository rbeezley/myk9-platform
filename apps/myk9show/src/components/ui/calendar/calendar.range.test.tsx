import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { Calendar } from './calendar';

describe('Calendar range boundaries', () => {
  it('keeps distinct start and end classes on real DayPicker range cells', () => {
    render(
      <Calendar
        mode="range"
        month={new Date(2026, 4, 1)}
        selected={{ from: new Date(2026, 4, 11), to: new Date(2026, 4, 13) }}
        numberOfMonths={2}
        classNames={{
          range_start:
            'range_start day-range-start [&>button]:font-semibold [&>button]:ring-2 [&>button]:ring-primary',
          range_end:
            'range_end day-range-end [&>button]:font-semibold [&>button]:ring-2 [&>button]:ring-secondary',
        }}
      />
    );

    const startButton = screen.getByRole('button', { name: /May 11th, 2026/i });
    const endButton = screen.getByRole('button', { name: /May 13th, 2026/i });

    expect(startButton.parentElement).toHaveClass('range_start', 'day-range-start');
    expect(endButton.parentElement).toHaveClass('range_end', 'day-range-end');
  });
});
