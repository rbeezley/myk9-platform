import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import {
  FieldError,
  FieldErrorsProvider,
  focusFirstFieldControl,
  useFieldError,
  useFieldErrorRegistry,
} from '.';

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

describe('focusFirstFieldControl', () => {
  it('focuses the earliest of the named fields in document order, ignoring other invalid controls', () => {
    render(
      <div data-testid="root">
        <input id="warn" aria-label="non-blocking warning" aria-invalid="true" />
        <input id="a" aria-label="a" />
        <input id="b" aria-label="b" />
      </div>
    );
    const root = screen.getByTestId('root');

    // Listed out of order on purpose; "warn" is invalid but not blocking, so it is not named.
    expect(focusFirstFieldControl(['b', 'a'], root)).toBe(true);
    expect(screen.getByLabelText('a')).toHaveFocus();
    expect(focusFirstFieldControl(['missing'], root)).toBe(false);
  });

  it('finds a control that has no id through the callout that describes it', () => {
    render(
      <div data-testid="root">
        <button aria-describedby="tab-error">tab</button>
      </div>
    );
    expect(focusFirstFieldControl(['tab'], screen.getByTestId('root'))).toBe(true);
    expect(screen.getByRole('button', { name: 'tab' })).toHaveFocus();
  });
});

describe('FieldError registry', () => {
  function Harness({ errors, show = true }: { errors: Record<string, string>; show?: boolean }) {
    const { registry, registered } = useFieldErrorRegistry();
    return (
      <FieldErrorsProvider errors={errors} registry={registry}>
        <output data-testid="registered">{registered.join(',')}</output>
        {show && <FieldError field="a" />}
        <FieldError field="b" />
      </FieldErrorsProvider>
    );
  }

  it('registers a callout while it is mounted and unregisters it when it goes', () => {
    const errors = { a: 'A is required', b: 'B is required' };
    const { rerender } = render(<Harness errors={errors} />);
    expect(screen.getByTestId('registered')).toHaveTextContent('a,b');

    rerender(<Harness errors={errors} show={false} />);
    expect(screen.getByTestId('registered')).toHaveTextContent('b');
  });

  it('does not register a field with no error', () => {
    render(<Harness errors={{ b: 'B is required' }} />);
    expect(screen.getByTestId('registered')).toHaveTextContent('b');
  });

  it('lets only the first callout be a live alert', () => {
    render(<Harness errors={{ a: 'A is required', b: 'B is required' }} />);

    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('A is required');
    expect(screen.getByText('B is required')).toBeInTheDocument();
  });

  it('shows every message for a field on its own line in one callout', () => {
    render(
      <FieldErrorsProvider errors={{ a: 'Start missing\nEnd missing' }}>
        <FieldError field="a" />
      </FieldErrorsProvider>
    );
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert').textContent).toBe('Start missing\nEnd missing');
  });
});
