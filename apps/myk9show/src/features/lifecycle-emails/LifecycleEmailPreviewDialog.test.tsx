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

  it('keeps a parent space-y margin off the panel backdrop', () => {
    // The cockpit renders this as the last child of a `space-y-4` container. SlideOverPanel is not
    // portaled and its backdrop is `fixed inset-0`, so a direct-child backdrop would get
    // `margin-top: 1rem` and leave an undimmed strip. Measured in the app's own CSS: a fixed
    // child directly under `.space-y-4` has 16px margin-top; inside a `display: contents`
    // wrapper it has 0px. jsdom has no Tailwind CSS, so this pins the wrapper.
    renderPreview();
    const panel = document.querySelector('.slide-over-panel');
    const backdrop = panel?.parentElement;
    expect(backdrop).toHaveClass('fixed', 'inset-0');
    expect(backdrop?.parentElement).toHaveClass('contents');
  });
});
