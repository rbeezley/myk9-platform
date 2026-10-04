import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { render } from '@/test/utils/testUtils';
import { SecretaryCockpit } from './SecretaryCockpit';
import type { SecretaryCockpitSnapshot } from './secretaryCockpitTypes';

const snapshot: SecretaryCockpitSnapshot = {
  showId: 'show-1',
  timeZone: 'America/Chicago',
  registryId: 'AKC',
  now: new Date('2026-07-20T14:00:00.000Z'),
  trials: [{ id: 'trial-1', date: '2026-07-20', number: '1', order: 0 }],
  classes: [
    {
      id: 'class-1',
      trialId: 'trial-1',
      name: 'Container Novice',
      classOrder: 0,
      lifecycle: 'not-started',
      entryCount: 10,
      scoredCount: 0,
      actions: [],
      paperwork: [],
      entryRows: [],
      attention: Array.from({ length: 5 }, (_, index) => ({
        id: `issue-${index + 1}`,
        kind: 'blocker' as const,
        label: `Issue ${index + 1}`,
        reason: `Resolve issue ${index + 1}`,
        destination: { kind: 'href' as const, href: `/issues/${index + 1}` },
      })),
    },
  ],
};

describe('SecretaryCockpit attention remainder', () => {
  it('expands every ranked issue instead of leaving the remainder unreachable', async () => {
    const { user } = render(
      <SecretaryCockpit snapshot={snapshot} canManageShow onCommand={vi.fn()} />,
      { initialRoute: '/shows/show-1/show-day' }
    );

    const focusedClass = screen.getByRole('button', { name: 'Container Novice' });
    expect(focusedClass).toHaveAttribute('aria-pressed', 'true');
    expect(document.getElementById('cockpit-anchor-class-1')?.className).toContain(
      'border-primary'
    );
    const attentionStrip = screen.getByRole('region', { name: /needs attention/i });
    const issueLinks = () =>
      within(attentionStrip)
        .getAllByRole('link')
        .filter(link => link.getAttribute('href')?.startsWith('/issues/'));

    expect(issueLinks()).toHaveLength(3);
    // One strip of pills, each naming its class (layout A).
    expect(issueLinks()[0]).toHaveTextContent('Container Novice · Issue 1');
    await user.click(screen.getByRole('button', { name: 'View 2 more issues' }));
    expect(issueLinks()).toHaveLength(5);
  });
});

function twoClassSnapshot(): SecretaryCockpitSnapshot {
  const base = snapshot.classes[0]!;
  return {
    ...snapshot,
    classes: [
      { ...base, attention: [] },
      { ...base, id: 'class-2', name: 'Interior Novice', classOrder: 1, attention: [] },
    ],
  };
}

describe('SecretaryCockpit class selection (show home overview)', () => {
  const originalScrollIntoView = Element.prototype.scrollIntoView;
  afterEach(() => {
    Element.prototype.scrollIntoView = originalScrollIntoView;
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
  });

  it('focuses the selected class without scrolling the page', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const { user } = render(
      <SecretaryCockpit snapshot={twoClassSnapshot()} canManageShow onCommand={vi.fn()} />,
      { initialRoute: '/shows/show-1' }
    );
    scrollIntoView.mockClear();

    await user.click(screen.getByRole('button', { name: 'Interior Novice' }));

    expect(screen.getByRole('button', { name: 'Interior Novice' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    // The secretary is looking at the row they clicked. Moving the page carried
    // the focused panel off screen and slid rows under the pointer.
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('still restores the anchored class when the page opens with one', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    render(<SecretaryCockpit snapshot={twoClassSnapshot()} canManageShow onCommand={vi.fn()} />, {
      initialRoute: '/shows/show-1?focus=class-2&anchor=class-2',
    });

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toHaveAttribute('id', 'cockpit-anchor-class-2');
  });

  it('does not scroll to the default class when the page opens', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    window.history.replaceState(null, '', '/shows/show-1');
    render(<SecretaryCockpit snapshot={twoClassSnapshot()} canManageShow onCommand={vi.fn()} />, {
      initialRoute: '',
    });

    // Recorded for a returnTo link, without moving the page now.
    expect(window.location.search).toContain('focus=class-1&anchor=class-1');
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('drops a pending return scroll once the secretary starts using the page', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const view = render(
      <SecretaryCockpit
        snapshot={{ ...twoClassSnapshot(), classes: [] }}
        canManageShow
        onCommand={vi.fn()}
      />,
      { initialRoute: '/shows/show-1?focus=class-2&anchor=class-2' }
    );

    window.dispatchEvent(new Event('wheel'));
    view.rerender(
      <SecretaryCockpit snapshot={twoClassSnapshot()} canManageShow onCommand={vi.fn()} />
    );

    expect(screen.getByRole('button', { name: 'Interior Novice' })).toBeInTheDocument();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('selects a class from anywhere on its card, but not from its own controls', async () => {
    const { user } = render(
      <SecretaryCockpit
        snapshot={twoClassSnapshot()}
        canManageShow
        onCommand={vi.fn()}
        entryBreakdownByClassId={new Map([['class-2', { entered: 1, pending: 2 }]])}
      />,
      { initialRoute: '/shows/show-1' }
    );
    const card = document.getElementById('cockpit-anchor-class-2')!;
    const nameButton = within(card).getByRole('button', { name: 'Interior Novice' });
    // Keep the link from navigating, so only the card's own handler is observed.
    card.addEventListener('click', event => event.preventDefault(), { capture: true });

    await user.click(within(card).getByRole('link', { name: '2 pending in Interior Novice' }));
    expect(nameButton).toHaveAttribute('aria-pressed', 'false');

    // The card's plain text, well below the name row.
    await user.click(within(card).getByText(/of 7 steps done/));
    expect(nameButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('draws one square per checklist item on each class card', () => {
    render(<SecretaryCockpit snapshot={twoClassSnapshot()} canManageShow onCommand={vi.fn()} />, {
      initialRoute: '/shows/show-1',
    });
    const strip = within(document.getElementById('cockpit-anchor-class-2')!).getByTestId(
      'class-checklist-strip'
    );
    const squares = strip.querySelectorAll('[data-state]');

    expect(squares).toHaveLength(7);
    expect(within(strip).getByText(/^\d of 7 steps done/)).toBeInTheDocument();
  });

  it('shows "N of M scored" in place of the entered count once scoring has begun', () => {
    const base = twoClassSnapshot();
    const snapshotScoring: SecretaryCockpitSnapshot = {
      ...base,
      classes: base.classes.map(cls =>
        cls.id === 'class-2'
          ? { ...cls, lifecycle: 'in-progress', entryCount: 3, scoredCount: 1 }
          : cls
      ),
    };
    render(
      <SecretaryCockpit
        snapshot={snapshotScoring}
        canManageShow
        onCommand={vi.fn()}
        entryBreakdownByClassId={
          new Map([
            ['class-1', { entered: 4, pending: 0 }],
            ['class-2', { entered: 3, pending: 1 }],
          ])
        }
      />,
      { initialRoute: '/shows/show-1' }
    );
    const scoring = document.getElementById('cockpit-anchor-class-2')!;
    const notStarted = document.getElementById('cockpit-anchor-class-1')!;

    expect(within(scoring).getByText('1 of 3 scored')).toBeInTheDocument();
    expect(within(scoring).queryByText(/entered/)).toBeNull();
    expect(
      within(scoring).getByRole('link', { name: '1 pending in Interior Novice' })
    ).toBeVisible();
    // Before scoring can begin, the entered count stays.
    expect(within(notStarted).getByText('4 entered')).toBeInTheDocument();
    expect(within(notStarted).queryByText(/scored/)).toBeNull();
  });

  it('writes the URL once per click on the class name', async () => {
    // A real browser history: a memory router folds two same-tick writes into
    // one render, which hid the name button and its row both handling a click.
    window.history.replaceState(null, '', '/shows/show-1');
    const { user } = render(
      <SecretaryCockpit snapshot={twoClassSnapshot()} canManageShow onCommand={vi.fn()} />,
      { initialRoute: '' }
    );
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const pushState = vi.spyOn(window.history, 'pushState');

    await user.click(screen.getByRole('button', { name: 'Interior Novice' }));

    expect(replaceState.mock.calls.length + pushState.mock.calls.length).toBe(1);
    expect(window.location.search).toContain('focus=class-2');
  });
});
