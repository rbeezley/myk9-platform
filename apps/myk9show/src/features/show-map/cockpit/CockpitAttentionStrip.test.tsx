import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { render } from '@/test/utils/testUtils';
import { CockpitAttentionStrip } from './CockpitAttentionStrip';
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
  it('names the class on its pill and links to where the fix happens', () => {
    renderStrip();

    const link = screen.getByRole('link', {
      name: 'Container Novice A · Score sheets not printed',
    });
    expect(link).toHaveAttribute('href', '/print/class-1');
    expect(link).toHaveAttribute('title', 'Starts 10:45');
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
      ...section.querySelectorAll('a, button'),
      screen.getByText('Closeout unreadable'),
    ];

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
});
