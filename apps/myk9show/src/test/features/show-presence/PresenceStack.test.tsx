import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { PresenceStack } from '@/features/show-presence/PresenceStack';
import { presenceInitials } from '@/features/show-presence/presenceFormat';
import type { ShowPresence } from '@/features/show-presence/types';

function person(overrides: Partial<ShowPresence> & { userId: string; name: string }): ShowPresence {
  return {
    role: 'exhibitor',
    location: { page: '/' },
    activity: 'viewing',
    ts: 0,
    ...overrides,
  };
}

describe('presenceInitials', () => {
  it('derives initials from one or two name parts', () => {
    expect(presenceInitials('Mariana')).toBe('M');
    expect(presenceInitials('Mariana Lopez')).toBe('ML');
    expect(presenceInitials('  ')).toBe('?');
  });
});

describe('PresenceStack', () => {
  it('renders nothing when no one is present', () => {
    const { container } = render(<PresenceStack present={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('labels how many people are present', () => {
    render(
      <PresenceStack
        present={[person({ userId: 'u1', name: 'Mariana' }), person({ userId: 'u2', name: 'Bob' })]}
      />
    );
    expect(screen.getByLabelText('2 people here')).toBeInTheDocument();
    // Tooltips render as portals (not accessible in jsdom without hover); assert
    // on the avatar fallback initials that are always visible instead.
    expect(screen.getByText('M')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('collapses beyond max into a +N chip', () => {
    const present = Array.from({ length: 6 }, (_, i) =>
      person({ userId: `u${i}`, name: `User ${i}` })
    );
    render(<PresenceStack present={present} max={4} />);

    // 4 shown + the overflow chip
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.getByTitle('2 more')).toBeInTheDocument();
    expect(screen.getByLabelText('6 people here')).toBeInTheDocument();
  });

  it('uses the singular noun for one person', () => {
    render(<PresenceStack present={[person({ userId: 'u1', name: 'Solo' })]} />);
    expect(screen.getByLabelText('1 person here')).toBeInTheDocument();
  });
});
