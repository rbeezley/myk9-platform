import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { ListResultLine } from '../ListResultLine';

const NOUN = ['user', 'users'] as const;

describe('ListResultLine', () => {
  it('says "Showing all N" when nothing is filtered, with no Show all button', () => {
    render(
      <ListResultLine shown={214} total={214} noun={NOUN} filtered={false} onShowAll={vi.fn()} />
    );
    expect(screen.getByRole('status')).toHaveTextContent('Showing all 214 users.');
    expect(screen.queryByRole('button', { name: /show all/i })).not.toBeInTheDocument();
  });

  it('can stay quiet until the list is narrowed, then speaks', () => {
    const { rerender } = render(
      <ListResultLine
        quietWhenUnfiltered
        shown={23}
        total={23}
        noun={NOUN}
        filtered={false}
        onShowAll={vi.fn()}
      />
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    rerender(
      <ListResultLine
        quietWhenUnfiltered
        shown={5}
        total={23}
        noun={NOUN}
        filtered
        onShowAll={vi.fn()}
      />
    );
    expect(screen.getByRole('status').textContent).toBe('Showing 5 of 23 users.');
  });

  it('is a polite live region', () => {
    render(<ListResultLine shown={1} total={1} noun={NOUN} filtered={false} onShowAll={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('status')).toHaveTextContent('Showing all 1 user.');
  });

  it('says "Showing X of Y" while filtered and "Show all" clears it', async () => {
    const onShowAll = vi.fn();
    const { user } = render(
      <ListResultLine shown={12} total={214} noun={NOUN} filtered onShowAll={onShowAll} />
    );
    // Count and noun only: the dropdowns beside the list already show every filter.
    expect(screen.getByRole('status').textContent).toBe('Showing 12 of 214 users.');
    await user.click(screen.getByRole('button', { name: 'Show all users' }));
    expect(onShowAll).toHaveBeenCalledOnce();
  });

  it('renders nothing until the data is ready', () => {
    render(
      <ListResultLine
        ready={false}
        shown={0}
        total={0}
        noun={NOUN}
        filtered={false}
        onShowAll={vi.fn()}
      />
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('can opt out of being its own live region', () => {
    render(
      <ListResultLine
        announce={false}
        shown={2}
        total={2}
        noun={NOUN}
        filtered={false}
        onShowAll={vi.fn()}
      />
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('Showing all 2 users.')).toBeInTheDocument();
  });

  it('offers "Select all" only for a partial selection', async () => {
    const onSelectAll = vi.fn();
    const { rerender, user } = render(
      <ListResultLine
        shown={40}
        total={90}
        noun={NOUN}
        filtered
        onShowAll={vi.fn()}
        selectAll={{ selectedCount: 0, onSelectAll }}
      />
    );
    expect(screen.queryByRole('button', { name: /select all/i })).not.toBeInTheDocument();

    rerender(
      <ListResultLine
        shown={40}
        total={90}
        noun={NOUN}
        filtered
        onShowAll={vi.fn()}
        selectAll={{ selectedCount: 3, onSelectAll }}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Select all 40 users' }));
    expect(onSelectAll).toHaveBeenCalledOnce();

    rerender(
      <ListResultLine
        shown={40}
        total={90}
        noun={NOUN}
        filtered
        onShowAll={vi.fn()}
        selectAll={{ selectedCount: 40, onSelectAll }}
      />
    );
    expect(screen.queryByRole('button', { name: /select all/i })).not.toBeInTheDocument();
  });
});
