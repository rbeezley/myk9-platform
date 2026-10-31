import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { isUnresolvedClockTime, parseStoredClockTime, type ClockTimeStorage } from '@myk9/core';
import { ClockTimeInput } from './ClockTimeInput';

function Harness({
  initial = '',
  storage,
  onValue,
  onSubmit,
}: {
  initial?: string;
  storage?: ClockTimeStorage;
  onValue?: (v: string) => void;
  onSubmit?: () => void;
}) {
  const [value, setValue] = React.useState(initial);
  return (
    <>
      <ClockTimeInput
        value={value}
        storage={storage}
        ariaLabel="Start time"
        onSubmit={onSubmit}
        onChange={v => {
          setValue(v);
          onValue?.(v);
        }}
      />
      <button type="button" onClick={() => setValue('02:15 PM')}>
        elsewhere
      </button>
    </>
  );
}

const field = () => screen.getByLabelText('Start time') as HTMLInputElement;

describe('ClockTimeInput', () => {
  it('previews what it understood and stores that exact time', () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    fireEvent.change(field(), { target: { value: '930' } });
    expect(screen.getByTestId('clock-time-preview')).toHaveTextContent('= 9:30 AM');
    expect(field().value).toBe('930');
    expect(onValue).toHaveBeenLastCalledWith('09:30 AM');
  });

  it('reads an afternoon hour as PM and shows it before use', () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    fireEvent.change(field(), { target: { value: '130' } });
    expect(screen.getByTestId('clock-time-preview')).toHaveTextContent('= 1:30 PM');
    expect(onValue).toHaveBeenLastCalledWith('01:30 PM');
  });

  it('settles the typed digits into the display format on leaving', () => {
    render(<Harness />);
    fireEvent.change(field(), { target: { value: '9:30pm' } });
    fireEvent.blur(field());
    expect(field().value).toBe('9:30 PM');
    expect(screen.queryByTestId('clock-time-preview')).toBeNull();
  });

  it('asks instead of choosing when both AM and PM fit, and stores nothing until answered', () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    fireEvent.change(field(), { target: { value: '7' } });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('7:00 AM or 7:00 PM');
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(isUnresolvedClockTime(onValue.mock.calls.at(-1)?.[0] as string)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '7:00 PM' }));
    expect(onValue).toHaveBeenLastCalledWith('07:00 PM');
    expect(field().value).toBe('7:00 PM');
  });

  it('keeps a still-undecided 7:00 from ever reading as a stored time, and a chosen 7 AM resolved', () => {
    const onValue = vi.fn();
    render(<Harness storage="hhmm" onValue={onValue} />);
    fireEvent.change(field(), { target: { value: '7:00' } });
    const undecided = onValue.mock.calls.at(-1)?.[0] as string;
    expect(parseStoredClockTime(undecided)).toBeNull();
    expect(isUnresolvedClockTime(undecided)).toBe(true);
    expect(field().value).toBe('7:00');
    fireEvent.click(screen.getByRole('button', { name: '7:00 AM' }));
    expect(onValue).toHaveBeenLastCalledWith('07:00');
    expect(isUnresolvedClockTime('07:00')).toBe(false);
  });

  it('shows an undecided text without its marker when it is remounted', () => {
    render(<Harness initial="7:00?" />);
    expect(field().value).toBe('7:00');
  });

  it('says why an unreadable time cannot be used and links it to the field', () => {
    render(<Harness />);
    fireEvent.change(field(), { target: { value: '9:75' } });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/minutes/i);
    expect(field().getAttribute('aria-describedby')).toContain(alert.parentElement?.id);
  });

  it('keeps unset unset: empty stays empty and is never midnight', () => {
    const onValue = vi.fn();
    render(<Harness initial="09:30 AM" onValue={onValue} />);
    fireEvent.change(field(), { target: { value: '' } });
    expect(onValue).toHaveBeenLastCalledWith('');
    fireEvent.blur(field());
    expect(field().value).toBe('');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('leaves an unset field unset when it is only tabbed through', () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    fireEvent.focus(field());
    fireEvent.blur(field());
    expect(onValue).not.toHaveBeenCalled();
  });

  it('reports no change when an existing time is only tabbed through', () => {
    const onValue = vi.fn();
    render(<Harness initial="13:30" storage="hhmm" onValue={onValue} />);
    expect(field().value).toBe('1:30 PM');
    fireEvent.focus(field());
    fireEvent.blur(field());
    expect(onValue).not.toHaveBeenCalled();
  });

  it('writes back in the field own stored format', () => {
    const onValue = vi.fn();
    render(<Harness storage="hhmmss" onValue={onValue} />);
    fireEvent.change(field(), { target: { value: '130' } });
    expect(onValue).toHaveBeenLastCalledWith('13:30:00');
  });

  it('follows a value changed from elsewhere', () => {
    render(<Harness initial="09:30 AM" />);
    fireEvent.click(screen.getByText('elsewhere'));
    expect(field().value).toBe('2:15 PM');
  });

  it('selects the time on focus so typing replaces it', () => {
    render(<Harness initial="09:30 AM" />);
    field().focus();
    expect(field().selectionStart).toBe(0);
    expect(field().selectionEnd).toBe('9:30 AM'.length);
  });

  it('opens the numeric keypad and keeps a phone-sized target', () => {
    render(<Harness />);
    expect(field()).toHaveAttribute('inputmode', 'numeric');
    expect(field().className).toContain('h-11');
  });

  it('submits on Enter with the settled value', () => {
    const onValue = vi.fn();
    const onSubmit = vi.fn();
    render(<Harness onValue={onValue} onSubmit={onSubmit} />);
    fireEvent.change(field(), { target: { value: '9' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(field().value).toBe('9:00 AM');
  });
});
