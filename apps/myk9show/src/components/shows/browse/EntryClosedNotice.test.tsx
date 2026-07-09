import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EntryClosedNotice } from './EntryClosedNotice';
import type { Show } from '@/types/show-types';

const { canEnter } = vi.hoisted(() => ({ canEnter: vi.fn() }));
vi.mock('@/utils/entryStatusUtils', () => ({
  getEntryStatus: () => ({ canEnter: canEnter() }),
}));

const show = (id: string): Show => ({ id }) as Show;

describe('EntryClosedNotice', () => {
  beforeEach(() => canEnter.mockReset());

  it('renders nothing off the "all" tab', () => {
    canEnter.mockReturnValue(false);
    const { container } = render(<EntryClosedNotice shows={[show('a')]} selectedTab="entries" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the list is empty (EmptyState owns that)', () => {
    const { container } = render(<EntryClosedNotice shows={[]} selectedTab="all" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when at least one show can be entered', () => {
    canEnter.mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { container } = render(
      <EntryClosedNotice shows={[show('closed'), show('open')]} selectedTab="all" />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the notice when the list is non-empty but nothing is enterable', () => {
    canEnter.mockReturnValue(false);
    render(<EntryClosedNotice shows={[show('a'), show('b')]} selectedTab="all" />);
    expect(screen.getByText('No shows are open for entries right now')).toBeInTheDocument();
  });
});
