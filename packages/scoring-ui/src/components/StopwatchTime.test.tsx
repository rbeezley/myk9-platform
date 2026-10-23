import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { StopwatchTime } from './StopwatchTime';
import { useStopwatch } from '../hooks/useStopwatch';
import type { StopwatchOptions } from '../types';

// MYK9-1364: the host of useStopwatch must not re-render for the 100ms paint; only
// the <StopwatchTime> display does. `renders` counts host renders directly.
const counts = { host: 0 };

function Host(options: StopwatchOptions) {
  counts.host += 1;
  const stopwatch = useStopwatch(options);
  return (
    <div>
      <span data-testid="elapsed">
        <StopwatchTime stopwatch={stopwatch} />
      </span>
      <span data-testid="remaining">
        <StopwatchTime stopwatch={stopwatch} mode="remaining" />
      </span>
      <span data-testid="custom">
        <StopwatchTime stopwatch={stopwatch}>
          {ms => `custom:${Math.floor(ms / 1000)}`}
        </StopwatchTime>
      </span>
      <span data-testid="running">{String(stopwatch.isRunning)}</span>
      <span data-testid="warning">{stopwatch.getWarningMessage() ?? 'none'}</span>
      <button onClick={stopwatch.start}>start</button>
      <button onClick={() => stopwatch.pause()}>stop</button>
      <button onClick={stopwatch.reset}>reset</button>
    </div>
  );
}

/** One act per display frame, so React cannot batch the frames together. */
function runFor(ms: number) {
  for (let elapsed = 0; elapsed < ms; elapsed += 1000 / 60) {
    act(() => {
      vi.advanceTimersByTime(1000 / 60);
    });
  }
}

const text = (testId: string) => screen.getByTestId(testId).textContent;

describe('StopwatchTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    counts.host = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows 0:00.00 and the full max time before the clock starts', () => {
    render(<Host maxTime="3:00" />);

    expect(text('elapsed')).toBe('0:00.00');
    expect(text('remaining')).toBe('3:00.00');
  });

  it('advances the display while the host component does not re-render', () => {
    render(<Host maxTime="3:00" level="Master" />);
    fireEvent.click(screen.getByText('start'));
    act(() => {
      vi.advanceTimersByTime(20);
    });
    const hostRendersAfterStart = counts.host;
    const shownAtStart = text('elapsed');

    runFor(3000);

    expect(counts.host).toBe(hostRendersAfterStart);
    expect(text('elapsed')).not.toBe(shownAtStart);
    expect(text('elapsed')).toMatch(/^0:0[23]\.\d\d$/);
    expect(text('remaining')).toMatch(/^2:5[67]\.\d\d$/);
    expect(text('custom')).toMatch(/^custom:[23]$/);
  });

  it('re-renders the host once on stop, and the display freezes on the exact time', () => {
    render(<Host maxTime="3:00" level="Master" />);
    fireEvent.click(screen.getByText('start'));
    runFor(1030);
    const before = counts.host;

    fireEvent.click(screen.getByText('stop'));

    expect(counts.host - before).toBe(1);
    expect(text('running')).toBe('false');
    const frozen = text('elapsed');
    runFor(500);
    expect(text('elapsed')).toBe(frozen);
    expect(counts.host - before).toBe(1);
  });

  it('re-renders the host once at expiry, snapping the display to the max', () => {
    render(<Host maxTime="0:03" thirtySecondWarning={false} />);
    fireEvent.click(screen.getByText('start'));
    runFor(500);
    const before = counts.host;

    runFor(3000);

    expect(counts.host - before).toBe(1);
    expect(text('running')).toBe('false');
    expect(text('elapsed')).toBe('0:03.00');
    expect(text('remaining')).toBe('0:00.00');
    expect(text('warning')).toBe('Time Expired');
  });

  it('re-renders the host only where a warning window opens or closes', () => {
    render(<Host maxTime="1:00" level="Novice" />);
    fireEvent.click(screen.getByText('start'));
    runFor(20);
    const atStart = counts.host;

    runFor(27000);
    expect(counts.host).toBe(atStart);
    expect(text('warning')).toBe('none');

    // 29s opens the announce window, 30s opens the banner window.
    runFor(4000);
    expect(counts.host - atStart).toBe(2);
    expect(text('warning')).toBe('30 Second Warning');
  });

  it('reset returns the display to zero', () => {
    render(<Host maxTime="3:00" level="Master" />);
    fireEvent.click(screen.getByText('start'));
    runFor(1000);
    fireEvent.click(screen.getByText('reset'));

    expect(text('elapsed')).toBe('0:00.00');
    expect(text('running')).toBe('false');
  });
});
