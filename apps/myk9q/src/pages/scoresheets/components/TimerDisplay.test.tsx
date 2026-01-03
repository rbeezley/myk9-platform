/**
 * Tests for TimerDisplay Component
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TimerDisplay } from './TimerDisplay';

describe('TimerDisplay', () => {
  const mockOnStart = vi.fn();
  const mockOnStop = vi.fn();
  const mockOnReset = vi.fn();

  const defaultProps = {
    time: 0,
    isRunning: false,
    warningState: 'normal' as const,
    maxTime: '3:00',
    remainingTime: '3:00',
    onStart: mockOnStart,
    onStop: mockOnStop,
    onReset: mockOnReset
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial state rendering', () => {
    it('should render timer at zero', () => {
      render(<TimerDisplay {...defaultProps} />);
      expect(screen.getByText('0:00.00')).toBeInTheDocument();
    });

    it('should show max time when timer is at zero', () => {
      render(<TimerDisplay {...defaultProps} />);
      expect(screen.getByText(/Max Time: 3:00/)).toBeInTheDocument();
    });

    it('should show Start button when timer is at zero', () => {
      render(<TimerDisplay {...defaultProps} />);
      expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    });

    it('should render reset button', () => {
      render(<TimerDisplay {...defaultProps} />);
      const resetButton = screen.getByTitle('Reset timer');
      expect(resetButton).toBeInTheDocument();
    });
  });

  describe('Timer formatting', () => {
    it('should format time correctly (seconds)', () => {
      render(<TimerDisplay {...defaultProps} time={5420} />);
      expect(screen.getByText('0:05.42')).toBeInTheDocument();
    });

    it('should format time correctly (minutes)', () => {
      render(<TimerDisplay {...defaultProps} time={125500} />);
      expect(screen.getByText('2:05.50')).toBeInTheDocument();
    });

    it('should format time correctly (over 10 minutes)', () => {
      render(<TimerDisplay {...defaultProps} time={625000} />);
      expect(screen.getByText('10:25.00')).toBeInTheDocument();
    });
  });

  describe('Running state', () => {
    it('should show Stop button when running', () => {
      render(<TimerDisplay {...defaultProps} isRunning={true} time={1000} />);
      expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
    });

    it('should disable reset button when running', () => {
      render(<TimerDisplay {...defaultProps} isRunning={true} />);
      const resetButton = screen.getByTitle('Reset disabled while timer is running');
      expect(resetButton).toBeDisabled();
    });

    it('should show remaining time when running', () => {
      render(<TimerDisplay {...defaultProps} isRunning={true} time={45000} remainingTime="2:15" />);
      expect(screen.getByText(/Remaining: 2:15/)).toBeInTheDocument();
    });
  });

  describe('Paused state', () => {
    it('should show Resume button when paused with time', () => {
      render(<TimerDisplay {...defaultProps} time={45000} isRunning={false} />);
      expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    });

    it('should enable reset button when paused', () => {
      render(<TimerDisplay {...defaultProps} time={45000} isRunning={false} />);
      const resetButton = screen.getByTitle('Reset timer');
      expect(resetButton).not.toBeDisabled();
    });
  });

  describe('Button interactions', () => {
    it('should call onStart when Start button is clicked', () => {
      render(<TimerDisplay {...defaultProps} />);
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
      expect(mockOnStart).toHaveBeenCalledTimes(1);
    });

    it('should call onStop when Stop button is clicked', () => {
      render(<TimerDisplay {...defaultProps} isRunning={true} time={1000} />);
      fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
      expect(mockOnStop).toHaveBeenCalledTimes(1);
    });

    it('should call onStart when Resume button is clicked', () => {
      render(<TimerDisplay {...defaultProps} time={45000} isRunning={false} />);
      fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
      expect(mockOnStart).toHaveBeenCalledTimes(1);
    });

    it('should call onReset when Reset button is clicked', () => {
      render(<TimerDisplay {...defaultProps} />);
      const resetButton = screen.getByTitle('Reset timer');
      fireEvent.click(resetButton);
      expect(mockOnReset).toHaveBeenCalledTimes(1);
    });

    it('should not call onReset when button is disabled', () => {
      render(<TimerDisplay {...defaultProps} isRunning={true} />);
      const resetButton = screen.getByTitle('Reset disabled while timer is running');
      fireEvent.click(resetButton);
      expect(mockOnReset).not.toHaveBeenCalled();
    });
  });

  describe('Warning states', () => {
    it('should apply warning class when warningState is warning', () => {
      const { container } = render(<TimerDisplay {...defaultProps} warningState="warning" time={1000} />);
      expect(container.querySelector('.timer-display-large.warning')).toBeInTheDocument();
    });

    it('should apply expired class when warningState is expired', () => {
      const { container } = render(<TimerDisplay {...defaultProps} warningState="expired" time={1000} />);
      expect(container.querySelector('.timer-display-large.expired')).toBeInTheDocument();
    });

    it('should not apply warning classes when state is normal', () => {
      const { container } = render(<TimerDisplay {...defaultProps} warningState="normal" time={1000} />);
      const display = container.querySelector('.timer-display-large');
      expect(display).not.toHaveClass('warning');
      expect(display).not.toHaveClass('expired');
    });

    it('should display warning message when provided', () => {
      render(<TimerDisplay {...defaultProps} warningMessage="30 seconds remaining" warningState="warning" />);
      expect(screen.getByText('30 seconds remaining')).toBeInTheDocument();
    });

    it('should display expired message when provided', () => {
      render(<TimerDisplay {...defaultProps} warningMessage="Time Expired" warningState="expired" />);
      expect(screen.getByText('Time Expired')).toBeInTheDocument();
    });

    it('should not display warning when message is not provided', () => {
      const { container} = render(<TimerDisplay {...defaultProps} />);
      expect(container.querySelector('.timer-warning')).not.toBeInTheDocument();
    });

    it('should apply expired class to warning message when state is expired', () => {
      const { container } = render(<TimerDisplay {...defaultProps} warningMessage="Time Expired" warningState="expired" />);
      expect(container.querySelector('.timer-warning.expired')).toBeInTheDocument();
    });
  });

  describe('CSS classes', () => {
    it('should have scoresheet-timer-card class', () => {
      const { container } = render(<TimerDisplay {...defaultProps} />);
      expect(container.querySelector('.scoresheet-timer-card')).toBeInTheDocument();
    });

    it('should have timer-controls-flutter class', () => {
      const { container } = render(<TimerDisplay {...defaultProps} />);
      expect(container.querySelector('.timer-controls-flutter')).toBeInTheDocument();
    });

    it('should apply stop class to Stop button', () => {
      const { container } = render(<TimerDisplay {...defaultProps} isRunning={true} time={1000} />);
      expect(container.querySelector('.timer-btn-start.stop')).toBeInTheDocument();
    });

    it('should apply resume class to Resume button', () => {
      const { container } = render(<TimerDisplay {...defaultProps} time={45000} isRunning={false} />);
      expect(container.querySelector('.timer-btn-start.resume')).toBeInTheDocument();
    });

    it('should apply start class to Start button', () => {
      const { container } = render(<TimerDisplay {...defaultProps} />);
      expect(container.querySelector('.timer-btn-start.start')).toBeInTheDocument();
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle complete timing workflow', () => {
      const { rerender } = render(<TimerDisplay {...defaultProps} />);

      // Start timing
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
      expect(mockOnStart).toHaveBeenCalled();

      // Simulate running state
      rerender(<TimerDisplay {...defaultProps} isRunning={true} time={45000} remainingTime="2:15" />);
      expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
      expect(screen.getByText(/Remaining: 2:15/)).toBeInTheDocument();

      // Stop timing
      fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
      expect(mockOnStop).toHaveBeenCalled();

      // Simulate paused state
      rerender(<TimerDisplay {...defaultProps} isRunning={false} time={45000} remainingTime="2:15" />);
      expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();

      // Reset timer
      fireEvent.click(screen.getByTitle('Reset timer'));
      expect(mockOnReset).toHaveBeenCalled();
    });

    it('should handle 30 second warning', () => {
      render(<TimerDisplay {...defaultProps} time={150000} warningState="warning" warningMessage="30 seconds remaining" remainingTime="0:30" />);
      expect(screen.getByText('30 seconds remaining')).toBeInTheDocument();
      expect(screen.getByText(/Remaining: 0:30/)).toBeInTheDocument();
    });

    it('should handle time expiration', () => {
      render(<TimerDisplay {...defaultProps} time={180000} warningState="expired" warningMessage="Time Expired" remainingTime="0:00" />);
      expect(screen.getByText('Time Expired')).toBeInTheDocument();
    });
  });
});
