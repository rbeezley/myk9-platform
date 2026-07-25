import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { HealthTimeline, type HealthEvent } from './HealthTimeline';

// Source guard: HealthTimeline's header/filter reflow must be driven by the
// measured content-container width (useElementWidth), not viewport media
// queries. Mocking this hook is the only way to force the narrow layout in
// jsdom, which has no real box layout.
const useElementWidthMock = vi.fn();
vi.mock('@/hooks/useElementWidth', () => ({
  useElementWidth: () => useElementWidthMock(),
}));

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

const events: HealthEvent[] = [
  {
    id: 'event-1',
    type: 'vaccination',
    title: 'Rabies Vaccination',
    date: new Date('2026-02-14T12:00:00Z'),
    status: 'completed',
  },
];

describe('HealthTimeline container-aware reflow', () => {
  beforeEach(() => {
    useElementWidthMock.mockReset();
  });

  it('keeps every filter control operable in a wide container', () => {
    useElementWidthMock.mockReturnValue({ ref: { current: null }, width: 1200 });
    render(<HealthTimeline dogId="dog-123" events={events} />);

    expect(screen.getByLabelText(/search health records/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/filter by year/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /toggle timeline view mode/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /import records/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export timeline/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add event/i })).toBeInTheDocument();

    const header = screen.getByTestId('health-timeline-header');
    expect(header.className).toContain('flex-wrap');
    expect(header.className).not.toContain('flex-col');
  });

  it('reflows header and filters into a stacked, full-width layout when the container is narrow', () => {
    useElementWidthMock.mockReturnValue({ ref: { current: null }, width: 360 });
    render(<HealthTimeline dogId="dog-123" events={events} />);

    // Every control is still present and operable — nothing is dropped or
    // hidden behind a CSS-only breakpoint.
    expect(screen.getByLabelText(/search health records/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/filter by year/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /toggle timeline view mode/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add event/i })).toBeInTheDocument();

    const header = screen.getByTestId('health-timeline-header');
    expect(header.className).toContain('flex-col');

    const filters = screen.getByTestId('health-timeline-filters');
    expect(filters.className).toContain('flex-col');
  });

  it('does not render two CSS-hidden copies of the same controls', () => {
    useElementWidthMock.mockReturnValue({ ref: { current: null }, width: 360 });
    render(<HealthTimeline dogId="dog-123" events={events} />);

    // A duplicated-controls antipattern would produce two matches; the
    // container-aware reshape keeps exactly one live node per control.
    expect(screen.getAllByLabelText(/search health records/i)).toHaveLength(1);
    expect(screen.getAllByLabelText(/filter by year/i)).toHaveLength(1);
  });
});
