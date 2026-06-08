import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  ShowPresenceContext,
  type ShowPresenceContextValue,
} from '@/features/show-presence/showPresenceContext';
import { EditingBadge } from '@/features/show-presence/EditingBadge';
import type { ShowPresence } from '@/features/show-presence/types';

// Control the Phase 3 kill switch without pulling in the features const.
const enabled = vi.fn(() => true);
vi.mock('@/features/show-presence/editAwarenessFlag', () => ({
  showEditAwarenessEnabled: () => enabled(),
}));

const mk = (over: Partial<ShowPresence>): ShowPresence => ({
  userId: 'u',
  name: 'Someone',
  role: 'secretary',
  location: { page: '' },
  activity: 'editing',
  ts: 1,
  ...over,
});

const jane = mk({ userId: 'her', name: 'Jane', editing: { entityType: 'entry', entityId: 'e1' } });

const tree = (value: ShowPresenceContextValue, children?: ReactNode) => (
  <ShowPresenceContext.Provider value={value}>
    {children ?? <EditingBadge entityType="entry" entityId="e1" />}
  </ShowPresenceContext.Provider>
);

beforeEach(() => {
  enabled.mockReturnValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('EditingBadge', () => {
  it("shows the other editor's name", () => {
    render(tree({ present: [jane], viewerId: 'me' }));
    expect(screen.getByRole('status').textContent).toContain('Jane is editing this');
  });

  it('renders nothing for self', () => {
    const me = mk({ userId: 'me', name: 'Me', editing: { entityType: 'entry', entityId: 'e1' } });
    const { container } = render(tree({ present: [me], viewerId: 'me' }));
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when nobody else is editing', () => {
    const { container } = render(tree({ present: [], viewerId: 'me' }));
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when the feature is dark', () => {
    enabled.mockReturnValue(false);
    const { container } = render(tree({ present: [jane], viewerId: 'me' }));
    expect(container.firstChild).toBeNull();
  });

  it('exposes an ambient ARIA status region (implicit aria-live=polite)', () => {
    render(tree({ present: [jane], viewerId: 'me' }));
    expect(screen.getByRole('status')).toBeTruthy();
  });
});
