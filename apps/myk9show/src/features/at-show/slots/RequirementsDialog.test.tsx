/**
 * MYK9-1100: ringside Requirements shows the class's rules from the shared
 * requirement cards, offline from the class itself, and leads with the class's
 * saved max time, which opens Set Max Time for those who can set it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@/test/utils/testUtils';

const { getClassById, useRequirements } = vi.hoisted(() => ({
  getClassById: vi.fn(),
  useRequirements: vi.fn(),
}));
vi.mock('@/services/replication', () => ({
  replicatedClassesTable: { getClassById },
}));
vi.mock('@/hooks/queries/useClassRequirements', () => ({
  useClassRequirements: (options: unknown) => useRequirements(options),
}));

import { ClassRequirementsDialog } from './RequirementsDialog';

const classData = {
  id: 'c1',
  element: 'Interior',
  level: 'Excellent',
  class_name: 'Interior Excellent A',
  entry_count: 12,
  registry: 'AKC',
  per_area_times: true,
};

const cls = {
  id: 'c1',
  name: 'Interior Excellent A',
  element: 'Interior',
  level: 'Excellent',
  areaCount: 2,
  hideCount: 3,
  hidesKnown: false,
  distractionCount: 1,
  timerMode: 'single',
  timeLimitSeconds: 90,
  timeLimitArea2Seconds: 150,
  timeLimitRule: { min: 60, max: 180, forElement: 'Interior', forLevel: 'Excellent' },
};

describe('ringside ClassRequirementsDialog (MYK9-1100)', () => {
  beforeEach(() => {
    getClassById.mockReset().mockResolvedValue(cls);
    // Offline: the full rule query has nothing.
    useRequirements
      .mockReset()
      .mockReturnValue({ requirements: null, isLoading: false, error: null });
  });

  it('shows the rules offline from the class, led by its saved max times', async () => {
    render(<ClassRequirementsDialog isOpen onClose={vi.fn()} classData={classData} />);

    expect(await screen.findByText('Area 1 1:30 · Area 2 2:30')).toBeInTheDocument();
    expect(screen.getByText('1:00–3:00')).toBeInTheDocument();
    expect(screen.getByText('Judge sets within range')).toBeInTheDocument();
    expect(screen.getByText('Number of hides unknown (blind)')).toBeInTheDocument();
    expect(screen.getByText('Search Areas')).toBeInTheDocument();
    expect(screen.getByText('Interior Excellent · 12 entries')).toBeInTheDocument();
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

  it('is read-only for someone who cannot set the time', async () => {
    render(<ClassRequirementsDialog isOpen onClose={vi.fn()} classData={classData} />);
    await screen.findByText(/Area 1 1:30/);
    expect(screen.queryByRole('button', { name: /set max time/i })).not.toBeInTheDocument();
  });

  it('says Not set when the class has no max time', async () => {
    getClassById.mockResolvedValue({
      ...cls,
      timeLimitSeconds: undefined,
      timeLimitArea2Seconds: undefined,
    });
    render(<ClassRequirementsDialog isOpen onClose={vi.fn()} classData={classData} />);
    expect(await screen.findByText('Not set')).toBeInTheDocument();
  });

  it('uses the full rule when it loads online', async () => {
    useRequirements.mockReturnValue({
      requirements: {
        organization: 'AKC',
        element: 'Interior',
        level: 'Excellent',
        hides: '1–3',
        distractions: '',
        time_limit_text: '1:00–3:00',
        time_type: 'range',
        area_count: 2,
        hides_known: false,
        has_blank: true,
        timer_mode: 'single',
        odors: ['Birch', 'Anise'],
      },
      isLoading: false,
      error: null,
    });
    render(<ClassRequirementsDialog isOpen onClose={vi.fn()} classData={classData} />);
    expect(await screen.findByText('Birch, Anise')).toBeInTheDocument();
    expect(screen.getByText('Blank Area')).toBeInTheDocument();
  });
});
