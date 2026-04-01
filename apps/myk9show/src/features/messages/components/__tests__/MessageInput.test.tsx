import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { MessageInput } from '../MessageInput';

describe('MessageInput', () => {
  it('renders a text input and send button', () => {
    render(<MessageInput onSend={vi.fn()} />);
    expect(screen.getByPlaceholderText(/message/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
  });

  it('disables send button when input is empty', () => {
    render(<MessageInput onSend={vi.fn()} />);
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
  });

  it('calls onSend with trimmed message and clears input', async () => {
    const onSend = vi.fn();
    const { user } = render(<MessageInput onSend={onSend} />);

    const input = screen.getByPlaceholderText(/message/i);
    await user.type(input, 'Hello secretary');
    await user.click(screen.getByRole('button', { name: /send/i }));

    expect(onSend).toHaveBeenCalledWith('Hello secretary');
    expect(input).toHaveValue('');
  });

  it('sends on Enter key press', async () => {
    const onSend = vi.fn();
    const { user } = render(<MessageInput onSend={onSend} />);

    const input = screen.getByPlaceholderText(/message/i);
    await user.type(input, 'Hello{Enter}');

    expect(onSend).toHaveBeenCalledWith('Hello');
  });

  it('disables input and button when disabled prop is true', () => {
    render(<MessageInput onSend={vi.fn()} disabled />);
    expect(screen.getByPlaceholderText(/message/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
  });
});
