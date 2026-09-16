import { render, screen } from '@/test/utils/testUtils';
import { describe, expect, it, vi } from 'vitest';
import { BaseEntityDialog } from './BaseEntityDialog';

// No StandardDialog mock: BaseEntityDialog renders CommonDialog directly now
// (MYK9-584), so a mock of StandardDialog would be inert and would only mislead
// a reader about what is in the path. This exercises the real footer.

describe('BaseEntityDialog', () => {
  it('consumes a rejected async submit handler', async () => {
    const unhandled = vi.fn();
    window.addEventListener('unhandledrejection', unhandled);
    const onSubmit = vi.fn(() => Promise.reject(new Error('blocked')));

    render(
      <BaseEntityDialog open onOpenChange={vi.fn()} title="Delete dog" onSubmit={onSubmit}>
        <span>Confirmation</span>
      </BaseEntityDialog>
    );

    screen.getByRole('button', { name: 'Save' }).click();
    await Promise.resolve();
    await Promise.resolve();

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(unhandled).not.toHaveBeenCalled();
    window.removeEventListener('unhandledrejection', unhandled);
  });
});
