import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { LifecycleEmailPreviewDialog } from './LifecycleEmailPreviewDialog';

function renderPreview(
  overrides: { onSend?: () => void; onOpenChange?: (o: boolean) => void } = {}
) {
  const onSend = overrides.onSend ?? vi.fn();
  const onOpenChange = overrides.onOpenChange ?? vi.fn();
  const utils = render(
    <LifecycleEmailPreviewDialog
      open={true}
      onOpenChange={onOpenChange}
      stepType="accepted"
      show={{ name: 'Test Show' }}
      recipient={{ name: 'Jamie', email: 'jamie@example.com' }}
      entry={{ dogName: 'Rex', className: 'Novice', armbandNumber: '1', amountDue: 0 }}
      initialSubject="Hello"
      initialBody="Body text"
      onSend={onSend}
      onNotNow={vi.fn()}
    />
  );
  return { ...utils, onSend, onOpenChange };
}

describe('LifecycleEmailPreviewDialog', () => {
  it('is a slide-out like the scheduled batch review (same three-field compose shape)', () => {
    renderPreview();
    const container = screen.getByRole('dialog');
    expect(container.querySelector('.slide-over-panel')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Close panel' })).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const { user, onOpenChange } = renderPreview();
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('sends the edited values through the same handler', async () => {
    const { user, onSend } = renderPreview();
    await user.click(screen.getByRole('button', { name: /Send now/ }));
    expect(onSend).toHaveBeenCalledWith({
      subject: 'Hello',
      body: 'Body text',
      secretaryNote: '',
    });
  });
});
