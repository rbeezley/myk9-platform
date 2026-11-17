/**
 * MYK9-2118: Show Desk's class panel shows the class's Requirements and its current time limit,
 * read live from the class replica (so offline), through the component Ringside's dialog uses.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@/test/utils/testUtils';

const replica = vi.hoisted(() => {
  const rows = new Map<string, Record<string, unknown>>();
  return {
    rows,
    getClassById: vi.fn(async (id: string) => rows.get(id) ?? null),
    subscribe: vi.fn(() => () => undefined),
  };
});
vi.mock('@/services/replication', () => ({
  replicatedClassesTable: { getClassById: replica.getClassById, subscribe: replica.subscribe },
}));

import { FocusedClassRequirements } from './FocusedClassRequirements';

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

describe('FocusedClassRequirements (MYK9-2118)', () => {
  beforeEach(() => {
    replica.rows.clear();
  });

  it('shows a one-area class its single time limit and its requirements', async () => {
    replica.rows.set('c1', {
      id: 'c1',
      element: 'Interior',
      level: 'Master',
      areaCount: 1,
      timeLimitSeconds: 120,
      timeLimitRule: {
        ...rule,
        display: { ...rule.display, areaCount: 1, hasBlank: false, odors: ['Birch'] },
      },
    });
    render(<FocusedClassRequirements classId="c1" registryId="AKC" />);

    expect(await screen.findByText('Time limit: 2:00')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /requirements/i }));
    expect(await screen.findByText('1:00–3:00')).toBeInTheDocument();
    expect(screen.getByText('2–6')).toBeInTheDocument();
    expect(screen.getByText('Birch')).toBeInTheDocument();
    expect(screen.queryByText(/Area 2/)).not.toBeInTheDocument();
  });

  it("shows a three-area class each area's time limit", async () => {
    replica.rows.set('c3', {
      id: 'c3',
      element: 'Interior',
      level: 'Master',
      areaCount: 3,
      timeLimitSeconds: 90,
      timeLimitArea2Seconds: 120,
      timeLimitArea3Seconds: 150,
      timeLimitRule: rule,
    });
    render(<FocusedClassRequirements classId="c3" registryId="AKC" />);

    expect(
      await screen.findByText('Time limit: Area 1 1:30 · Area 2 2:00 · Area 3 2:30')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /requirements/i }));
    expect(await screen.findByText('Birch, Anise, Clove')).toBeInTheDocument();
    expect(screen.getByText('Blank Area')).toBeInTheDocument();
  });

  it('says Not set and that the rules are missing when the class has neither', async () => {
    replica.rows.set('c0', { id: 'c0', element: 'Interior', level: 'Master' });
    render(<FocusedClassRequirements classId="c0" registryId="AKC" />);
    expect(await screen.findByText('Time limit: Not set')).toBeInTheDocument();
  });
});
