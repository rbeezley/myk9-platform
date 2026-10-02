import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@/test/utils/testUtils';
import { ListEmptyState } from '../ListEmptyState';
import { ListResultLine } from '../ListResultLine';
import { ListViewToggle } from '../ListViewToggle';
import { Building2 } from 'lucide-react';

describe('ListViewToggle', () => {
  it('shows labelled Cards and Table choices and reports the pick', async () => {
    const onChange = vi.fn();
    const { user } = render(<ListViewToggle active="table" onChange={onChange} />);

    // M9: the toggle carries words, not only icons.
    expect(screen.getByText('Cards')).toBeInTheDocument();
    expect(screen.getByText('Table')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cards view' }));
    expect(onChange).toHaveBeenCalledWith('cards');
  });

  it('sits in the result line, on the right of the sentence', () => {
    render(
      <ListResultLine
        shown={2}
        total={2}
        noun={['club', 'clubs']}
        filtered={false}
        onShowAll={vi.fn()}
      >
        <ListViewToggle active="cards" onChange={vi.fn()} />
      </ListResultLine>
    );
    const sentence = screen.getByRole('status');
    const line = sentence.parentElement as HTMLElement;
    expect(within(line).getByRole('button', { name: 'Table view' })).toBeInTheDocument();
  });
});

describe('ListEmptyState', () => {
  it('says "No ‹objects› yet" for an empty list', () => {
    render(
      <ListEmptyState
        icon={Building2}
        noun={['club', 'clubs']}
        filtered={false}
        onShowAll={vi.fn()}
        action={null}
      />
    );
    expect(screen.getByRole('heading', { name: 'No clubs yet' })).toBeInTheDocument();
  });

  it('says one thing when a search or filter hides every row, with one reset label', async () => {
    const onShowAll = vi.fn();
    const { user } = render(
      <ListEmptyState
        icon={Building2}
        noun={['club', 'clubs']}
        filtered
        onShowAll={onShowAll}
        action={null}
      />
    );
    expect(
      screen.getByRole('heading', { name: 'No clubs match your search or filters.' })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show all clubs' }));
    expect(onShowAll).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: /clear filters/i })).not.toBeInTheDocument();
  });

  it('does not repeat "Show all" when the result line has already handed it to the empty state', () => {
    render(
      <>
        <ListResultLine
          shown={0}
          total={5}
          noun={['club', 'clubs']}
          filtered
          onShowAll={vi.fn()}
          showAllInEmptyState
        />
        <ListEmptyState
          icon={Building2}
          noun={['club', 'clubs']}
          filtered
          onShowAll={vi.fn()}
          action={null}
        />
      </>
    );
    expect(screen.getAllByRole('button', { name: 'Show all clubs' })).toHaveLength(1);
  });
});
