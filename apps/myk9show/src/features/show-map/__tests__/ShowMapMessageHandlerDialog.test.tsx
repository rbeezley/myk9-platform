import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { ShowMapMessageHandlerDialog } from '../ShowMapMessageHandlerDialog';
import type { ShowMapNode } from '../showMapTypes';

const entryNode = {
  id: 'entry:entry-1',
  type: 'entry',
  label: '#12 Bella',
  entryDisplay: {
    armband: '12',
    dogName: 'Bella',
    handler: 'Jane Handler',
    handlerId: 'person-1',
  },
  childrenCount: 0,
} satisfies ShowMapNode;

function renderDialog(overrides: Partial<Parameters<typeof ShowMapMessageHandlerDialog>[0]> = {}) {
  const onOpenChange = vi.fn();
  const onConfirm = vi.fn();
  const props = {
    open: true,
    node: entryNode,
    isSubmitting: false,
    onOpenChange,
    onConfirm,
    ...overrides,
  };

  return {
    ...render(<ShowMapMessageHandlerDialog {...props} />),
    onOpenChange,
    onConfirm,
  };
}

describe('ShowMapMessageHandlerDialog', () => {
  it('prefills the first canned reply and switches templates into the message body', async () => {
    const { user } = renderDialog();
    const message = screen.getByLabelText(/^message$/i, { selector: 'textarea' });

    expect(message).toHaveValue('Please stop by the secretary table about #12 Bella.');

    await user.click(screen.getByRole('button', { name: /come to gate/i }));

    expect(message).toHaveValue('Please bring #12 Bella to the gate when you can.');
  });

  it('keeps send disabled when the message is empty or whitespace', async () => {
    const { user } = renderDialog();
    const message = screen.getByLabelText(/^message$/i, { selector: 'textarea' });
    const send = screen.getByRole('button', { name: /^send$/i });

    expect(send).toBeEnabled();

    await user.clear(message);
    expect(send).toBeDisabled();

    await user.type(message, '   ');
    expect(send).toBeDisabled();
  });

  it('sends the trimmed message body', async () => {
    const { user, onConfirm } = renderDialog();
    const message = screen.getByLabelText(/^message$/i, { selector: 'textarea' });

    await user.clear(message);
    await user.type(message, '  Please come see us.  ');
    await user.click(screen.getByRole('button', { name: /^send$/i }));

    expect(onConfirm).toHaveBeenCalledWith('Please come see us.');
  });

  it('closes when canceled', async () => {
    const { user, onOpenChange } = renderDialog();

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
