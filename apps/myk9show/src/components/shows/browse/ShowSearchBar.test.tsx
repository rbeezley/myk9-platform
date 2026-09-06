import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShowSearchBar } from './ShowSearchBar';

function renderBar(overrides: Partial<React.ComponentProps<typeof ShowSearchBar>> = {}) {
  const props = {
    search: '',
    onSearchChange: vi.fn(),
    searchPlaceholder: 'Search shows',
    location: null,
    onChooseTyped: vi.fn(async () => true),
    onUseDeviceLocation: vi.fn(async () => true),
    onChooseAnywhere: vi.fn(),
    ...overrides,
  };
  render(<ShowSearchBar {...props} />);
  return props;
}

describe('ShowSearchBar', () => {
  it('reads Anywhere with no location, and the label with one', () => {
    renderBar();
    expect(screen.getByTestId('near-field')).toHaveTextContent('Anywhere');
  });

  it('marks a connection-derived location as approximate', () => {
    renderBar({ location: { label: 'Tulsa, OK', lat: 1, lng: 2, source: 'ip' } });
    const field = screen.getByTestId('near-field');
    expect(field).toHaveTextContent('Tulsa, OK');
    expect(field).toHaveTextContent('approximate');
  });

  it('does not mark a profile or remembered location as approximate', () => {
    renderBar({ location: { label: 'Tulsa, OK', lat: 1, lng: 2, source: 'profile' } });
    expect(screen.getByTestId('near-field')).not.toHaveTextContent('approximate');
  });

  it('submits a typed place, and explains a miss', async () => {
    const user = userEvent.setup();
    const onChooseTyped = vi.fn(async () => false);
    renderBar({ onChooseTyped });

    await user.click(screen.getByTestId('near-field'));
    await user.type(screen.getByLabelText(/show me shows near/i), 'x');
    await user.click(screen.getByRole('button', { name: 'Go' }));

    await waitFor(() => expect(onChooseTyped).toHaveBeenCalledWith('x'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't find that place/i);
  });

  it('asks for device location only from its button, and offers Anywhere', async () => {
    const user = userEvent.setup();
    const props = renderBar({ location: { label: 'Tulsa, OK', lat: 1, lng: 2, source: 'ip' } });
    expect(props.onUseDeviceLocation).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('near-field'));
    await user.click(screen.getByRole('button', { name: /use my location/i }));
    await waitFor(() => expect(props.onUseDeviceLocation).toHaveBeenCalledTimes(1));

    await user.click(screen.getByTestId('near-field'));
    await user.click(screen.getByRole('button', { name: 'Anywhere' }));
    expect(props.onChooseAnywhere).toHaveBeenCalledTimes(1);
  });
});
