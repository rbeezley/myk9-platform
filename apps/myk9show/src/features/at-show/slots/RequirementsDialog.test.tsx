/**
 * MYK9-1100: ringside Requirements shows the class's rules from the shared
 * requirement cards, offline from the rule cached on the class, read live, and
 * leads with the class's saved max time, which opens Set Max Time for those who
 * can set it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent } from '@/test/utils/testUtils';

const replica = vi.hoisted(() => {
  const rows = new Map<string, Record<string, unknown>>();
  const listeners = new Set<() => void>();
  return {
    rows,
    listeners,
    getClassById: vi.fn(async (id: string) => rows.get(id) ?? null),
    subscribe: vi.fn((listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
  };
});
vi.mock('@/services/replication', () => ({
  replicatedClassesTable: { getClassById: replica.getClassById, subscribe: replica.subscribe },
}));

import { ClassRequirementsDialog } from './RequirementsDialog';

const classData = {
  id: 'c1',
  element: 'Interior',
  level: 'Master',
  class_name: 'Interior Master',
  entry_count: 12,
  registry: 'AKC',
  per_area_times: true,
};

const rule = {
  min: 60,
  max: 180,
  forElement: 'Interior',
  forLevel: 'Master',
  display: {
    hideFixed: null,
    hideMin: 2,
    hideMax: 6,
    hidesKnown: false,
    distractionMin: 1,
    distractionMax: 2,
    areaCount: 3,
    hasBlank: true,
    timerMode: 'single',
    odors: ['Birch', 'Anise', 'Clove'],
  },
};

function seed(over: Record<string, unknown> = {}) {
  replica.rows.set('c1', {
    id: 'c1',
    element: 'Interior',
    level: 'Master',
    areaCount: 3,
    hideCount: 4,
    timeLimitSeconds: 90,
    timeLimitArea2Seconds: 120,
    timeLimitArea3Seconds: 150,
    timeLimitRule: rule,
    ...over,
  });
}

describe('ringside ClassRequirementsDialog (MYK9-1100)', () => {
  beforeEach(() => {
    replica.rows.clear();
    replica.listeners.clear();
    seed();
  });

  it('shows the cached rule offline, led by the saved max time per area', async () => {
    render(<ClassRequirementsDialog isOpen onClose={vi.fn()} classData={classData} />);

    expect(await screen.findByText('Area 1 1:30 · Area 2 2:00 · Area 3 2:30')).toBeInTheDocument();
    expect(screen.getByText('1:00–3:00')).toBeInTheDocument();
    // The rule's range, not the class's chosen total.
    expect(screen.getByText('2–6')).toBeInTheDocument();
    expect(screen.getByText('Birch, Anise, Clove')).toBeInTheDocument();
    expect(screen.getByText('Blank Area')).toBeInTheDocument();
    expect(screen.getByText('Interior Master · 12 entries')).toBeInTheDocument();
  });

  it('falls back to the class values for a rule cached before display fields', async () => {
    seed({ timeLimitRule: { ...rule, display: undefined } });
    render(<ClassRequirementsDialog isOpen onClose={vi.fn()} classData={classData} />);
    expect(await screen.findByText('4')).toBeInTheDocument();
  });

  it('shows a max time saved elsewhere without reopening', async () => {
    render(<ClassRequirementsDialog isOpen onClose={vi.fn()} classData={classData} />);
    await screen.findByText(/Area 1 1:30/);

    seed({ timeLimitSeconds: 180 });
    await act(async () => replica.listeners.forEach(listener => listener()));

    expect(await screen.findByText(/Area 1 3:00/)).toBeInTheDocument();
  });

  it('opens Set Max Time from the max time card', async () => {
    const onSetMaxTime = vi.fn();
    render(
      <ClassRequirementsDialog
        isOpen
        onClose={vi.fn()}
        onSetMaxTime={onSetMaxTime}
        classData={classData}
      />
    );
    fireEvent.click(await screen.findByRole('button', { name: /set max time/i }));
    expect(onSetMaxTime).toHaveBeenCalled();
  });

  it('is read-only for someone who cannot set the time, and says Not set', async () => {
    seed({
      timeLimitSeconds: undefined,
      timeLimitArea2Seconds: undefined,
      timeLimitArea3Seconds: undefined,
    });
    render(<ClassRequirementsDialog isOpen onClose={vi.fn()} classData={classData} />);
    expect(await screen.findByText('Not set')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /set max time/i })).not.toBeInTheDocument();
  });

  it('notes No 30-second warning only when the cached rule says so', async () => {
    seed({ timeLimitRule: { ...rule, thirtySecondWarning: false } });
    const { unmount } = render(
      <ClassRequirementsDialog isOpen onClose={vi.fn()} classData={classData} />
    );
    expect(await screen.findByText(/No 30-second warning/)).toBeInTheDocument();
    unmount();

    seed({ timeLimitRule: { ...rule, thirtySecondWarning: undefined } });
    render(<ClassRequirementsDialog isOpen onClose={vi.fn()} classData={classData} />);
    await screen.findByText(/Area 1 1:30/);
    expect(screen.queryByText(/No 30-second warning/)).not.toBeInTheDocument();
  });
});
