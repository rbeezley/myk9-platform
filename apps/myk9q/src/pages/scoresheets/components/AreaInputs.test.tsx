/**
 * Tests for AreaInputs Component
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AreaInputs, Area } from './AreaInputs';

describe('AreaInputs', () => {
  const mockOnSmartTimeInput = vi.fn();
  const mockOnTimeInputBlur = vi.fn();
  const mockOnClearTime = vi.fn();
  const mockOnRecordTime = vi.fn();
  const mockGetNextEmptyAreaIndex = vi.fn();
  const mockGetMaxTimeForArea = vi.fn();

  const singleArea: Area[] = [
    { time: '' }
  ];

  const multiAreaEmpty: Area[] = [
    { time: '' },
    { time: '' },
    { time: '' },
    { time: '' }
  ];

  const multiAreaPartial: Area[] = [
    { time: '1:23.45' },
    { time: '' },
    { time: '2:15.30' },
    { time: '' }
  ];

  const multiAreaFilled: Area[] = [
    { time: '1:23.45' },
    { time: '1:45.67' },
    { time: '2:15.30' },
    { time: '1:59.99' }
  ];

  const defaultProps = {
    areas: singleArea,
    stopwatchTime: 0,
    isStopwatchRunning: false,
    onSmartTimeInput: mockOnSmartTimeInput,
    onTimeInputBlur: mockOnTimeInputBlur,
    onClearTime: mockOnClearTime,
    onRecordTime: mockOnRecordTime,
    getNextEmptyAreaIndex: mockGetNextEmptyAreaIndex,
    getMaxTimeForArea: mockGetMaxTimeForArea
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetNextEmptyAreaIndex.mockReturnValue(0);
    mockGetMaxTimeForArea.mockReturnValue('02:00');
  });

  describe('Single area rendering', () => {
    it('should render single time input', () => {
      render(<AreaInputs {...defaultProps} />);

      const inputs = screen.getAllByPlaceholderText('Type: 12345 or 1:23.45');
      expect(inputs).toHaveLength(1);
    });

    it('should not show area buttons/badges for single area', () => {
      render(<AreaInputs {...defaultProps} />);

      expect(screen.queryByText(/Record Area/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Area \d+/)).not.toBeInTheDocument();
    });

    it('should apply single-area class to input', () => {
      const { container } = render(<AreaInputs {...defaultProps} />);

      const input = container.querySelector('.scoresheet-time-input');
      expect(input).toHaveClass('single-area');
    });

    it('should show max time display', () => {
      render(<AreaInputs {...defaultProps} />);

      expect(screen.getByText('Max: 02:00')).toBeInTheDocument();
    });

    it('should not show clear button when empty', () => {
      render(<AreaInputs {...defaultProps} />);

      expect(screen.queryByTitle('Clear time')).not.toBeInTheDocument();
    });

    it('should show clear button when time is entered', () => {
      render(<AreaInputs {...defaultProps} areas={[{ time: '1:23.45' }]} />);

      expect(screen.getByTitle('Clear time')).toBeInTheDocument();
    });
  });

  describe('Multi-area rendering', () => {
    it('should render all area inputs', () => {
      render(<AreaInputs {...defaultProps} areas={multiAreaEmpty} />);

      const inputs = screen.getAllByPlaceholderText('Type: 12345 or 1:23.45');
      expect(inputs).toHaveLength(4);
    });

    it('should show record buttons for empty areas', () => {
      render(<AreaInputs {...defaultProps} areas={multiAreaEmpty} />);

      expect(screen.getByText('Record Area 1')).toBeInTheDocument();
      expect(screen.getByText('Record Area 2')).toBeInTheDocument();
      expect(screen.getByText('Record Area 3')).toBeInTheDocument();
      expect(screen.getByText('Record Area 4')).toBeInTheDocument();
    });

    it('should show badges for filled areas', () => {
      render(<AreaInputs {...defaultProps} areas={multiAreaPartial} />);

      const area1Badge = screen.getByText('Area 1');
      const area3Badge = screen.getByText('Area 3');

      expect(area1Badge).toBeInTheDocument();
      expect(area1Badge.closest('.area-badge')).toHaveClass('recorded');
      expect(area3Badge).toBeInTheDocument();
      expect(area3Badge.closest('.area-badge')).toHaveClass('recorded');
    });

    it('should mix buttons and badges correctly', () => {
      render(<AreaInputs {...defaultProps} areas={multiAreaPartial} />);

      // Filled areas show badges
      expect(screen.getByText('Area 1')).toBeInTheDocument();
      expect(screen.getByText('Area 3')).toBeInTheDocument();

      // Empty areas show buttons
      expect(screen.getByText('Record Area 2')).toBeInTheDocument();
      expect(screen.getByText('Record Area 4')).toBeInTheDocument();
    });

    it('should not apply single-area class to multi-area inputs', () => {
      const { container } = render(<AreaInputs {...defaultProps} areas={multiAreaEmpty} />);

      const inputs = container.querySelectorAll('.scoresheet-time-input');
      inputs.forEach(input => {
        expect(input).not.toHaveClass('single-area');
      });
    });

    it('should show max time for all areas', () => {
      render(<AreaInputs {...defaultProps} areas={multiAreaEmpty} />);

      const maxTimeDisplays = screen.getAllByText(/Max:/);
      expect(maxTimeDisplays).toHaveLength(4);
    });
  });

  describe('Next-in-sequence highlighting', () => {
    it('should highlight next empty area when stopwatch stopped with time', () => {
      mockGetNextEmptyAreaIndex.mockReturnValue(1);

      const { container } = render(
        <AreaInputs
          {...defaultProps}
          areas={multiAreaPartial}
          stopwatchTime={45000}
          isStopwatchRunning={false}
        />
      );

      const recordBtn = screen.getByText('Record Area 2');
      expect(recordBtn).toHaveClass('next-in-sequence');
    });

    it('should not highlight when stopwatch is running', () => {
      mockGetNextEmptyAreaIndex.mockReturnValue(0);

      render(
        <AreaInputs
          {...defaultProps}
          areas={multiAreaEmpty}
          stopwatchTime={45000}
          isStopwatchRunning={true}
        />
      );

      const recordBtn = screen.getByText('Record Area 1');
      expect(recordBtn).not.toHaveClass('next-in-sequence');
    });

    it('should not highlight when stopwatch time is zero', () => {
      mockGetNextEmptyAreaIndex.mockReturnValue(0);

      render(
        <AreaInputs
          {...defaultProps}
          areas={multiAreaEmpty}
          stopwatchTime={0}
          isStopwatchRunning={false}
        />
      );

      const recordBtn = screen.getByText('Record Area 1');
      expect(recordBtn).not.toHaveClass('next-in-sequence');
    });

    it('should not highlight non-next areas', () => {
      mockGetNextEmptyAreaIndex.mockReturnValue(1);

      render(
        <AreaInputs
          {...defaultProps}
          areas={multiAreaPartial}
          stopwatchTime={45000}
          isStopwatchRunning={false}
        />
      );

      const recordBtn2 = screen.getByText('Record Area 2');
      const recordBtn4 = screen.getByText('Record Area 4');

      expect(recordBtn2).toHaveClass('next-in-sequence');
      expect(recordBtn4).not.toHaveClass('next-in-sequence');
    });
  });

  describe('Input interactions', () => {
    it('should call onSmartTimeInput on input change', () => {
      render(<AreaInputs {...defaultProps} />);

      const input = screen.getByPlaceholderText('Type: 12345 or 1:23.45');
      fireEvent.change(input, { target: { value: '12345' } });

      expect(mockOnSmartTimeInput).toHaveBeenCalledWith(0, '12345');
    });

    it('should call onTimeInputBlur on blur', () => {
      render(<AreaInputs {...defaultProps} />);

      const input = screen.getByPlaceholderText('Type: 12345 or 1:23.45');
      fireEvent.blur(input, { target: { value: '1:23.45' } });

      expect(mockOnTimeInputBlur).toHaveBeenCalledWith(0, '1:23.45');
    });

    it('should call onClearTime when clear button clicked', () => {
      render(<AreaInputs {...defaultProps} areas={[{ time: '1:23.45' }]} />);

      const clearBtn = screen.getByTitle('Clear time');
      fireEvent.click(clearBtn);

      expect(mockOnClearTime).toHaveBeenCalledWith(0);
    });

    it('should call onRecordTime when record button clicked', () => {
      render(<AreaInputs {...defaultProps} areas={multiAreaEmpty} />);

      const recordBtn = screen.getByText('Record Area 1');
      fireEvent.click(recordBtn);

      expect(mockOnRecordTime).toHaveBeenCalledWith(0);
    });

    it('should handle multiple area interactions independently', () => {
      render(<AreaInputs {...defaultProps} areas={multiAreaEmpty} />);

      const inputs = screen.getAllByPlaceholderText('Type: 12345 or 1:23.45');

      fireEvent.change(inputs[0], { target: { value: '11111' } });
      fireEvent.change(inputs[2], { target: { value: '33333' } });

      expect(mockOnSmartTimeInput).toHaveBeenCalledWith(0, '11111');
      expect(mockOnSmartTimeInput).toHaveBeenCalledWith(2, '33333');
      expect(mockOnSmartTimeInput).toHaveBeenCalledTimes(2);
    });
  });

  describe('Max time display', () => {
    it('should call getMaxTimeForArea with correct index', () => {
      render(<AreaInputs {...defaultProps} areas={multiAreaEmpty} />);

      expect(mockGetMaxTimeForArea).toHaveBeenCalledWith(0);
      expect(mockGetMaxTimeForArea).toHaveBeenCalledWith(1);
      expect(mockGetMaxTimeForArea).toHaveBeenCalledWith(2);
      expect(mockGetMaxTimeForArea).toHaveBeenCalledWith(3);
    });

    it('should display custom max times', () => {
      mockGetMaxTimeForArea.mockImplementation((index) => {
        return index === 0 ? '03:00' : '02:00';
      });

      render(<AreaInputs {...defaultProps} areas={multiAreaEmpty} />);

      expect(screen.getByText('Max: 03:00')).toBeInTheDocument();
      const twoMinDisplays = screen.getAllByText('Max: 02:00');
      expect(twoMinDisplays).toHaveLength(3);
    });

    it('should use default max time when function not provided', () => {
      const { rerender } = render(
        <AreaInputs
          {...defaultProps}
          getMaxTimeForArea={undefined}
        />
      );

      expect(screen.getByText('Max: 02:00')).toBeInTheDocument();
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle Element Specialist workflow (4 areas)', () => {
      const { rerender } = render(
        <AreaInputs
          {...defaultProps}
          areas={multiAreaEmpty}
          stopwatchTime={0}
        />
      );

      // All areas show record buttons initially
      expect(screen.getByText('Record Area 1')).toBeInTheDocument();
      expect(screen.getByText('Record Area 2')).toBeInTheDocument();
      expect(screen.getByText('Record Area 3')).toBeInTheDocument();
      expect(screen.getByText('Record Area 4')).toBeInTheDocument();

      // Record first area
      mockGetNextEmptyAreaIndex.mockReturnValue(1);
      rerender(
        <AreaInputs
          {...defaultProps}
          areas={[{ time: '1:23.45' }, { time: '' }, { time: '' }, { time: '' }]}
          stopwatchTime={85000}
          isStopwatchRunning={false}
        />
      );

      expect(screen.getByText('Area 1')).toBeInTheDocument();
      expect(screen.getByText('Record Area 2')).toHaveClass('next-in-sequence');

      // All areas filled
      rerender(
        <AreaInputs
          {...defaultProps}
          areas={multiAreaFilled}
        />
      );

      expect(screen.getByText('Area 1')).toBeInTheDocument();
      expect(screen.getByText('Area 2')).toBeInTheDocument();
      expect(screen.getByText('Area 3')).toBeInTheDocument();
      expect(screen.getByText('Area 4')).toBeInTheDocument();
      expect(screen.queryByText(/Record Area/)).not.toBeInTheDocument();
    });

    it('should handle single area advanced class workflow', () => {
      const { rerender } = render(
        <AreaInputs {...defaultProps} />
      );

      // No record buttons for single area
      expect(screen.queryByText(/Record/)).not.toBeInTheDocument();

      // Type time manually
      const input = screen.getByPlaceholderText('Type: 12345 or 1:23.45');
      fireEvent.change(input, { target: { value: '12345' } });

      expect(mockOnSmartTimeInput).toHaveBeenCalledWith(0, '12345');

      // Time appears, clear button shows
      rerender(
        <AreaInputs
          {...defaultProps}
          areas={[{ time: '1:23.45' }]}
        />
      );

      expect(screen.getByTitle('Clear time')).toBeInTheDocument();
    });

    it('should handle container search workflow (2 areas)', () => {
      const twoAreas: Area[] = [{ time: '' }, { time: '' }];

      render(
        <AreaInputs
          {...defaultProps}
          areas={twoAreas}
        />
      );

      expect(screen.getByText('Record Area 1')).toBeInTheDocument();
      expect(screen.getByText('Record Area 2')).toBeInTheDocument();

      const inputs = screen.getAllByPlaceholderText('Type: 12345 or 1:23.45');
      expect(inputs).toHaveLength(2);
    });
  });

  describe('CSS structure', () => {
    it('should render scoresheet-time-card containers', () => {
      const { container } = render(<AreaInputs {...defaultProps} areas={multiAreaEmpty} />);

      const cards = container.querySelectorAll('.scoresheet-time-card');
      expect(cards).toHaveLength(4);
    });

    it('should render time-input-flutter wrappers', () => {
      const { container } = render(<AreaInputs {...defaultProps} areas={multiAreaEmpty} />);

      const wrappers = container.querySelectorAll('.time-input-flutter');
      expect(wrappers).toHaveLength(4);
    });

    it('should render scoresheet-time-input-wrapper for inputs', () => {
      const { container } = render(<AreaInputs {...defaultProps} areas={multiAreaEmpty} />);

      const inputWrappers = container.querySelectorAll('.scoresheet-time-input-wrapper');
      expect(inputWrappers).toHaveLength(4);
    });

    it('should render max-time-display for each area', () => {
      const { container } = render(<AreaInputs {...defaultProps} areas={multiAreaEmpty} />);

      const maxDisplays = container.querySelectorAll('.max-time-display');
      expect(maxDisplays).toHaveLength(4);
    });
  });
});
