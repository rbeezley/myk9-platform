import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { LifecycleTimeline } from '../LifecycleTimeline';
import { trailPath } from '../TimelineStep';
import { STORIES } from '../lifecycleStories';

vi.mock('../useTimelineProgress', () => ({
  useTimelineProgress: () => ({ reached: 2, isRevealed: () => true }),
}));

const titles = () => screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent);

describe('trailPath', () => {
  it('starts and ends on the dot axis and mirrors by side', () => {
    expect(trailPath(1)).toMatch(/^M 48 0 .* 48 100$/);
    expect(trailPath(1)).not.toBe(trailPath(-1));
  });
});

describe('LifecycleTimeline', () => {
  it('opens on the club story', () => {
    render(<LifecycleTimeline />);
    expect(titles()).toEqual(STORIES.club.map(s => s.title));
    expect(screen.getByRole('button', { name: 'I’m running a show' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('switches every step to the exhibitor story', () => {
    render(<LifecycleTimeline />);
    fireEvent.click(screen.getByRole('button', { name: 'I’m entering a show' }));
    expect(titles()).toEqual(STORIES.exhibitor.map(s => s.title));
    expect(screen.getByRole('button', { name: 'I’m entering a show' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByText('Meanwhile, the club')).toBeInTheDocument();
  });

  it('switching audience keeps revealed steps visible', () => {
    const { container } = render(<LifecycleTimeline />);
    fireEvent.click(screen.getByRole('button', { name: 'I’m entering a show' }));
    const rows = container.querySelectorAll('[data-revealed]');
    expect(Array.from(rows).every(r => r.getAttribute('data-revealed') === 'true')).toBe(true);
  });

  it('fills dots up to the reached step only', () => {
    render(<LifecycleTimeline />);
    const reached = STORIES.club.map(s =>
      document.getElementById(`${s.id}-dot`)!.getAttribute('data-reached')
    );
    expect(reached).toEqual(['true', 'true', 'false', 'false', 'false', 'false']);
  });

  it('marks show day as the peak with its lead line and the signal switch', () => {
    render(<LifecycleTimeline />);
    const peak = document.getElementById('showday')!;
    expect(peak).toHaveAttribute('data-peak', 'true');
    expect(
      within(peak).getByText('Then show day arrives, and the venue has no signal.')
    ).toBeInTheDocument();
    expect(within(peak).getByRole('switch', { name: 'Venue signal' })).toBeInTheDocument();
  });

  // [ADDED] Review Focus 7
  it('switching audience mid-demo does not crash; each side shows its own show-day piece', () => {
    render(<LifecycleTimeline />);
    const peak = () => document.getElementById('showday')!;
    fireEvent.click(within(peak()).getByRole('switch', { name: 'Venue signal' }));
    fireEvent.click(within(peak()).getByRole('button', { name: 'Start' }));
    fireEvent.click(screen.getByRole('button', { name: 'I’m entering a show' }));
    expect(within(peak()).getByText('1 of 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'I’m running a show' }));
    expect(within(peak()).getByRole('switch', { name: 'Venue signal' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  // [ADDED] D10
  it('draws a scent trail between every pair of steps, with Alert at Results only', () => {
    const { container } = render(<LifecycleTimeline />);
    expect(container.querySelectorAll('svg.lc-trail')).toHaveLength(5);
    expect(container.querySelectorAll('.lc-alert')).toHaveLength(1);
    expect(document.getElementById('results')!.querySelector('.lc-alert')).not.toBeNull();
  });

  // [ADDED] D11
  it('shows the night-before card in the club story and the running-order screenshot for exhibitors', () => {
    render(<LifecycleTimeline />);
    const before = () => document.getElementById('before')!;
    expect(within(before()).getByText('Ready for show day')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'I’m entering a show' }));
    expect(within(before()).queryByText('Ready for show day')).toBeNull();
    expect(
      within(before()).getByRole('img', { name: STORIES.exhibitor[2]!.shot!.alt })
    ).toBeInTheDocument();
  });

  it('caps phone screenshots at phone width', () => {
    render(<LifecycleTimeline />);
    fireEvent.click(screen.getByRole('button', { name: 'I’m entering a show' }));
    const runOrder = screen.getByRole('img', { name: STORIES.exhibitor[2]!.shot!.alt });
    expect(runOrder.closest('[data-shape]')).toHaveAttribute('data-shape', 'phone');
  });
});
