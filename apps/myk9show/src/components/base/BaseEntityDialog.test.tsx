import { render, screen } from '@/test/utils/testUtils';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { BaseEntityDialog } from './BaseEntityDialog';

vi.mock('@/components/common/StandardDialog', () => ({
  default: ({ onSave, children }: { onSave: () => void; children: ReactNode }) => (
    <div>
      <button type="button" onClick={onSave}>
        Save
      </button>
      {children}
    </div>
  ),
}));

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

    screen.getAllByRole('button', { name: 'Save' }).at(-1)?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(unhandled).not.toHaveBeenCalled();
    window.removeEventListener('unhandledrejection', unhandled);
  });
});
