import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { ASCAScentDetectionScoresheet } from './ASCAScentDetectionScoresheet';
import type { ResolvedClassRules } from '../../../types/resolvedClassRules';

// Mock useStopwatch to avoid real timers in tests
vi.mock('../../../hooks/useStopwatch', () => ({
  useStopwatch: () => ({
    time: 0,
    isRunning: false,
    start: vi.fn(),
    pause: vi.fn(),
    reset: vi.fn(),
    formatTime: () => '0:00.00',
    getRemainingTime: () => '3:00.00',
    getRemainingTimeMs: () => 180000,
    getMaxTimeMs: () => 180000,
    getWarningMessage: () => null,
    shouldShow30SecondWarning: () => false,
    isTimeExpired: () => false,
  }),
}));

// Mock lucide-react icons to simple spans
vi.mock('lucide-react', () => ({
  X: () => <span data-testid="icon-x" />,
  ClipboardCheck: () => <span data-testid="icon-clipboard" />,
  ArrowLeft: () => <span data-testid="icon-arrow-left" />,
  Minus: () => <span data-testid="icon-minus" />,
  Plus: () => <span data-testid="icon-plus" />,
}));

const baseEntry = {
  entryId: '1',
  armband: 77,
  callName: 'Luna',
  breed: 'Border Collie',
  handler: 'Sarah Lee',
  element: 'Interior',
  level: 'Novice',
};

const baseClassInfo = {
  name: 'Interior Novice',
  maxTime: '2:30.00',
  level: 'Novice',
};

const baseProps = {
  entry: baseEntry,
  classInfo: baseClassInfo,
  onSave: vi.fn().mockResolvedValue(undefined),
  onNavigate: vi.fn(),
  onBack: vi.fn(),
  hasNext: true,
  hasPrev: false,
};

describe('ASCAScentDetectionScoresheet', () => {
  it('renders single area when rules.areaCount is 1', () => {
    const rules: ResolvedClassRules = {
      areaCount: 1,
      timerMode: 'single',
      maxTimeSeconds: 150,
      hideCount: 1,
      hidesKnown: true,
      distractionCount: 0,
    };

    render(<ASCAScentDetectionScoresheet {...baseProps} rules={rules} />);

    const inputs = screen.getAllByPlaceholderText(/12345/);
    expect(inputs).toHaveLength(1);
    // Single area shows "Search Time" label
    expect(screen.getByText(/Search Time/i)).toBeInTheDocument();
  });

  it('renders two areas when rules.areaCount is 2', () => {
    const rules: ResolvedClassRules = {
      areaCount: 2,
      timerMode: 'single',
      maxTimeSeconds: 180,
      hideCount: 2,
      hidesKnown: true,
      distractionCount: 0,
    };

    render(<ASCAScentDetectionScoresheet {...baseProps} rules={rules} />);

    const inputs = screen.getAllByPlaceholderText(/12345/);
    expect(inputs).toHaveLength(2);
  });

  it('renders three areas when rules.areaCount is 3', () => {
    const rules: ResolvedClassRules = {
      areaCount: 3,
      timerMode: 'single',
      maxTimeSeconds: 210,
      hideCount: 3,
      hidesKnown: true,
      distractionCount: 0,
    };

    render(<ASCAScentDetectionScoresheet {...baseProps} rules={rules} />);

    const inputs = screen.getAllByPlaceholderText(/12345/);
    expect(inputs).toHaveLength(3);
  });

  it('falls back to 1 area for Novice when no rules provided', () => {
    render(<ASCAScentDetectionScoresheet {...baseProps} />);

    const inputs = screen.getAllByPlaceholderText(/12345/);
    expect(inputs).toHaveLength(1);
  });

  it('falls back to 3 areas for Excellent level when no rules provided', () => {
    render(
      <ASCAScentDetectionScoresheet
        {...baseProps}
        entry={{ ...baseEntry, level: 'Excellent' }}
        classInfo={{ ...baseClassInfo, level: 'Excellent' }}
      />,
    );

    const inputs = screen.getAllByPlaceholderText(/12345/);
    expect(inputs).toHaveLength(3);
  });

  it('rules override level-based fallback', () => {
    // Level says "Excellent" (3 areas via fallback), but rules say 2
    const rules: ResolvedClassRules = {
      areaCount: 2,
      timerMode: 'single',
      maxTimeSeconds: 240,
      hideCount: 2,
      hidesKnown: true,
      distractionCount: 0,
    };

    render(
      <ASCAScentDetectionScoresheet
        {...baseProps}
        entry={{ ...baseEntry, level: 'Excellent' }}
        classInfo={{ ...baseClassInfo, level: 'Excellent' }}
        rules={rules}
      />,
    );

    // Rules win: 2 areas, not 3
    const inputs = screen.getAllByPlaceholderText(/12345/);
    expect(inputs).toHaveLength(2);
  });

  it('renders dog info correctly', () => {
    render(<ASCAScentDetectionScoresheet {...baseProps} />);

    expect(screen.getByText('Luna')).toBeInTheDocument();
    expect(screen.getByText('Border Collie')).toBeInTheDocument();
    expect(screen.getByText(/Sarah Lee/)).toBeInTheDocument();
  });
});
