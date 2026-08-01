/**
 * MYK9-138. Selecting a club used to be a one-way door — once the context
 * resolved to `ready`, the chooser never rendered again and the only way to
 * manage a different club was to reload the app. Every site admin now has many
 * clubs, so this is the common case, not an edge one.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ClubSwitcher } from './ClubSwitcher';

const clubs = [
  { id: 'club-a', name: 'Alpha Club' },
  { id: 'club-b', name: 'Beta Club' },
];

describe('ClubSwitcher', () => {
  it('renders nothing for a single club', () => {
    // An ordinary single-club admin has no choice to make; a disabled control
    // would be noise on every page load.
    const { container } = render(
      <ClubSwitcher clubs={[clubs[0]]} selectedClubId="club-a" onSelectClub={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when there are no clubs', () => {
    const { container } = render(
      <ClubSwitcher clubs={[]} selectedClubId="" onSelectClub={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('offers a control naming the current club when there are several', () => {
    render(<ClubSwitcher clubs={clubs} selectedClubId="club-b" onSelectClub={vi.fn()} />);
    expect(screen.getByRole('button', { name: /beta club/i })).toBeInTheDocument();
  });

  it('prompts for a choice when nothing is selected yet', () => {
    render(<ClubSwitcher clubs={clubs} selectedClubId="" onSelectClub={vi.fn()} />);
    expect(screen.getByRole('button', { name: /choose a club/i })).toBeInTheDocument();
  });
});
