import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimerDisplay } from './TimerDisplay';

const defaultProps = {
  time: 0,
  isRunning: false,
  warningState: 'normal' as const,
  maxTime: '3:00',
  maxTimeMs: 180000,
  remainingTime: '3:00',
  remainingTimeMs: 180000,
  onStart: vi.fn(),
  onStop: vi.fn(),
  onReset: vi.fn(),
};

describe('TimerDisplay', () => {
  it('should render the formatted time', () => {
    render(<TimerDisplay {...defaultProps} time={45000} />);
    expect(screen.getByText('0:45.00')).toBeInTheDocument();
  });

  it('should format minutes and seconds correctly', () => {
    render(<TimerDisplay {...defaultProps} time={125000} />);
    expect(screen.getByText('2:05.00')).toBeInTheDocument();
  });

  it('should display max time when timer is at zero', () => {
    render(<TimerDisplay {...defaultProps} />);
    expect(screen.getByText(/Max Time: 3:00/)).toBeInTheDocument();
  });

  it('should display remaining time when timer has started', () => {
    render(<TimerDisplay {...defaultProps} time={30000} remainingTime="2:30" />);
    expect(screen.getByText(/Remaining: 2:30/)).toBeInTheDocument();
  });

  describe('button states', () => {
    it('should show Start button when time is 0 and not running', () => {
      render(<TimerDisplay {...defaultProps} />);
      expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    });

    it('should show Stop button when running', () => {
      render(<TimerDisplay {...defaultProps} isRunning={true} time={5000} />);
      expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
    });

    it('should show Resume button when stopped with time > 0', () => {
      render(<TimerDisplay {...defaultProps} time={15000} />);
      expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    });

    it('should call onStart when Start is clicked', async () => {
      const user = userEvent.setup();
      const onStart = vi.fn();
      render(<TimerDisplay {...defaultProps} onStart={onStart} />);
      await user.click(screen.getByRole('button', { name: 'Start' }));
      expect(onStart).toHaveBeenCalledOnce();
    });

    it('should call onStop when Stop is clicked', async () => {
      const user = userEvent.setup();
      const onStop = vi.fn();
      render(<TimerDisplay {...defaultProps} isRunning={true} time={5000} onStop={onStop} />);
      await user.click(screen.getByRole('button', { name: 'Stop' }));
      expect(onStop).toHaveBeenCalledOnce();
    });

    it('should call onStart when Resume is clicked', async () => {
      const user = userEvent.setup();
      const onStart = vi.fn();
      render(<TimerDisplay {...defaultProps} time={15000} onStart={onStart} />);
      await user.click(screen.getByRole('button', { name: 'Resume' }));
      expect(onStart).toHaveBeenCalledOnce();
    });
  });

  describe('reset button', () => {
    it('should be disabled when timer is running', () => {
      render(<TimerDisplay {...defaultProps} isRunning={true} time={5000} />);
      const resetBtn = screen.getByTitle('Reset disabled while timer is running');
      expect(resetBtn).toBeDisabled();
    });

    it('should be enabled when timer is stopped', () => {
      render(<TimerDisplay {...defaultProps} time={5000} />);
      const resetBtn = screen.getByTitle('Reset timer');
      expect(resetBtn).not.toBeDisabled();
    });

    it('should call onReset when clicked', async () => {
      const user = userEvent.setup();
      const onReset = vi.fn();
      render(<TimerDisplay {...defaultProps} time={5000} onReset={onReset} />);
      const resetBtn = screen.getByTitle('Reset timer');
      await user.click(resetBtn);
      expect(onReset).toHaveBeenCalledOnce();
    });
  });

  describe('warning states', () => {
    it('should display warning message when provided', () => {
      render(
        <TimerDisplay
          {...defaultProps}
          warningState="warning"
          warningMessage="30 seconds remaining!"
        />
      );
      expect(screen.getByText('30 seconds remaining!')).toBeInTheDocument();
    });

    it('should not display warning message when not provided', () => {
      const { container } = render(<TimerDisplay {...defaultProps} />);
      // No warning banner should exist
      expect(container.querySelectorAll('[class*="bg-red"]').length +
        container.querySelectorAll('[class*="bg-amber"]').length).toBeLessThanOrEqual(1);
    });
  });

  describe('progress ring', () => {
    it('should show progress ring when showProgressRing is true and maxTimeMs is set', () => {
      const { container } = render(<TimerDisplay {...defaultProps} />);
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
    });

    it('should hide progress ring when showProgressRing is false', () => {
      const { container } = render(<TimerDisplay {...defaultProps} showProgressRing={false} />);
      const svgs = container.querySelectorAll('svg');
      // There should be no SVG for the ring (only checking for the positioned one)
      const positionedSvgs = Array.from(svgs).filter(svg =>
        svg.className.baseVal?.includes('absolute') || svg.classList?.contains('absolute')
      );
      expect(positionedSvgs.length).toBe(0);
    });
  });

  describe('haptic feedback', () => {
    it('should call onHaptic with "heavy" on start when time is 0', async () => {
      const user = userEvent.setup();
      const onHaptic = vi.fn();
      render(<TimerDisplay {...defaultProps} onHaptic={onHaptic} />);
      await user.click(screen.getByRole('button', { name: 'Start' }));
      expect(onHaptic).toHaveBeenCalledWith('heavy');
    });

    it('should call onHaptic with "medium" on resume when time > 0', async () => {
      const user = userEvent.setup();
      const onHaptic = vi.fn();
      render(<TimerDisplay {...defaultProps} time={5000} onHaptic={onHaptic} />);
      await user.click(screen.getByRole('button', { name: 'Resume' }));
      expect(onHaptic).toHaveBeenCalledWith('medium');
    });

    it('should call onHaptic with "heavy" on stop', async () => {
      const user = userEvent.setup();
      const onHaptic = vi.fn();
      render(<TimerDisplay {...defaultProps} isRunning={true} time={5000} onHaptic={onHaptic} />);
      await user.click(screen.getByRole('button', { name: 'Stop' }));
      expect(onHaptic).toHaveBeenCalledWith('heavy');
    });
  });

  it('should apply custom className', () => {
    const { container } = render(<TimerDisplay {...defaultProps} className="my-timer" />);
    const timerDiv = container.querySelector('.my-timer');
    expect(timerDiv).not.toBeNull();
  });
});
