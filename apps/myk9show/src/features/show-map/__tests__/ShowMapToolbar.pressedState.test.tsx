/**
 * F19 — the Show Map filter groups signalled the active option by colour alone.
 * Nothing announced which filter was applied, and the consequence was visible to a
 * sighted user too: during the secretary walk a scored class vanished from the tree
 * while the header still read "2 Classes", and only clicking `Completed` revealed
 * that the default `Active` filter was hiding it.
 *
 * Asserts rendered ARIA state, not source strings.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { ShowMapToolbar } from '../ShowMapToolbar';

function renderToolbar(overrides: Record<string, unknown> = {}) {
  return render(
    <ShowMapToolbar
      filter="all"
      onFilterChange={vi.fn()}
      dayScope="all"
      onDayScopeChange={vi.fn()}
      completionScope="active"
      onCompletionScopeChange={vi.fn()}
      onCollapseAll={vi.fn()}
      onExpandTrials={vi.fn()}
      {...overrides}
    />
  );
}

describe('ShowMapToolbar pressed state', () => {
  it('marks the active date range and leaves the others unpressed', () => {
    renderToolbar({ dayScope: 'today' });

    expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Tomorrow' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.getByRole('button', { name: 'All dates' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('marks the active completion scope — the filter that hid the scored class', () => {
    renderToolbar({ completionScope: 'active' });

    expect(screen.getByRole('button', { name: 'Active' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Completed' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('shows the active status view in a labelled select and changes it through the list toolkit', async () => {
    const onFilterChange = vi.fn();
    const { user } = renderToolbar({ filter: 'in-progress', onFilterChange });

    const select = screen.getByRole('combobox', { name: 'Show: Show Map filters' });
    expect(select).toHaveTextContent('In progress');
    await user.click(select);
    expect(await screen.findByRole('option', { name: 'All' })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'Attention' }));
    expect(onFilterChange).toHaveBeenCalledWith('needs-attention');
  });

  it('exposes each filter set as a labelled group', () => {
    renderToolbar();

    expect(screen.getByRole('group', { name: 'Date range' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Class completion' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Show: Show Map filters' })).toBeInTheDocument();
  });
});
