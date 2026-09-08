import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen } from '@/test/utils/testUtils';
import { MonthScrubber } from './MonthScrubber';

const scrollIntoViewMock = vi.fn();

function StatefulMonthScrubber({
  initialValue,
  onChange,
}: {
  initialValue: string;
  onChange: (key: string) => void;
}) {
  const [value, setValue] = useState(initialValue);

  return (
    <MonthScrubber
      shows={[]}
      value={value}
      onChange={key => {
        onChange(key);
        setValue(key);
      }}
    />
  );
}

describe('MonthScrubber', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-07T12:00:00Z'));
    scrollIntoViewMock.mockClear();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewMock,
    });
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

      render(<StatefulMonthScrubber initialValue={month} onChange={onChange} />);

      const radios = screen.getAllByRole('radio');
      const selected = screen.getByRole('radio', { name: label });
      expect(selected).toHaveAttribute('aria-checked', 'true');
      expect(radios.filter(radio => radio.tabIndex === 0)).toEqual([selected]);

      fireEvent.keyDown(selected, { key: direction });

      expect(onChange).toHaveBeenCalledWith(adjacentMonth);
      const next = screen.getByRole('radio', {
        name: adjacentMonth === '2026-06' ? /June 2026/ : /September 2027/,
      });
      expect(next).toHaveAttribute('aria-checked', 'true');
      expect(next).toHaveAttribute('tabindex', '0');
      expect(document.activeElement).toBe(next);
    }
  );

  it('scrolls a newly selected month into view after URL navigation changes the value', () => {
    const { rerender } = render(<MonthScrubber shows={[]} value="2026-01" onChange={vi.fn()} />);
    scrollIntoViewMock.mockClear();

    rerender(<MonthScrubber shows={[]} value="2028-01" onChange={vi.fn()} />);

    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      block: 'nearest',
      inline: 'nearest',
    });
  });

  it('does not scroll when show data changes without changing the selection', () => {
    const { rerender } = render(<MonthScrubber shows={[]} value="2026-09" onChange={vi.fn()} />);
    scrollIntoViewMock.mockClear();

    rerender(<MonthScrubber shows={[]} value="2026-09" onChange={vi.fn()} />);

    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it('keeps ordinary month selection and labels at the project text token floor', () => {
    render(<MonthScrubber shows={[]} value="2026-09" onChange={vi.fn()} />);

    const selected = screen.getByRole('radio', { name: /September 2026/ });
    expect(selected).toHaveAttribute('aria-checked', 'true');
    expect(selected.querySelector('span')).toHaveClass('text-xs');
    expect(screen.getByText('upcoming')).toHaveClass('text-xs');
  });
});
