import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { useAskQPanelStore } from '@/store/useAskQPanelStore';
import { ShowWorkbenchAskQHelp } from '../ShowWorkbenchAskQHelp';

// Phase B5: only Setup-phase prompts survive. Today and Wrap-up tabs (and
// their AskQ prompt sets) were removed by the workbench collapse. The plan
// captures the deferred work to re-home the live-ops prompts in B7+ (see
// SECRETARY_SHOW_DAY_PROMPTS comment in askq-config.ts).
describe('ShowWorkbenchAskQHelp', () => {
  beforeEach(() => {
    useAskQPanelStore.getState().close();
  });

  it('renders the Setup-phase prompt chips', () => {
    render(<ShowWorkbenchAskQHelp phase="setup" />);

    expect(screen.getByRole('heading', { name: 'What do I do if...' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Late entry help' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit results' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Scratch or no-show' })).not.toBeInTheDocument();
  });

  it('opens AskQ with the selected prompt', async () => {
    const { user } = render(<ShowWorkbenchAskQHelp phase="setup" />);

    await user.click(screen.getByRole('button', { name: 'Late entry help' }));

    expect(useAskQPanelStore.getState().isOpen).toBe(true);
    expect(useAskQPanelStore.getState().suggestedPrompt).toBe(
      'What should I do if someone walks up and wants to enter on show day?'
    );
  });
});
