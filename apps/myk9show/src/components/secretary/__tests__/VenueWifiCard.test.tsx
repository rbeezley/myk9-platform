import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VenueWifiCard } from '../VenueWifiCard';

describe('VenueWifiCard', () => {
  it('renders WiFi network and password fields', () => {
    render(
      <VenueWifiCard showId="test-id" network="" password="" onSave={vi.fn()} />
    );
    expect(screen.getByLabelText(/network/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('shows current values', () => {
    render(
      <VenueWifiCard
        showId="test-id"
        network="ShowNet"
        password="dog123"
        onSave={vi.fn()}
      />
    );
    expect(screen.getByDisplayValue('ShowNet')).toBeInTheDocument();
    expect(screen.getByDisplayValue('dog123')).toBeInTheDocument();
  });

  it('calls onSave with updated values', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <VenueWifiCard showId="test-id" network="" password="" onSave={onSave} />
    );

    await user.type(screen.getByLabelText(/network/i), 'MyWiFi');
    await user.type(screen.getByLabelText(/password/i), 'pass123');
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(onSave).toHaveBeenCalledWith('MyWiFi', 'pass123');
  });

  it('shows helper text about armband labels', () => {
    render(
      <VenueWifiCard showId="test-id" network="" password="" onSave={vi.fn()} />
    );
    expect(screen.getByText(/armband label/i)).toBeInTheDocument();
  });

  it('shows "Coming soon" and disables inputs when onSave not provided', () => {
    render(
      <VenueWifiCard showId="test-id" network="" password="" />
    );
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/network/i)).toBeDisabled();
    expect(screen.getByLabelText(/password/i)).toBeDisabled();
  });
});
