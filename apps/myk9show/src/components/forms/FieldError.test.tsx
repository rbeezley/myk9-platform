import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { FieldError, FieldErrorsProvider, focusFirstInvalidField, useFieldError } from '.';

function Field({ id, label }: { id: string; label: string }) {
  const { controlProps } = useFieldError(id);
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <input id={id} {...controlProps} />
      <FieldError field={id} />
    </div>
  );
}

describe('FieldError', () => {
  it('renders the message under its field and wires aria-invalid and the description', () => {
    render(
      <FieldErrorsProvider errors={{ a: 'Please enter a name' }}>
        <Field id="a" label="Name" />
        <Field id="b" label="Other" />
      </FieldErrorsProvider>
    );

    const input = screen.getByLabelText('Name');
    expect(input.parentElement).toContainElement(screen.getByText('Please enter a name'));
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Please enter a name');
    // The sibling with no error is untouched.
    expect(screen.getByLabelText('Other')).not.toHaveAttribute('aria-invalid');
  });

  it('renders nothing without an error', () => {
    render(<Field id="a" label="Name" />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('lets an explicit message override the provider', () => {
    render(
      <FieldErrorsProvider errors={{ a: 'from provider' }}>
        <FieldError field="a" message="explicit" />
      </FieldErrorsProvider>
    );
    expect(screen.getByText('explicit')).toBeInTheDocument();
    expect(screen.queryByText('from provider')).not.toBeInTheDocument();
  });
});

describe('focusFirstInvalidField', () => {
  it('focuses the first invalid control in document order, and reports when none is invalid', () => {
    render(
      <div data-testid="root">
        <input aria-label="ok" />
        <input aria-label="first bad" aria-invalid="true" />
        <input aria-label="second bad" aria-invalid="true" />
      </div>
    );
    const root = screen.getByTestId('root');

    expect(focusFirstInvalidField(root)).toBe(true);
    expect(screen.getByLabelText('first bad')).toHaveFocus();
    expect(focusFirstInvalidField(document.createElement('div'))).toBe(false);
  });
});
