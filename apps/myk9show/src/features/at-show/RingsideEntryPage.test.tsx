/**
 * Tests for RingsideEntryPage — the bare `/at-show` routing logic: anon → sign
 * in, auth loading / show resolving → spinners, one live show → auto-jump,
 * several or none → RingsideHome, and the passcode escape hatch.
 */

import { MemoryRouter, Routes, Route, useParams } from 'react-router-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RingsideEntryPage from './RingsideEntryPage';
import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole } from '@/types/auth-types';
import { useRingsideEntryShows } from './useRingsideEntryShows';

vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: vi.fn() }));
vi.mock('./useRingsideEntryShows', () => ({ useRingsideEntryShows: vi.fn() }));
vi.mock('@/pages/SmartSignInPage', () => ({
  default: () => <div>SIGN IN STUB</div>,
}));

const mockAuth = vi.mocked(useAuthContext);
const mockShows = vi.mocked(useRingsideEntryShows);
let mockRoles: UserRole[] = [];

function RingMarker() {
  const { showId } = useParams<{ showId: string }>();
  return <div>IN THE RING: {showId}</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/at-show']}>
      <Routes>
        <Route path="/at-show" element={<RingsideEntryPage />} />
        <Route path="/at-show/:showId" element={<RingMarker />} />
      </Routes>
    </MemoryRouter>
  );
}

const NO_SHOWS = { liveShows: [], upcomingShows: [], isLoading: false };

beforeEach(() => {
  mockAuth.mockReset();
  mockShows.mockReset();
  mockRoles = [];
  // Default: signed-in user, nothing resolving.
  mockAuth.mockReturnValue({
    user: { id: 'u1' },
    loading: false,
    hasRole: (role: UserRole) => mockRoles.includes(role),
  } as never);
  mockShows.mockReturnValue(NO_SHOWS);
});

describe('RingsideEntryPage', () => {
  it('renders the sign-in front door for an anonymous visitor', () => {
    mockAuth.mockReturnValue({ user: null, loading: false } as never);
    renderPage();
    expect(screen.getByText('SIGN IN STUB')).toBeInTheDocument();
  });

  it('shows a spinner while auth is still loading', () => {
    mockAuth.mockReturnValue({ user: null, loading: true } as never);
    renderPage();
    expect(screen.getByRole('status', { name: 'Loading ringside…' })).toBeInTheDocument();
  });

  it('shows a spinner while the user\'s shows are resolving', () => {
    mockShows.mockReturnValue({ ...NO_SHOWS, isLoading: true });
    renderPage();
    expect(screen.getByRole('status', { name: 'Finding your show…' })).toBeInTheDocument();
  });

  it('auto-jumps into the ring when exactly one show is live', () => {
    mockShows.mockReturnValue({
      liveShows: [{ showId: 'show-9', showName: 'Heartland', phase: 'live' }],
      upcomingShows: [],
      isLoading: false,
    });
    renderPage();
    expect(screen.getByText('IN THE RING: show-9')).toBeInTheDocument();
  });

  it.each([
    UserRole.SITE_ADMIN,
    UserRole.SECRETARY,
    UserRole.CLUB_ADMIN,
    UserRole.CHAIRMAN,
    UserRole.JUDGE,
    UserRole.STEWARD,
  ])(
    'lets a signed-in %s verify one upcoming show without a passcode',
    role => {
      mockRoles = [role];
      mockShows.mockReturnValue({
        liveShows: [],
        upcomingShows: [{ showId: 'show-9', showName: 'Heartland', phase: 'upcoming' }],
        isLoading: false,
      });

      renderPage();

      expect(screen.getByText('IN THE RING: show-9')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /enter a passcode/i })).not.toBeInTheDocument();
    }
  );

  it('keeps an exhibitor on the pre-show landing with the passcode option', () => {
    mockRoles = [UserRole.EXHIBITOR];
    mockShows.mockReturnValue({
      liveShows: [],
      upcomingShows: [{ showId: 'show-9', showName: 'Heartland', phase: 'upcoming' }],
      isLoading: false,
    });

    renderPage();

    expect(screen.getByText('Heartland')).toBeInTheDocument();
    expect(screen.queryByText('IN THE RING: show-9')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enter a passcode/i })).toBeInTheDocument();
  });

  it('renders the chooser (not a jump) when several shows are live', () => {
    mockShows.mockReturnValue({
      liveShows: [
        { showId: 'a', showName: 'Alpha', phase: 'live' },
        { showId: 'b', showName: 'Bravo', phase: 'live' },
      ],
      upcomingShows: [],
      isLoading: false,
    });
    renderPage();
    expect(screen.getByText('Live now')).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Bravo')).toBeInTheDocument();
    expect(screen.queryByText(/IN THE RING/)).not.toBeInTheDocument();
  });

  it('renders the empty home when nothing is live or upcoming', () => {
    renderPage();
    expect(screen.getByText('No show is live right now.')).toBeInTheDocument();
  });

  it('reveals the passcode flow from the home', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /enter a passcode/i }));
    expect(screen.getByText('SIGN IN STUB')).toBeInTheDocument();
  });
});
