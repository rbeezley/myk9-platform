import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DurationInput } from './DurationInput';
import type { DurationKind } from '@myk9/core';

function Harness({
  kind = 'search',
  initial = '',
  onValue,
  range,
}: {
  kind?: DurationKind;
  initial?: string;
  onValue?: (v: string) => void;
  range?: { low: number; high: number };
}) {
  const [value, setValue] = React.useState(initial);
  return (
    <>
      <DurationInput
        kind={kind}
        value={value}
        range={range}
        ariaLabel="Time"
        onChange={v => {
          setValue(v);
          onValue?.(v);
        }}
      />
      <button type="button" onClick={() => setValue('2:00.00')}>
        stopwatch
      </button>
    </>
  );
}

const field = () => screen.getByLabelText('Time') as HTMLInputElement;

describe('DurationInput', () => {
  it('previews digits filled from the right and stores the canonical time', () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    fireEvent.change(field(), { target: { value: '4532' } });
    expect(screen.getByTestId('duration-preview')).toHaveTextContent('= 0:45.32');
    expect(field().value).toBe('4532');
    expect(onValue).toHaveBeenLastCalledWith('0:45.32');
  });

  it('shows the canonical time once the person leaves the field', () => {
    render(<Harness />);
    fireEvent.change(field(), { target: { value: '12345' } });
    fireEvent.blur(field());
    expect(field().value).toBe('1:23.45');
    expect(screen.queryByTestId('duration-preview')).toBeNull();
  });

  it('stores empty as empty, never as zero', () => {
    const onValue = vi.fn();
    render(<Harness initial="0:45.32" onValue={onValue} />);
    fireEvent.change(field(), { target: { value: '' } });
    expect(onValue).toHaveBeenLastCalledWith('');
  });

  it('holds unreadable text as typed, says why, and offers what it would mean', () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    fireEvent.change(field(), { target: { value: '1:99.45' } });
    expect(onValue).toHaveBeenLastCalledWith('1:99.45');
    expect(screen.getByRole('alert')).toHaveTextContent('99 seconds is 2:39.45');
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Use 2:39.45' }));
    expect(onValue).toHaveBeenLastCalledWith('2:39.45');
    expect(field().value).toBe('2:39.45');
  });

  it('tells the person when there are more digits than fit', () => {
    render(<Harness />);
    fireEvent.change(field(), { target: { value: '1234567' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Too many digits');
  });

  it('follows a value set from elsewhere, such as the stopwatch', () => {
    render(<Harness />);
    fireEvent.change(field(), { target: { value: '45' } });
    fireEvent.click(screen.getByText('stopwatch'));
    expect(field().value).toBe('2:00.00');
  });

  it('max kind keeps the shorthand and checks the range inline', () => {
    const onValue = vi.fn();
    render(<Harness kind="max" onValue={onValue} range={{ low: 180, high: 300 }} />);
    fireEvent.change(field(), { target: { value: '430' } });
    expect(screen.getByTestId('duration-preview')).toHaveTextContent('= 4:30');
    expect(onValue).toHaveBeenLastCalledWith('4:30');
    fireEvent.change(field(), { target: { value: '6' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Must be between 3:00 and 5:00.');
  });

  it('describes the field by its live line', () => {
    render(<Harness />);
    fireEvent.change(field(), { target: { value: '125' } });
    const hint = screen.getByTestId('duration-preview').parentElement;
    expect(field().getAttribute('aria-describedby')).toBe(hint?.id);
  });

  it('turns a formatted time back into digits on focus so the stream can be corrected', () => {
    const onValue = vi.fn();
    render(<Harness initial="0:45.32" onValue={onValue} />);
    fireEvent.focus(field());
    expect(field().value).toBe('4532');
    fireEvent.change(field(), { target: { value: '45321' } });
    expect(onValue).toHaveBeenLastCalledWith('4:53.21');
    fireEvent.blur(field());
    expect(field().value).toBe('4:53.21');
  });

  it('does the same for a max time without turning 0:30 into 30 minutes', () => {
    render(<Harness kind="max" initial="0:30" />);
    fireEvent.focus(field());
    expect(field().value).toBe('030');
    fireEvent.blur(field());
    expect(field().value).toBe('0:30');
  });

  it('keeps the line under the field in place on blur so a tap below is not lost', () => {
    render(<Harness />);
    const before = field().parentElement?.nextElementSibling;
    fireEvent.change(field(), { target: { value: '125' } });
    fireEvent.blur(field());
    expect(field().parentElement?.nextElementSibling).toBe(before);
    expect(before).toHaveClass('min-h-5');
  });

  it('does not report a change when an existing time is focused and left untouched', () => {
    const onValue = vi.fn();
    render(<Harness initial="0:45.32" onValue={onValue} />);
    fireEvent.focus(field());
    fireEvent.blur(field());
    expect(onValue).not.toHaveBeenCalled();
    expect(field().value).toBe('0:45.32');
  });
});
