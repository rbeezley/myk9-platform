// apps/myk9show/src/test/components/askq/AskQInput.test.tsx
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { AskQInput } from '@/components/askq/AskQInput';

describe('AskQInput', () => {
  it('renders with placeholder text', () => {
    render(<AskQInput onSubmit={vi.fn()} disabled={false} />);
    expect(
      screen.getByPlaceholderText('Ask about rules, your results, or the app...')
    ).toBeInTheDocument();
  });

  it('calls onSubmit with trimmed query', async () => {
    const onSubmit = vi.fn();
    const { user } = render(<AskQInput onSubmit={onSubmit} disabled={false} />);

    const input = screen.getByPlaceholderText('Ask about rules, your results, or the app...');
    await user.type(input, '  What is the time limit?  ');
    await user.click(screen.getByRole('button', { name: 'Send query' }));

    expect(onSubmit).toHaveBeenCalledWith('What is the time limit?');
  });

  it('submits on Enter key', async () => {
    const onSubmit = vi.fn();
    const { user } = render(<AskQInput onSubmit={onSubmit} disabled={false} />);

    const input = screen.getByPlaceholderText('Ask about rules, your results, or the app...');
    await user.type(input, 'test query{Enter}');

    expect(onSubmit).toHaveBeenCalledWith('test query');
  });

  it('does not submit empty queries', async () => {
    const onSubmit = vi.fn();
    const { user } = render(<AskQInput onSubmit={onSubmit} disabled={false} />);

    await user.click(screen.getByRole('button', { name: 'Send query' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('disables input and button when disabled prop is true', () => {
    render(<AskQInput onSubmit={vi.fn()} disabled={true} />);

    expect(
      screen.getByPlaceholderText('Ask about rules, your results, or the app...')
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send query' })).toBeDisabled();
  });

  it('clears input after submit', async () => {
    const onSubmit = vi.fn();
    const { user } = render(<AskQInput onSubmit={onSubmit} disabled={false} />);

    const input = screen.getByPlaceholderText('Ask about rules, your results, or the app...');
    await user.type(input, 'my question');
    await user.click(screen.getByRole('button', { name: 'Send query' }));

    expect(input).toHaveValue('');
  });
});
