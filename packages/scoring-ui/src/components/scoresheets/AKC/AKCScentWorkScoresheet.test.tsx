import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { AKCScentWorkScoresheet } from './AKCScentWorkScoresheet';
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
}));

const baseEntry = {
  entryId: '1',
  armband: 101,
  callName: 'Buddy',
  breed: 'Labrador',
  handler: 'Jane Smith',
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

describe('AKCScentWorkScoresheet', () => {
  it('renders single area by default when no rules provided', () => {
    render(<AKCScentWorkScoresheet {...baseProps} />);

    // Single area: exactly one time input
    const inputs = screen.getAllByPlaceholderText(/12345/);
    expect(inputs).toHaveLength(1);
  });

  it('renders single area when rules.areaCount is 1', () => {
    const rules: ResolvedClassRules = {
      areaCount: 1,
      timerMode: 'single',
      maxTimeSeconds: 120,
      hideCount: 1,
      hidesKnown: true,
      distractionCount: 0,
    };

    render(<AKCScentWorkScoresheet {...baseProps} rules={rules} />);

    const inputs = screen.getAllByPlaceholderText(/12345/);
    expect(inputs).toHaveLength(1);
  });

  it('renders three areas when rules.areaCount is 3', () => {
    const rules: ResolvedClassRules = {
      areaCount: 3,
      timerMode: 'single',
      maxTimeSeconds: 300,
      hideCount: 3,
      hidesKnown: true,
      distractionCount: 0,
    };

    render(<AKCScentWorkScoresheet {...baseProps} rules={rules} />);

    // Three time inputs for three areas
    const inputs = screen.getAllByPlaceholderText(/12345/);
    expect(inputs).toHaveLength(3);
  });

  it('renders two areas when rules.areaCount is 2', () => {
    const rules: ResolvedClassRules = {
      areaCount: 2,
      timerMode: 'single',
      maxTimeSeconds: 240,
      hideCount: 2,
      hidesKnown: true,
      distractionCount: 0,
    };

    render(<AKCScentWorkScoresheet {...baseProps} rules={rules} />);

    const inputs = screen.getAllByPlaceholderText(/12345/);
    expect(inputs).toHaveLength(2);
  });

  it('renders dog info correctly', () => {
    render(<AKCScentWorkScoresheet {...baseProps} />);

    expect(screen.getByText('Buddy')).toBeInTheDocument();
    expect(screen.getByText('Labrador')).toBeInTheDocument();
    expect(screen.getByText(/Jane Smith/)).toBeInTheDocument();
  });
});
