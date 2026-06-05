import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ComponentProps } from 'react';
import { AttentionNeededStrip } from '../AttentionNeededStrip';
import type { AttentionItem } from '@/hooks/useMyShows';

// Capture every props payload `Link` was rendered with so we can assert no
// handlers (onClick, etc.) are wired onto navigation anchors. The DOM-level
// `onclick` attribute check is insufficient because React doesn't project
// synthetic `onClick` handlers to the `onclick` HTML attribute.
const linkPropCaptures: Array<Record<string, unknown>> = [];

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    Link: (props: ComponentProps<typeof actual.Link>) => {
      linkPropCaptures.push(props as unknown as Record<string, unknown>);
      return <actual.Link {...props} />;
    },
  };
});

beforeEach(() => {
  linkPropCaptures.length = 0;
  localStorage.clear();
});

function renderStrip(items: AttentionItem[]) {
  return render(
    <MemoryRouter>
      <AttentionNeededStrip items={items} />
    </MemoryRouter>
  );
}

describe('AttentionNeededStrip', () => {
  it('renders null when items is empty', () => {
    const { container } = renderStrip([]);
    expect(container.firstChild).toBeNull();
  });

  it('renders the "Needs attention" header when items exist', () => {
    renderStrip([
      { showId: 's1', showName: 'Spring Trial', kind: 'urgent', text: 'Check-in open', href: '/shows/s1' },
    ]);
    expect(screen.getByText(/needs attention/i)).toBeInTheDocument();
  });

  it('renders each item text and show name', () => {
    renderStrip([
      { showId: 's1', showName: 'Spring Trial', kind: 'urgent', text: 'Check-in open', href: '/shows/s1' },
      { showId: 's2', showName: 'Fall Classic', kind: 'info', text: 'Entries close in 3 days', href: '/shows/s2' },
    ]);
    expect(screen.getByText('Check-in open')).toBeInTheDocument();
    expect(screen.getByText('Spring Trial')).toBeInTheDocument();
    expect(screen.getByText('Entries close in 3 days')).toBeInTheDocument();
    expect(screen.getByText('Fall Classic')).toBeInTheDocument();
  });

  it('links each item to its href', () => {
    renderStrip([
      { showId: 's1', showName: 'Spring Trial', kind: 'urgent', text: 'Check-in open', href: '/shows/s1' },
    ]);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/shows/s1');
  });

  it('renders multiple items as separate links', () => {
    renderStrip([
      { showId: 's1', showName: 'A', kind: 'urgent', text: 'Item 1', href: '/shows/s1' },
      { showId: 's2', showName: 'B', kind: 'info', text: 'Item 2', href: '/shows/s2' },
      { showId: 's3', showName: 'C', kind: 'info', text: 'Item 3', href: '/shows/s3' },
    ]);
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });

  it('defaults long attention queues collapsed, expands on demand, and persists the choice', async () => {
    const user = userEvent.setup();
    const items: AttentionItem[] = [
      { showId: 's1', showName: 'Show 1', kind: 'info', text: 'Item 1', href: '/shows/s1' },
      { showId: 's2', showName: 'Show 2', kind: 'info', text: 'Item 2', href: '/shows/s2' },
      { showId: 's3', showName: 'Show 3', kind: 'info', text: 'Item 3', href: '/shows/s3' },
      { showId: 's4', showName: 'Show 4', kind: 'info', text: 'Item 4', href: '/shows/s4' },
    ];

    const { unmount } = renderStrip(items);

    const toggle = screen.getByRole('button', { name: /show 4 attention items/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('4 items need attention')).toBeInTheDocument();
    const controlledId = toggle.getAttribute('aria-controls');
    expect(controlledId).toBeTruthy();
    const controlledContent = document.getElementById(controlledId!);
    expect(controlledContent).toHaveAttribute('hidden');
    expect(controlledContent).toHaveClass('hidden');
    expect(controlledContent).not.toHaveClass('flex');
    expect(screen.queryByRole('link', { name: /item 1/i })).not.toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(controlledContent).not.toHaveAttribute('hidden');
    expect(controlledContent).toHaveClass('flex');
    expect(controlledContent).not.toHaveClass('hidden');
    expect(screen.getAllByRole('link')).toHaveLength(4);

    unmount();
    renderStrip(items);

    expect(screen.getByRole('button', { name: /hide 4 attention items/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(screen.getAllByRole('link')).toHaveLength(4);
  });

  // D4 regression: the dashboard is a "where to go" surface, not an "act here"
  // surface. Every attention item MUST be a navigation primitive — no in-place
  // mutation buttons. This test fails if a future PR adds a `<button onClick={mutate}>`
  // inside the strip, forcing an explicit decision to either (a) keep the strip
  // nav-only and move the action elsewhere, or (b) update this assertion and the
  // plan that wrote it. See docs/plan-dashboard-refocus.md phase D4.
  it('renders only navigation primitives — no buttons / no mutation handlers', () => {
    const { container } = renderStrip([
      { showId: 's1', showName: 'Spring Trial', kind: 'urgent', text: 'Item A', href: '/shows/s1' },
      { showId: 's2', showName: 'Fall Classic', kind: 'info', text: 'Item B', href: '/shows/s2' },
    ]);
    // Every attention item is an <a> tag; the only button is the section-level
    // collapse toggle.
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelectorAll('a')).toHaveLength(2);
  });

  // L4 regression hardening: the original "no <button>" assertion above passes
  // even if someone adds `<a href onClick={mutate}>` — a write surface masquerading
  // as a link. Per user memory `feedback_modal_mode_suppression`, when locking a
  // component as nav-only we must enumerate EVERY interactive primitive: button +
  // anchor handlers + role="button" (tabIndex/onKeyDown patterns).
  it('renders anchors with no onClick (or any other handler) wired up', () => {
    renderStrip([
      { showId: 's1', showName: 'Spring Trial', kind: 'urgent', text: 'Item A', href: '/shows/s1' },
      { showId: 's2', showName: 'Fall Classic', kind: 'info', text: 'Item B', href: '/shows/s2' },
    ]);
    // Sanity: the Link mock fired once per item.
    expect(linkPropCaptures).toHaveLength(2);
    // Each captured Link must not carry a handler prop. onClick is the load-bearing
    // one (covers the leak shape), but we also block sibling handler shapes that
    // a future PR might reach for.
    const forbidden = ['onClick', 'onMouseDown', 'onMouseUp', 'onKeyDown', 'onKeyUp'];
    for (const props of linkPropCaptures) {
      for (const handler of forbidden) {
        expect(props[handler]).toBeUndefined();
      }
    }
  });

  it('renders no extra role="button" elements inside the attention item list', () => {
    renderStrip([
      { showId: 's1', showName: 'Spring Trial', kind: 'urgent', text: 'Item A', href: '/shows/s1' },
      { showId: 's2', showName: 'Fall Classic', kind: 'info', text: 'Item B', href: '/shows/s2' },
    ]);
    expect(screen.queryAllByRole('button')).toHaveLength(1);
  });
});
