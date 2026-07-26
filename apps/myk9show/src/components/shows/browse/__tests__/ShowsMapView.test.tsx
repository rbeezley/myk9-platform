import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ShowsMapView, partitionMappableShows } from '../ShowsMapView';
import type { EnhancedShow } from '@/hooks/useBrowseShowsData';

// jsdom can't lay out a real Leaflet map; render structural stand-ins so the
// view's own logic (partitioning, popups, legend, empty state) is testable.
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: () => <div data-testid="tile-layer" />,
  Marker: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="map-marker">{children}</div>
  ),
  Popup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  useMap: () => ({ fitBounds: vi.fn(), setView: vi.fn(), getZoom: () => 4 }),
}));

function makeShow(overrides: Partial<EnhancedShow>): EnhancedShow {
  return {
    id: 'show-1',
    name: 'Summer Sniff Classic',
    organization: 'AKC',
    startDate: '2026-08-14',
    endDate: '2026-08-16',
    location: 'Expo Hall, Tulsa, OK',
    latitude: 36.15,
    longitude: -95.99,
    status: 'accepting_entries',
    events: [],
    source: 'myK9Show',
    entryOpenDate: '2026-06-01',
    entryCloseDate: '2026-08-30',
    preEntryFee: '25',
    relationship: [],
    userCanManage: false,
    userIsJudging: false,
    userHasEntries: false,
    ...overrides,
  } as EnhancedShow;
}

describe('partitionMappableShows', () => {
  it('splits located shows from ones without coordinates', () => {
    const shows = [
      makeShow({ id: 'a' }),
      makeShow({ id: 'b', latitude: null, longitude: null }),
      makeShow({ id: 'c', latitude: undefined, longitude: undefined }),
    ];

    const { located, omittedCount } = partitionMappableShows(shows);

    expect(located.map(p => p.show.id)).toEqual(['a']);
    expect(omittedCount).toBe(2);
  });

  it('derives a marker status per located show', () => {
    const { located } = partitionMappableShows(
      [makeShow({ id: 'closed-show', status: 'completed' })]
    );
    expect(located[0].status).toBe('closed');
  });
});

describe('ShowsMapView', () => {
  it('renders one marker per located show and the omitted-count note', () => {
    const shows = [
      makeShow({ id: 'a' }),
      makeShow({ id: 'b', latitude: 40.7, longitude: -74.0 }),
      makeShow({ id: 'no-pin', latitude: null, longitude: null }),
    ];

    render(<ShowsMapView shows={shows} onSwitchToCards={vi.fn()} />);

    expect(screen.getAllByTestId('map-marker')).toHaveLength(2);
    expect(screen.getByTestId('map-omitted-note')).toHaveTextContent(
      '1 show without a map pin not shown'
    );
  });

  it('popup links to the show details page', () => {
    render(<ShowsMapView shows={[makeShow({ id: 'show-42' })]} onSwitchToCards={vi.fn()} />);

    expect(screen.getByRole('link', { name: /view show/i })).toHaveAttribute(
      'href',
      '/shows/show-42'
    );
  });

  it('shows the legend when pins exist', () => {
    render(<ShowsMapView shows={[makeShow({})]} onSwitchToCards={vi.fn()} />);

    expect(screen.getByText('Entries open')).toBeInTheDocument();
    expect(screen.getByText('Closing soon')).toBeInTheDocument();
  });

  it('renders the empty state with a switch-to-cards action when nothing is mappable', () => {
    const onSwitchToCards = vi.fn();
    render(
      <ShowsMapView
        shows={[makeShow({ latitude: null, longitude: null })]}
        onSwitchToCards={onSwitchToCards}
      />
    );

    expect(screen.getByText('No shows on the map yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /view as cards/i }));
    expect(onSwitchToCards).toHaveBeenCalledTimes(1);
  });
});
