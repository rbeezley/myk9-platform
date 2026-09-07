import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@/test/utils/testUtils';
import { MonthScrubber } from './MonthScrubber';

describe('MonthScrubber', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-07T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ['2026-01', /January 2026/, 'ArrowRight', '2026-06'],
    ['2028-01', /January 2028/, 'ArrowLeft', '2027-09'],
  ] as const)(
    'keeps a valid bookmarked month visible and keyboard-reachable outside the rolling window (%s)',
    (month, label, direction, adjacentMonth) => {
      const onChange = vi.fn();

      render(<MonthScrubber shows={[]} value={month} onChange={onChange} />);

      const radios = screen.getAllByRole('radio');
      const selected = screen.getByRole('radio', { name: label });
      expect(selected).toHaveAttribute('aria-checked', 'true');
      expect(radios.filter(radio => radio.tabIndex === 0)).toEqual([selected]);

      fireEvent.keyDown(selected, { key: direction });

      expect(onChange).toHaveBeenCalledWith(adjacentMonth);
    }
  );

  it('keeps ordinary month selection and labels at the project text token floor', () => {
    render(<MonthScrubber shows={[]} value="2026-09" onChange={vi.fn()} />);

    const selected = screen.getByRole('radio', { name: /September 2026/ });
    expect(selected).toHaveAttribute('aria-checked', 'true');
    expect(selected.querySelector('span')).toHaveClass('text-xs');
    expect(screen.getByText('upcoming')).toHaveClass('text-xs');
  });
});
