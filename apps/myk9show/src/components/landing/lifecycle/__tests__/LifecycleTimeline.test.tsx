import { fireEvent, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { LifecycleTimeline as ControlledTimeline } from '../LifecycleTimeline';
import { DEFAULT_AUDIENCE, STORIES, type Audience } from '../lifecycleStories';

// The page owns the audience (Home); this holds it the same way so the switch works here.
function LifecycleTimeline() {
  const [audience, setAudience] = useState<Audience>(DEFAULT_AUDIENCE);
  return <ControlledTimeline audience={audience} onAudienceChange={setAudience} />;
}

vi.mock('../useTimelineProgress', () => ({
  useTimelineProgress: () => ({ isRevealed: () => true }),
}));

const titles = () => screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent);

describe('LifecycleTimeline', () => {
  it('opens on the club story', () => {
    render(<LifecycleTimeline />);
    expect(titles()).toEqual(STORIES.club.map(s => s.title));
    expect(screen.getByRole('button', { name: 'I’m running a show' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('gives every meanwhile line its visible label, under the step’s own text', () => {
    const { container } = render(<LifecycleTimeline />);
    const texts = [...container.querySelectorAll('.lc-meanwhile-text')];
    expect(texts).toHaveLength(STORIES.club.length);
    for (const t of texts) {
      expect(t.querySelector('.lc-meanwhile-label')).toHaveTextContent(
        'Meanwhile, your exhibitors:'
      );
      expect(t.parentElement).toHaveClass('lc-main');
      expect(t.previousElementSibling).toHaveClass('lc-step-body');
    }
    expect(container.querySelector('.lc-labels')).toBeNull();
  });

  it('switches every step to the exhibitor story', () => {
    render(<LifecycleTimeline />);
    fireEvent.click(screen.getByRole('button', { name: 'I’m entering a show' }));
    expect(titles()).toEqual(STORIES.exhibitor.map(s => s.title));
    expect(screen.getByRole('button', { name: 'I’m entering a show' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    const labels = [...document.querySelectorAll('.lc-meanwhile-label')].map(l => l.textContent);
    expect(labels).toEqual(STORIES.exhibitor.map(() => 'Meanwhile, the club: '));
  });

  it('switching audience keeps the same row nodes, so progress observers stay attached', () => {
    render(<LifecycleTimeline />);
    const showday = document.getElementById('showday');
    const before = document.getElementById('before');
    fireEvent.click(screen.getByRole('button', { name: 'I’m entering a show' }));
    expect(document.getElementById('showday')).toBe(showday);
    expect(document.getElementById('before')).toBe(before);
    expect(document.body.contains(showday)).toBe(true);
  });

  it('marks show day as the peak with its lead line and the internet switch', () => {
    render(<LifecycleTimeline />);
    const peak = document.getElementById('showday')!;
    expect(peak).toHaveAttribute('data-peak', 'true');
    expect(
      within(peak).getByText('Then show day arrives, and the venue has no internet.')
    ).toBeInTheDocument();
    expect(within(peak).getByRole('switch', { name: 'Venue internet' })).toBeInTheDocument();
  });

  // Review Focus 7
  it('switching audience mid-demo does not crash; each side shows its own show-day piece', () => {
    render(<LifecycleTimeline />);
    const peak = () => document.getElementById('showday')!;
    fireEvent.click(within(peak()).getByRole('switch', { name: 'Venue internet' }));
    fireEvent.click(within(peak()).getByRole('button', { name: 'Start' }));
    fireEvent.click(screen.getByRole('button', { name: 'I’m entering a show' }));
    expect(within(peak()).getByText('1 of 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'I’m running a show' }));
    expect(within(peak()).getByRole('switch', { name: 'Venue internet' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  it('has no numbered rail, dots or connecting line', () => {
    const { container } = render(<LifecycleTimeline />);
    expect(container.querySelectorAll('.lc-rail, .lc-dot, .lc-line, [id$="-dot"]')).toHaveLength(0);
  });

  // Reading order: the words (the step's text, then the meanwhile line), then the step's still
  // or demo, then its scene, so a screen reader and a phone's single column meet them in order.
  it('renders each step as its words, then its still or demo, then its scene', () => {
    const { container } = render(<LifecycleTimeline />);
    for (const row of container.querySelectorAll('.lc-row')) {
      const parts = [...row.children].map(c => c.className);
      expect(parts[0]).toBe('lc-main');
      expect(parts.slice(1).every(p => p === 'lc-media' || p === 'lc-scene')).toBe(true);
      expect(parts.filter(p => p === 'lc-media').length).toBeLessThanOrEqual(1);
      expect(row.hasAttribute('data-media')).toBe(parts.includes('lc-media'));
      if (parts.includes('lc-media') && parts.includes('lc-scene')) {
        expect(parts.indexOf('lc-media')).toBeLessThan(parts.indexOf('lc-scene'));
      }
    }
    const sceneRows = container.querySelectorAll('.lc-row .lc-scene');
    expect(sceneRows.length).toBeGreaterThan(0);
    for (const slot of sceneRows) {
      expect(slot.querySelectorAll('.tl-scene')).toHaveLength(1);
      expect(slot.nextElementSibling).toBeNull();
    }
    fireEvent.click(screen.getByRole('button', { name: 'I’m entering a show' }));
    const showday = document.getElementById('showday')!;
    const slot = showday.querySelector('.lc-scene')!;
    expect(showday.querySelectorAll('.tl-scene')).toHaveLength(1);
    expect(slot).toHaveAttribute('data-side', 'meanwhile');
    expect(slot.parentElement).toBe(showday);
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
