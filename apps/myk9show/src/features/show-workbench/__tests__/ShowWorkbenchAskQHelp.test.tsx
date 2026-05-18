import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { useAskQPanelStore } from '@/store/useAskQPanelStore';
import { ShowWorkbenchAskQHelp } from '../ShowWorkbenchAskQHelp';

describe('ShowWorkbenchAskQHelp', () => {
  beforeEach(() => {
    useAskQPanelStore.getState().close();
  });

  it('renders secretary show-day prompt chips', () => {
    render(<ShowWorkbenchAskQHelp />);

    expect(screen.getByRole('heading', { name: 'What do I do if...' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scratch or no-show' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ring running behind' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit results' })).toBeInTheDocument();
  });

  it('opens AskQ with the selected prompt', async () => {
    const { user } = render(<ShowWorkbenchAskQHelp />);

    await user.click(screen.getByRole('button', { name: 'Ring running behind' }));

    expect(useAskQPanelStore.getState().isOpen).toBe(true);
    expect(useAskQPanelStore.getState().suggestedPrompt).toBe(
      'What should I do if one ring is running behind schedule?'
    );
  });
});
