import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { EnhancedShow } from '@/hooks/useBrowseShowsData';

// The panel's whole job is what happens when the map fails, so the map itself
// is the thing under control here. `shouldThrow` is flipped per test.
const mapState = { shouldThrow: false };

vi.mock('@/components/common/LazyComponents', () => ({
  ShowsMapView: ({ shows }: { shows: EnhancedShow[] }) => {
    if (mapState.shouldThrow) throw new Error('Loading chunk ShowsMapView failed');
    return <div data-testid="shows-map">{shows.length} pins</div>;
  },
  ShowCalendar: () => null,
}));

const { ShowsMapPanel } = await import('./ShowsMapPanel');

const SHOWS = [{ id: 'a' }, { id: 'b' }] as unknown as EnhancedShow[];

function renderPanel(onSwitchToCards = vi.fn()) {
  render(
    <MemoryRouter>
      <div>
        <p>The show list beside the map</p>
        <ShowsMapPanel shows={SHOWS} onSwitchToCards={onSwitchToCards} />
      </div>
    </MemoryRouter>
  );
  return onSwitchToCards;
}

describe('ShowsMapPanel', () => {
  it('renders the map when it loads', async () => {
    mapState.shouldThrow = false;
    renderPanel();

    // Positive control: without this, a fallback-only assertion could pass on a
    // panel that never renders the map at all.
    expect(await screen.findByTestId('shows-map')).toHaveTextContent('2 pins');
    expect(screen.queryByText(/the map didn't load/i)).not.toBeInTheDocument();
  });

  it('shows its own failure state instead of taking the page down', async () => {
    mapState.shouldThrow = true;
    renderPanel();

    expect(await screen.findByText(/the map didn't load/i)).toBeInTheDocument();
    expect(screen.queryByTestId('shows-map')).not.toBeInTheDocument();
    // The point of scoping the boundary: everything around it survives.
    expect(screen.getByText('The show list beside the map')).toBeInTheDocument();
  });

  it('offers a way out that always works', async () => {
    const user = userEvent.setup();
    mapState.shouldThrow = true;
    const onSwitchToCards = renderPanel();

    await user.click(await screen.findByRole('button', { name: /view as cards/i }));

    expect(onSwitchToCards).toHaveBeenCalledTimes(1);
  });

  it('offers a reload rather than a retry, which cannot recover a cached chunk rejection', async () => {
    mapState.shouldThrow = true;
    renderPanel();

    expect(await screen.findByRole('button', { name: /reload the page/i })).toBeInTheDocument();
    // A "Try again" would re-render straight back into React's cached rejection
    // and look broken; the panel deliberately does not offer one.
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
  });
});
