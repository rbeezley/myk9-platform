import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { useAskQPanelStore } from '@/store/useAskQPanelStore';
import { ShowWorkbenchAskQHelp } from '../ShowWorkbenchAskQHelp';

describe('ShowWorkbenchAskQHelp', () => {
  beforeEach(() => {
    useAskQPanelStore.getState().close();
  });

  it('renders phase-scoped secretary prompt chips', () => {
    const { rerender } = render(<ShowWorkbenchAskQHelp phase="setup" />);

    expect(screen.getByRole('heading', { name: 'What do I do if...' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Late entry help' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit results' })).not.toBeInTheDocument();

    rerender(<ShowWorkbenchAskQHelp phase="today" />);
    expect(screen.getByRole('button', { name: 'Scratch or no-show' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ring running behind' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit results' })).not.toBeInTheDocument();

    rerender(<ShowWorkbenchAskQHelp phase="wrap-up" />);
    expect(screen.getByRole('button', { name: 'Submit results' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ring running behind' })).not.toBeInTheDocument();
  });

  it('opens AskQ with the selected prompt', async () => {
    const { user } = render(<ShowWorkbenchAskQHelp phase="today" />);

    await user.click(screen.getByRole('button', { name: 'Ring running behind' }));

    expect(useAskQPanelStore.getState().isOpen).toBe(true);
    expect(useAskQPanelStore.getState().suggestedPrompt).toBe(
      'What should I do if one ring is running behind schedule?'
    );
  });
});
