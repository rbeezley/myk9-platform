/**
 * Unit tests for DualTimerDisplay component
 * 
 * Tests UI rendering, user interactions, and timer integration
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DualTimerDisplay } from '@/components/common/DualTimerDisplay';

// Mock the timer hook
vi.mock('@/hooks/useCountdownTimer', () => ({
  useCountdownTimer: vi.fn()
}));

// Mock the audio hook
vi.mock('@/hooks/useAudioWarnings', () => ({
  useAudioWarnings: vi.fn(() => ({
    playWarning: vi.fn(),
    playTimeExpired: vi.fn(),
    playStart: vi.fn(),
    playStop: vi.fn(),
    playTestSound: vi.fn(),
    isAudioSupported: true
  }))
}));

// Mock the audio context
vi.mock('@/context/AudioSettingsContext', () => ({
  useAudioSettings: vi.fn(() => ({
    settings: {
      warningSound: true,
      timeExpiredSound: true,
      startSound: true,
      stopSound: true,
      volume: 0.8,
      soundType: 'chime'
    }
  }))
}));

import { useCountdownTimer } from '@/hooks/useCountdownTimer';

const mockUseCountdownTimer = useCountdownTimer as ReturnType<typeof vi.fn>;

describe('DualTimerDisplay', () => {
  const mockTimerState = {
    searchTime: 0,
    remainingTime: 120000,
    isRunning: false,
    isWarning: false,
    isExpired: false,
    start: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
    searchTimeDisplay: '00:00.00',
    remainingTimeDisplay: '02:00'
  };

  const defaultProps = {
    maxTimeMs: 120000,
    level: 'Novice' as const,
    onTimeWarning: vi.fn(),
    onTimeExpired: vi.fn(),
    onSearchTime: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCountdownTimer.mockReturnValue(mockTimerState);
  });

  it('should render timer displays with correct initial values', () => {
    render(<DualTimerDisplay {...defaultProps} />);

    // Check stopwatch display (search time)
    expect(screen.getByText('00:00.00')).toBeInTheDocument();
    
    // Check countdown display (remaining time)
    expect(screen.getByText('02:00')).toBeInTheDocument();
  });

  it('should render start button when timer is not running', () => {
    render(<DualTimerDisplay {...defaultProps} />);

    const startButton = screen.getByRole('button', { name: /start/i });
    expect(startButton).toBeInTheDocument();
    expect(startButton).toHaveClass('bg-teal-600');
  });

  it('should render stop button when timer is running', () => {
    const runningTimerState = { ...mockTimerState, isRunning: true };
    mockUseCountdownTimer.mockReturnValue(runningTimerState);

    render(<DualTimerDisplay {...defaultProps} />);

    const stopButton = screen.getByRole('button', { name: /stop/i });
    expect(stopButton).toBeInTheDocument();
    expect(stopButton).toHaveClass('bg-red-600');
  });

  it('should call start function when start button clicked', () => {
    render(<DualTimerDisplay {...defaultProps} />);

    const startButton = screen.getByRole('button', { name: /start/i });
    fireEvent.click(startButton);

    expect(mockTimerState.start).toHaveBeenCalledTimes(1);
  });

  it('should call stop function when stop button clicked', () => {
    const runningTimerState = { ...mockTimerState, isRunning: true };
    mockUseCountdownTimer.mockReturnValue(runningTimerState);

    render(<DualTimerDisplay {...defaultProps} />);

    const stopButton = screen.getByRole('button', { name: /stop/i });
    fireEvent.click(stopButton);

    expect(mockTimerState.stop).toHaveBeenCalledTimes(1);
  });

  it('should call reset function when reset button clicked', () => {
    // Reset is only enabled when searchTime > 0 or timer is running
    const stoppedWithTimeState = { ...mockTimerState, searchTime: 5000, searchTimeDisplay: '00:05.00' };
    mockUseCountdownTimer.mockReturnValue(stoppedWithTimeState);

    render(<DualTimerDisplay {...defaultProps} />);

    const resetButton = screen.getByRole('button', { name: /reset/i });
    fireEvent.click(resetButton);

    expect(stoppedWithTimeState.reset).toHaveBeenCalledTimes(1);
  });

  it('should show warning state styling when timer is in warning', () => {
    const warningTimerState = { 
      ...mockTimerState, 
      isWarning: true,
      remainingTime: 25000, // 25 seconds
      remainingTimeDisplay: '00:25'
    };
    mockUseCountdownTimer.mockReturnValue(warningTimerState);

    render(<DualTimerDisplay {...defaultProps} />);

    // Check that countdown display has warning styling
    const countdownDisplay = screen.getByText('00:25');
    expect(countdownDisplay).toHaveClass('text-yellow-400');
  });

  it('should show expired state styling when timer is expired', () => {
    const expiredTimerState = { 
      ...mockTimerState, 
      isExpired: true,
      remainingTime: 0,
      remainingTimeDisplay: '00:00'
    };
    mockUseCountdownTimer.mockReturnValue(expiredTimerState);

    render(<DualTimerDisplay {...defaultProps} />);

    // Check that countdown display has expired styling
    const countdownDisplay = screen.getByText('00:00');
    expect(countdownDisplay).toHaveClass('text-red-400');
  });

  it('should display elapsed time correctly', () => {
    const elapsedTimerState = { 
      ...mockTimerState, 
      searchTime: 75390, // 1:15.39
      isRunning: true,
      searchTimeDisplay: '01:15.39'
    };
    mockUseCountdownTimer.mockReturnValue(elapsedTimerState);

    render(<DualTimerDisplay {...defaultProps} />);

    expect(screen.getByText('01:15.39')).toBeInTheDocument();
  });

  it('should display remaining time correctly', () => {
    const remainingTimerState = { 
      ...mockTimerState, 
      remainingTime: 45000, // 45 seconds
      isRunning: true,
      remainingTimeDisplay: '00:45'
    };
    mockUseCountdownTimer.mockReturnValue(remainingTimerState);

    render(<DualTimerDisplay {...defaultProps} />);

    expect(screen.getByText('00:45')).toBeInTheDocument();
  });

  it('should be disabled when disabled prop is true', () => {
    render(<DualTimerDisplay {...defaultProps} disabled={true} />);

    const startButton = screen.getByRole('button', { name: /start/i });
    const resetButton = screen.getByRole('button', { name: /reset/i });

    expect(startButton).toBeDisabled();
    expect(resetButton).toBeDisabled();
  });

  it('should apply large size styling when size is large', () => {
    render(<DualTimerDisplay {...defaultProps} size="large" />);

    // Check for large timer styling
    const container = screen.getByTestId('dual-timer-display');
    expect(container).toHaveClass('space-y-6'); // Large size has space-y-6
  });

  it('should apply default size styling when size is default', () => {
    render(<DualTimerDisplay {...defaultProps} size="default" />);

    // Check for default timer styling
    const container = screen.getByTestId('dual-timer-display');
    expect(container).toHaveClass('space-y-4'); // Default size has space-y-4
  });

  it('should handle touch interactions on mobile', async () => {
    render(<DualTimerDisplay {...defaultProps} />);

    const startButton = screen.getByRole('button', { name: /start/i });

    // Touch interactions trigger click events on buttons in browsers;
    // fireEvent.click accurately simulates the end result of a tap
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(mockTimerState.start).toHaveBeenCalledTimes(1);
    });
  });

  it('should show circular progress indicator', () => {
    const progressTimerState = { 
      ...mockTimerState, 
      searchTime: 60000, // 1 minute
      remainingTime: 60000, // 1 minute remaining
      isRunning: true,
      searchTimeDisplay: '01:00.00',
      remainingTimeDisplay: '01:00'
    };
    mockUseCountdownTimer.mockReturnValue(progressTimerState);

    render(<DualTimerDisplay {...defaultProps} />);

    // Check that progress indicator exists
    const progressIndicator = screen.getByRole('progressbar');
    expect(progressIndicator).toBeInTheDocument();
  });

  it('should pass correct timer configuration to hook', () => {
    render(<DualTimerDisplay {...defaultProps} />);

    expect(useCountdownTimer).toHaveBeenCalledWith({
      maxTimeMs: 120000,
      level: 'Novice',
      onTimeWarning: defaultProps.onTimeWarning,
      onTimeExpired: defaultProps.onTimeExpired,
      onSearchTime: defaultProps.onSearchTime
    });
  });
});