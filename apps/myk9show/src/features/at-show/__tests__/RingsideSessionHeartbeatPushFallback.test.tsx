/**
 * Regression cover for the J1.3 push-independent revocation check.
 *
 * The heartbeat's first await is `getExistingSubscription()`. When that call
 * threw (no `navigator.serviceWorker`) or never settled (registration blocked by
 * policy or a private-browsing mode), the whole heartbeat died before the
 * `if (!endpoint)` branch — and `void heartbeat().catch(() => {})` swallowed it.
 * A device in that state never learned its ringside passcode claim had gone
 * stale and kept access indefinitely after a secretary regenerated passcodes.
 *
 * These tests drive the REAL `@myk9/notifications` module (no vi.mock of it) so
 * they exercise the actual seam, not a stubbed one. That is why they live in
 * their own file: the sibling `RingsideSessionHeartbeat.test.tsx` mocks that
 * module module-wide, which would defeat the whole point here.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RingsideSessionHeartbeat } from '../RingsideSessionHeartbeat';

const { rpcMock, revokeMock, handleRevokedMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  revokeMock: vi.fn(),
  handleRevokedMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: rpcMock },
}));

vi.mock('../ringsidePasscodeRevocation', () => ({
  revokeRingsidePasscodeAccess: revokeMock,
  handleRingsidePasscodeRevoked: handleRevokedMock,
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'user-1' } }),
}));

const SHOW_ID = '11111111-1111-1111-1111-111111111111';

function renderHeartbeat() {
  return render(
    <MemoryRouter initialEntries={[`/at-show/${SHOW_ID}/ring/1`]}>
      <Routes>
        <Route
          path="/at-show/:showId/ring/:ringId"
          element={
            <RingsideSessionHeartbeat>
              <div>ringside</div>
            </RingsideSessionHeartbeat>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  rpcMock.mockResolvedValue({ data: false, error: null });
  vi.stubGlobal('Notification', { permission: 'default' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RingsideSessionHeartbeat — devices with no usable push endpoint', () => {
  it('still checks the passcode generation and revokes when serviceWorker is absent', async () => {
    // jsdom's navigator has no serviceWorker, which is exactly the shape that
    // used to throw a TypeError into the swallowing .catch().
    expect('serviceWorker' in navigator).toBe(false);

    renderHeartbeat();

    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith('ringside_claim_generation_current'));
    await waitFor(() => expect(revokeMock).toHaveBeenCalled());
    expect(rpcMock).not.toHaveBeenCalledWith('upsert_ringside_session', expect.anything());
    expect(screen.getByText('ringside')).toBeInTheDocument();
  });

  it('does not revoke when the generation claim is still current', async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });

    renderHeartbeat();

    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith('ringside_claim_generation_current'));
    expect(revokeMock).not.toHaveBeenCalled();
  });

  it('still checks the passcode generation when serviceWorker.ready never settles', async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal('navigator', {
        ...navigator,
        serviceWorker: { ready: new Promise(() => {}) },
      });

      renderHeartbeat();

      // Without the timeout the heartbeat parks here forever and neither of the
      // assertions below ever becomes true.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });

      expect(rpcMock).toHaveBeenCalledWith('ringside_claim_generation_current');
      expect(revokeMock).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
