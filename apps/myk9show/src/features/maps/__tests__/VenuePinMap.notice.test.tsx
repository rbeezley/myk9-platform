/**
 * MYK9-1295: the pin notice on an empty venue form is a neutral helper, not a
 * warning. Once an address is typed without a pin, the MYK9-686 warning returns.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';

// jsdom can't lay out a real Leaflet map; render structural stand-ins.
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: () => null,
  Marker: () => null,
  useMapEvents: () => null,
  useMap: () => ({ setView: vi.fn(), getZoom: () => 3 }),
}));

import { VenuePinMap } from '../VenuePinMap';

const NO_PIN_WARNING = 'No map pin yet — locate the address or click the map to place it.';
const EMPTY_FORM_HELPER = 'Enter the venue address, then locate it to place the map pin.';
const DRAG_HINT = 'Drag the pin to fine-tune the venue location.';

describe('VenuePinMap notice', () => {
  it('shows the neutral helper, not the warning, on an empty form', () => {
    render(<VenuePinMap value={null} onChange={vi.fn()} address="" />);

    expect(screen.getByText(EMPTY_FORM_HELPER)).toBeInTheDocument();
    expect(screen.queryByText(NO_PIN_WARNING)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Locate address' })).toBeDisabled();
  });

  it('shows the no-pin warning once an address is typed without a pin', () => {
    render(<VenuePinMap value={null} onChange={vi.fn()} address="1024 S Oak Ln" />);

    expect(screen.getByText(NO_PIN_WARNING)).toBeInTheDocument();
    expect(screen.queryByText(EMPTY_FORM_HELPER)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Locate address' })).toBeEnabled();
  });

  it('shows the drag hint when a pin is placed', () => {
    render(<VenuePinMap value={{ lat: 39.78, lng: -89.65 }} onChange={vi.fn()} address="" />);

    expect(screen.getByText(DRAG_HINT)).toBeInTheDocument();
    expect(screen.queryByText(NO_PIN_WARNING)).not.toBeInTheDocument();
    expect(screen.queryByText(EMPTY_FORM_HELPER)).not.toBeInTheDocument();
  });
});
