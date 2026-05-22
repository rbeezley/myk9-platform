import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { ShowMapToolbar } from '../ShowMapToolbar';

function renderToolbar() {
  return render(
    <ShowMapToolbar
      filter="all"
      dayScope="today"
      completionScope="active"
      onFilterChange={vi.fn()}
      onDayScopeChange={vi.fn()}
      onCompletionScopeChange={vi.fn()}
      onCollapseAll={vi.fn()}
      onExpandTrials={vi.fn()}
    />
  );
}

describe('ShowMapToolbar', () => {
  it('surfaces keyboard and right-click row action help', async () => {
    const { user } = renderToolbar();

    await user.click(screen.getByRole('button', { name: /show map shortcuts/i }));

    expect(await screen.findByText('Show Map shortcuts')).toBeInTheDocument();
    expect(screen.getByText('Move between rows')).toBeInTheDocument();
    expect(screen.getByText('Expand or collapse')).toBeInTheDocument();
    expect(screen.getByText('Open row actions')).toBeInTheDocument();
    expect(screen.getByText('Enter')).toBeInTheDocument();
    expect(screen.getByText('Space')).toBeInTheDocument();
    expect(screen.getByText('or right-click')).toBeInTheDocument();
  });
});
