import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { ShowDeskToolsSheet } from '../ShowDeskToolsSheet';

// INTENT: Sheet is a pure container — these tests verify the trigger /
// open / close behavior + the badge contract, not the seven tools' own
// rendering. Each tool already has its own test file.
describe('ShowDeskToolsSheet', () => {
  function renderSheet(props?: {
    toolCount?: number;
    actionableCount?: number;
    children?: React.ReactNode;
  }) {
    return render(
      <ShowDeskToolsSheet
        toolCount={props?.toolCount}
        {...(props?.actionableCount !== undefined && { actionableCount: props.actionableCount })}
      >
        {props?.children ?? <div data-testid="tool-stub">stub tool</div>}
      </ShowDeskToolsSheet>
    );
  }

  it('renders the Tools trigger button with a default badge of 9', () => {
    renderSheet();

    const trigger = screen.getByRole('button', { name: /open tools panel/i });
    expect(trigger).toBeInTheDocument();
    const badge = screen.getByTestId('show-desk-tools-badge');
    expect(badge).toHaveTextContent('9');
    expect(badge).toHaveAttribute('aria-label', '9 tools available');
  });

  it('keeps the sheet closed by default (children not rendered)', () => {
    renderSheet();

    expect(screen.queryByRole('dialog', { name: /show desk tools/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('tool-stub')).not.toBeInTheDocument();
  });

  it('opens the sheet on trigger click and renders the children inside', async () => {
    const { user } = renderSheet({
      children: (
        <>
          <div data-testid="tool-1">Tool one</div>
          <div data-testid="tool-2">Tool two</div>
        </>
      ),
    });

    await user.click(screen.getByRole('button', { name: /open tools panel/i }));

    expect(screen.getByRole('dialog', { name: /show desk tools/i })).toBeInTheDocument();
    expect(screen.getByTestId('tool-1')).toBeInTheDocument();
    expect(screen.getByTestId('tool-2')).toBeInTheDocument();
  });

  it('closes the sheet when Escape is pressed', async () => {
    const { user } = renderSheet();

    await user.click(screen.getByRole('button', { name: /open tools panel/i }));
    expect(screen.getByRole('dialog', { name: /show desk tools/i })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: /show desk tools/i })).not.toBeInTheDocument();
  });

  it('shows the actionable count in destructive style when > 0', () => {
    renderSheet({ actionableCount: 3 });

    const badge = screen.getByTestId('show-desk-tools-badge');
    expect(badge).toHaveTextContent('3');
    expect(badge).toHaveAttribute('aria-label', '3 items need attention');
  });

  it("singularizes the actionable aria-label when count is 1", () => {
    renderSheet({ actionableCount: 1 });

    expect(screen.getByTestId('show-desk-tools-badge')).toHaveAttribute(
      'aria-label',
      '1 item needs attention'
    );
  });

  it('falls back to the muted tool-count badge when actionableCount is 0', () => {
    renderSheet({ actionableCount: 0 });

    const badge = screen.getByTestId('show-desk-tools-badge');
    expect(badge).toHaveTextContent('9');
    expect(badge).toHaveAttribute('aria-label', '9 tools available');
  });
});
