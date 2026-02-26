import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { UKCNoseworkScoresheet } from './UKCNoseworkScoresheet';
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
  Search: () => <span data-testid="icon-search" />,
  ArrowLeft: () => <span data-testid="icon-arrow-left" />,
}));

const baseEntry = {
  entryId: '1',
  armband: 42,
  callName: 'Rex',
  breed: 'German Shepherd',
  handler: 'John Doe',
  element: 'Container',
  level: 'Novice',
};

const baseClassInfo = {
  name: 'Container Novice',
  maxTime: '2:00.00',
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

describe('UKCNoseworkScoresheet', () => {
  it('renders single timer mode when rules.timerMode is single', () => {
    const rules: ResolvedClassRules = {
      areaCount: 1,
      timerMode: 'single',
      maxTimeSeconds: 120,
      hideCount: 1,
      hidesKnown: true,
      distractionCount: 0,
    };

    render(<UKCNoseworkScoresheet {...baseProps} rules={rules} />);

    // Single timer: one time input, no element time section
    const inputs = screen.getAllByPlaceholderText(/12345/);
    expect(inputs).toHaveLength(1);
    expect(screen.queryByText(/Element Time/i)).not.toBeInTheDocument();
  });

  it('renders dual timer mode when rules.timerMode is dual', () => {
    const rules: ResolvedClassRules = {
      areaCount: 1,
      timerMode: 'dual',
      maxTimeSeconds: 180,
      hideCount: 3,
      hidesKnown: false,
      distractionCount: 0,
    };

    render(
      <UKCNoseworkScoresheet
        {...baseProps}
        entry={{ ...baseEntry, level: 'Superior' }}
        classInfo={{ ...baseClassInfo, level: 'Superior' }}
        rules={rules}
      />,
    );

    // Dual timer: two time inputs (search + element)
    const inputs = screen.getAllByPlaceholderText(/12345/);
    expect(inputs).toHaveLength(2);
    // Element time section rendered
    expect(screen.getAllByText(/Element Time/i).length).toBeGreaterThanOrEqual(1);
  });

  it('falls back to level-based dual timer for Superior when no rules', () => {
    render(
      <UKCNoseworkScoresheet
        {...baseProps}
        entry={{ ...baseEntry, level: 'Superior' }}
        classInfo={{ ...baseClassInfo, level: 'Superior' }}
      />,
    );

    // isDualTimerLevel fallback triggers dual mode for Superior
    const inputs = screen.getAllByPlaceholderText(/12345/);
    expect(inputs).toHaveLength(2);
  });

  it('renders single timer for Novice when no rules provided', () => {
    render(<UKCNoseworkScoresheet {...baseProps} />);

    const inputs = screen.getAllByPlaceholderText(/12345/);
    expect(inputs).toHaveLength(1);
    expect(screen.queryByText(/Element Time/i)).not.toBeInTheDocument();
  });

  it('renders dog info correctly', () => {
    render(<UKCNoseworkScoresheet {...baseProps} />);

    expect(screen.getByText('Rex')).toBeInTheDocument();
    expect(screen.getByText('German Shepherd')).toBeInTheDocument();
    expect(screen.getByText(/John Doe/)).toBeInTheDocument();
  });
});
