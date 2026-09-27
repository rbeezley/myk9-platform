import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShowLocationField } from './ShowLocationField';

function renderField(overrides: Partial<React.ComponentProps<typeof ShowLocationField>> = {}) {
  const props = {
    location: null,
    onChooseTyped: vi.fn(async () => true),
    onUseDeviceLocation: vi.fn(async () => true),
    onChooseAnywhere: vi.fn(),
    ...overrides,
  };
  render(<ShowLocationField {...props} />);
  return props;
}

function renderFieldWithRerender(
  overrides: Partial<React.ComponentProps<typeof ShowLocationField>> = {}
) {
  const base = {
    location: null,
    onChooseTyped: vi.fn(async () => true),
    onUseDeviceLocation: vi.fn(async () => true),
    onChooseAnywhere: vi.fn(),
    ...overrides,
  };
  const view = render(<ShowLocationField {...base} />);
  return {
    rerender: (next: Partial<React.ComponentProps<typeof ShowLocationField>>) =>
      view.rerender(<ShowLocationField {...base} {...next} />),
  };
}

describe('ShowLocationField', () => {
  it('reads Anywhere with no location, and the label with one', () => {
    renderField();
    expect(screen.getByTestId('near-field')).toHaveTextContent('Anywhere');
  });

  it('marks a connection-derived location as approximate', () => {
    renderField({ location: { label: 'Tulsa, OK', lat: 1, lng: 2, source: 'ip' } });
    const field = screen.getByTestId('near-field');
    expect(field).toHaveTextContent('Tulsa, OK');
    expect(field).toHaveTextContent('approximate');
  });

  it('does not mark a profile or remembered location as approximate', () => {
    renderField({ location: { label: 'Tulsa, OK', lat: 1, lng: 2, source: 'profile' } });
    expect(screen.getByTestId('near-field')).not.toHaveTextContent('approximate');
    expect(screen.getByTestId('near-field')).toHaveAccessibleName('Near: Tulsa, OK');
  });

  it('says "approximate" in the accessible name, not only in the visible tag', () => {
    renderField({ location: { label: 'Broken Arrow, OK', lat: 1, lng: 2, source: 'ip' } });
    expect(screen.getByTestId('near-field')).toHaveAccessibleName(
      'Near: Broken Arrow, OK (approximate)'
    );
  });

  it('names the resolving and empty states without a stale qualifier', () => {
    const { rerender } = renderFieldWithRerender({ isResolvingLocation: true });
    expect(screen.getByTestId('near-field')).toHaveAccessibleName('Near: Finding you…');
    rerender({ location: null, isResolvingLocation: false });
    expect(screen.getByTestId('near-field')).toHaveAccessibleName('Near: Anywhere');
  });

  it('submits a typed place, and explains a miss', async () => {
    const user = userEvent.setup();
    const onChooseTyped = vi.fn(async () => false);
    renderField({ onChooseTyped });

    await user.click(screen.getByTestId('near-field'));
    await user.type(screen.getByLabelText(/show me shows near/i), 'x');
    await user.click(screen.getByRole('button', { name: 'Go' }));

    await waitFor(() => expect(onChooseTyped).toHaveBeenCalledWith('x'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't find that place/i);
  });

  it('asks for device location only from its button, and offers Anywhere', async () => {
    const user = userEvent.setup();
    const props = renderField({ location: { label: 'Tulsa, OK', lat: 1, lng: 2, source: 'ip' } });
    expect(props.onUseDeviceLocation).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('near-field'));
    await user.click(screen.getByRole('button', { name: /use my location/i }));
    await waitFor(() => expect(props.onUseDeviceLocation).toHaveBeenCalledTimes(1));

    await user.click(screen.getByTestId('near-field'));
    await user.click(screen.getByRole('button', { name: 'Anywhere' }));
    expect(props.onChooseAnywhere).toHaveBeenCalledTimes(1);
  });
});
