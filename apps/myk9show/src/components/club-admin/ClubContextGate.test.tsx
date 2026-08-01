/**
 * MYK9-138. The defect was a MISSING BRANCH: the old inline ternary named only
 * `ambiguous` and `missing`, so every other status fell through to "check your
 * connection" — reporting an authorization gap as a network failure. These
 * tests are table-driven over the full status union so a new status cannot be
 * added without a message.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { ClubContextGate } from './ClubContextGate';
import {
  describeClubContext as describeContext,
  type MessagedClubContext,
  type UnresolvedClubContext,
} from './clubContextMessages';

const clubs = [
  { id: 'club-a', name: 'Alpha Club' },
  { id: 'club-b', name: 'Beta Club' },
];

function renderGate(context: UnresolvedClubContext, onSelectClub = vi.fn(), onRetry = vi.fn()) {
  render(
    <ClubContextGate
      context={context}
      surface="members"
      onRetry={onRetry}
      onSelectClub={onSelectClub}
    />
  );
  return { onSelectClub, onRetry };
}

describe('ClubContextGate — every status has its own sentence', () => {
  const ALL: UnresolvedClubContext[] = [
    { status: 'not-applicable' },
    { status: 'loading' },
    { status: 'unavailable' },
    { status: 'missing', scopeIds: [] },
    { status: 'missing', scopeIds: ['club-a'] },
    { status: 'choose', clubs },
  ];

  it('produces a distinct message for each non-choose status', () => {
    const messages = ALL.filter(c => c.status !== 'choose').map(
      c => describeContext(c as MessagedClubContext, 'members').message
    );
    expect(new Set(messages).size).toBe(messages.length);
  });

  it('never blames the network for an authorization problem', () => {
    // The exact regression: `not-applicable` had no branch and inherited the
    // connectivity copy.
    const { message } = describeContext({ status: 'not-applicable' }, 'members');
    expect(message).not.toMatch(/connection/i);
    expect(message).toMatch(/club administrator access/i);
  });

  it('keeps the connectivity message for a genuine readiness failure', () => {
    expect(describeContext({ status: 'unavailable' }, 'members').message).toMatch(/connection/i);
  });

  it('distinguishes "no clubs exist" from "your access needs configuring"', () => {
    expect(describeContext({ status: 'missing', scopeIds: [] }, 'members').message).toMatch(
      /no clubs set up/i
    );
    expect(describeContext({ status: 'missing', scopeIds: ['x'] }, 'members').message).toMatch(
      /access needs to be configured/i
    );
  });

  it('names the surface it is gating', () => {
    expect(describeContext({ status: 'not-applicable' }, 'payments').message).toContain('payments');
  });
});

describe('ClubContextGate — rendering', () => {
  it('marks only transient failures as retryable', () => {
    expect(describeContext({ status: 'unavailable' }, 'members').canRetry).toBe(true);
    expect(describeContext({ status: 'not-applicable' }, 'members').canRetry).toBe(false);
    expect(describeContext({ status: 'missing', scopeIds: [] }, 'members').canRetry).toBe(false);
  });

  it('offers a retry only when retrying could help', () => {
    renderGate({ status: 'unavailable' });
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('does not offer a retry for an authorization gap', () => {
    // Retrying a permissions problem just wastes the operator's time.
    renderGate({ status: 'not-applicable' });
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
  });

  it('lists every club as a choice instead of an error', () => {
    renderGate({ status: 'choose', clubs });
    expect(screen.getByRole('button', { name: 'Alpha Club' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Beta Club' })).toBeInTheDocument();
    expect(screen.queryByText(/ask an administrator/i)).not.toBeInTheDocument();
  });

  it('selects the club the operator picks', () => {
    const { onSelectClub } = renderGate({ status: 'choose', clubs });
    fireEvent.click(screen.getByRole('button', { name: 'Beta Club' }));
    expect(onSelectClub).toHaveBeenCalledWith('club-b');
  });
});
