import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { ListResultLine } from '../ListResultLine';

const NOUN = ['user', 'users'] as const;

describe('ListResultLine', () => {
  it('says "Showing all N" when nothing is filtered, with no Show all button', () => {
    render(
      <ListResultLine
        shown={214}
        total={214}
        noun={NOUN}
        filtered={false}
        filterSummary={[]}
        onShowAll={vi.fn()}
      />
    );
    expect(screen.getByRole('status')).toHaveTextContent('Showing all 214 users.');
    expect(screen.queryByRole('button', { name: /show all/i })).not.toBeInTheDocument();
  });

  it('is a polite live region', () => {
    render(
      <ListResultLine
        shown={1}
        total={1}
        noun={NOUN}
        filtered={false}
        filterSummary={[]}
        onShowAll={vi.fn()}
      />
    );
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('status')).toHaveTextContent('Showing all 1 user.');
  });

  it('names one active filter in the sentence and clears it from "Show all"', async () => {
    const onShowAll = vi.fn();
    const { user } = render(
      <ListResultLine
        shown={12}
        total={214}
        noun={NOUN}
        filtered
        filterSummary={['Pending']}
        onShowAll={onShowAll}
      />
    );
    expect(screen.getByRole('status')).toHaveTextContent('Showing 12 of 214 users (Pending).');
    await user.click(screen.getByRole('button', { name: 'Show all users' }));
    expect(onShowAll).toHaveBeenCalledOnce();
  });

  it('lists several active filters in order', () => {
    render(
      <ListResultLine
        shown={2}
        total={10}
        noun={NOUN}
        filtered
        filterSummary={['Pending', 'Class: Novice A', 'matching “bob”']}
        onShowAll={vi.fn()}
      />
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Showing 2 of 10 users (Pending, Class: Novice A, matching “bob”).'
    );
  });

  it('offers "Select all" only for a partial selection', async () => {
    const onSelectAll = vi.fn();
    const { rerender, user } = render(
      <ListResultLine
        shown={40}
        total={90}
        noun={NOUN}
        filtered
        filterSummary={[]}
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
        filterSummary={[]}
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
        filterSummary={[]}
        onShowAll={vi.fn()}
        selectAll={{ selectedCount: 40, onSelectAll }}
      />
    );
    expect(screen.queryByRole('button', { name: /select all/i })).not.toBeInTheDocument();
  });
});
