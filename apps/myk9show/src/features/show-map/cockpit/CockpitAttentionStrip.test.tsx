import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render } from '@/test/utils/testUtils';
import type { ShowMapTree } from '../showMapTypes';
import { buildSecretaryCockpitSnapshot } from './buildSecretaryCockpitSnapshot';
import { CockpitAttentionStrip } from './CockpitAttentionStrip';

// The strip starts folded on a phone (MYK9-1727); each test picks the width.
const phone = vi.hoisted(() => ({ value: false }));
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => phone.value }));
import type { SecretaryCockpitAttention } from './secretaryCockpitTypes';

const items: SecretaryCockpitAttention[] = [
  {
    id: 'a',
    classId: 'class-1',
    kind: 'blocker',
    label: 'Score sheets not printed',
    reason: 'Starts 10:45',
    destination: { kind: 'href', href: '/print/class-1' },
  },
  {
    id: 'b',
    kind: 'closeout',
    label: "Collect judge's initials",
    reason: "Completed class still needs the judge's initials",
    destination: { kind: 'command', commandId: 'sign:class-2' },
  },
  {
    id: 'c',
    kind: 'administrative',
    label: 'Closeout unreadable',
    reason: 'Could not be checked',
    destination: null,
  },
];

function renderStrip(onCommand = vi.fn()) {
  return {
    onCommand,
    ...render(
      <CockpitAttentionStrip
        items={items}
        all={items}
        overflowCount={0}
        classNameById={new Map([['class-1', 'Container Novice A']])}
        onCommand={onCommand}
      />
    ),
  };
}

describe('CockpitAttentionStrip', () => {
  beforeEach(() => {
    phone.value = false;
  });

  it('names the class on its pill and links to where the fix happens', () => {
    renderStrip();

    const link = screen.getByRole('link', {
      name: 'Container Novice A · Score sheets not printed',
    });
    expect(link).toHaveAttribute('href', '/print/class-1');
    expect(link).toHaveAttribute('title', 'Starts 10:45');
    // Touch and screen readers get the reason too: a title is never read out or shown on a phone.
    expect(link).toHaveAccessibleDescription('Starts 10:45');
  });

  it('names the destination of a pending-work chip in its accessible name (MYK9-1618)', () => {
    const snapshot = buildSecretaryCockpitSnapshot({
      showId: 'show-1',
      trials: [],
      classes: [],
      tree: { nodes: {}, rootIds: [], diagnostics: [] } as unknown as ShowMapTree,
      pendingSignals: [
        {
          id: 'entries-waiting-checkin',
          count: 2,
          priority: 'high',
          label: 'Check in 2 entries',
          destinationName: 'Check-in desk',
          href: '/shows/show-1/entries?tab=exceptions&exception=check-in&checkin=pending',
          scope: { kind: 'show', showId: 'show-1' },
        },
      ],
      returnTo: '/shows/show-1',
      now: new Date('2026-07-20T15:10:00.000Z'),
    });
    const attention = snapshot.administrativeAttention ?? [];
    render(
      <CockpitAttentionStrip
        items={attention}
        all={attention}
        overflowCount={0}
        classNameById={new Map()}
        onCommand={vi.fn()}
      />
    );

    const chip = screen.getByRole('link', { name: 'Check in 2 entries, opens Check-in desk' });
    expect(chip).toHaveTextContent(/^Check in 2 entries$/);
    expect(chip).toHaveAttribute(
      'href',
      `/shows/show-1/entries?tab=exceptions&exception=check-in&checkin=pending&returnTo=${encodeURIComponent('/shows/show-1')}`
    );
  });

  it('runs a command pill through onCommand', async () => {
    const { user, onCommand } = renderStrip();

    await user.click(screen.getByRole('button', { name: "Collect judge's initials" }));

    expect(onCommand).toHaveBeenCalledWith('sign:class-2');
  });

  it('shows an item with nowhere to go as plain text, not a dead control', () => {
    renderStrip();

    expect(screen.getByText('Closeout unreadable').tagName).toBe('SPAN');
    expect(screen.queryByRole('button', { name: 'Closeout unreadable' })).not.toBeInTheDocument();
  });

  it('keeps every pill and the overflow control at the 44px touch floor and caption type', () => {
    render(
      <CockpitAttentionStrip
        items={items}
        all={[...items, { ...items[0]!, id: 'd' }]}
        overflowCount={1}
        classNameById={new Map()}
        onCommand={vi.fn()}
      />
    );
    const section = screen.getByRole('region', { name: /needs attention/i });
    const controls = [
      ...section.querySelectorAll('a, button:not([aria-expanded])'),
      screen.getByText('Closeout unreadable'),
    ];
    expect(screen.getByRole('button', { name: /needs attention/i })).toHaveClass('min-h-11');

    expect(controls).toHaveLength(4);
    for (const control of controls) {
      expect(control).toHaveClass('min-h-11', 'text-xs');
      // No hard-coded size under the 14px floor (docs/INTENT.md).
      expect(control.className).not.toMatch(/text-\[\d+px\]/);
    }
  });

  it('reveals the remainder on request', async () => {
    const { user } = render(
      <CockpitAttentionStrip
        items={items.slice(0, 1)}
        all={items}
        overflowCount={2}
        classNameById={new Map()}
        onCommand={vi.fn()}
      />
    );

    expect(screen.queryByText('Closeout unreadable')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View 2 more issues' }));
    expect(screen.getByText('Closeout unreadable')).toBeInTheDocument();
  });

  // MYK9-1727: on a phone every pill takes its own row, so the heading folds them away.
  it('folds and unfolds the pills from its heading, keeping the count', async () => {
    const { user } = renderStrip();
    const toggle = screen.getByRole('button', { name: /needs attention · 3/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Closeout unreadable')).not.toBeInTheDocument();
    expect(toggle).toHaveTextContent('Needs attention · 3');

    await user.click(toggle);
    expect(screen.getByText('Closeout unreadable')).toBeInTheDocument();
  });

  it('starts folded on a phone and opens on request', async () => {
    phone.value = true;
    const { user } = renderStrip();
    const toggle = screen.getByRole('button', { name: /needs attention · 3/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Closeout unreadable')).not.toBeInTheDocument();

    await user.click(toggle);
    expect(screen.getByText('Closeout unreadable')).toBeInTheDocument();
  });
});
