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

  it('gives every meanwhile line a screen-reader-only label', () => {
    const { container } = render(<LifecycleTimeline />);
    const texts = [...container.querySelectorAll('.lc-meanwhile-text')];
    expect(texts).toHaveLength(STORIES.club.length);
    for (const t of texts) {
      expect(t.querySelector('.sr-only')).toHaveTextContent('Meanwhile, your exhibitors:');
    }
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

  it('switching audience keeps the same row nodes, so progress observers stay attached', () => {
    const { container } = render(<LifecycleTimeline />);
    const showday = document.getElementById('showday');
    const before = document.getElementById('before');
    fireEvent.click(screen.getByRole('button', { name: 'I’m entering a show' }));
    expect(document.getElementById('showday')).toBe(showday);
    expect(document.getElementById('before')).toBe(before);
    expect(document.body.contains(showday)).toBe(true);
    expect(document.getElementById('results')!.querySelector('.lc-trail')).toHaveAttribute(
      'data-after-find',
      'true'
    );
    expect(before!.querySelector('.lc-trail')).toHaveAttribute('data-after-find', 'false');
    expect(container.querySelectorAll('svg.lc-trail')).toHaveLength(5);
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

  // Review Focus 7
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

  // D10
  it('draws a scent trail between every pair of steps, with Alert at Results only', () => {
    const { container } = render(<LifecycleTimeline />);
    expect(container.querySelectorAll('svg.lc-trail')).toHaveLength(5);
    expect(container.querySelectorAll('.lc-alert')).toHaveLength(1);
    expect(document.getElementById('results')!.querySelector('.lc-alert')).not.toBeNull();
  });

  // D11
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
