import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import PedigreeAncestorForm from './PedigreeAncestorForm';

const renderForm = (onSubmit = vi.fn()) =>
  render(
    <>
      <PedigreeAncestorForm formId="anc" onSubmit={onSubmit} />
      <button type="submit" form="anc">
        Go
      </button>
    </>
  );

describe('PedigreeAncestorForm required-field callouts', () => {
  it('shows the callout under Registered Name, focuses it, then clears when filled', async () => {
    const onSubmit = vi.fn();
    const { user } = renderForm(onSubmit);
    await user.click(screen.getByRole('button', { name: 'Go' }));

    const name = screen.getByRole('textbox', { name: /registered name/i });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Enter the registered name.')).toBeInTheDocument();
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAttribute('aria-describedby', 'anc-registeredName-error');
    expect(name).toHaveFocus();

    await user.type(name, 'R');
    expect(screen.queryByText('Enter the registered name.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Go' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('flags the empty half of a registry pair beside that field', async () => {
    const onSubmit = vi.fn();
    const { user } = renderForm(onSubmit);
    await user.type(screen.getByRole('textbox', { name: /registered name/i }), 'R');
    await user.type(screen.getByRole('textbox', { name: /registry org/i }), 'A');
    await user.click(screen.getByRole('button', { name: 'Go' }));

    expect(onSubmit).not.toHaveBeenCalled();
    const number = screen.getByRole('textbox', { name: /registration #/i });
    expect(screen.getByText(/enter the registration number/i)).toBeInTheDocument();
    expect(number).toHaveAttribute('aria-invalid', 'true');
    expect(number).toHaveFocus();
    expect(screen.queryByText(/or neither/i)).not.toBeInTheDocument();
  });
});
