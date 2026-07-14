import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleRingsidePasscodeRevoked,
  isPasscodeRegeneratedError,
  isPasscodeRegeneratedMessage,
  PASSCODE_REGENERATED_DB_MESSAGE,
  PASSCODE_REVOKED_TOAST_MESSAGE,
  revokeRingsidePasscodeAccess,
} from './ringsidePasscodeRevocation';
import { useRingsideGrantStore } from '@/store/ringsideGrantStore';

const { toastErrorMock, getSessionMock, signOutMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
  getSessionMock: vi.fn(),
  signOutMock: vi.fn(() => Promise.resolve({ error: null })),
}));

vi.mock('sonner', () => ({
  toast: { error: toastErrorMock },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
      signOut: signOutMock,
    },
  },
}));

function regeneratedError() {
  return { code: '42501', message: PASSCODE_REGENERATED_DB_MESSAGE };
}

describe('ringsidePasscodeRevocation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ data: { session: null } });
    useRingsideGrantStore.setState({ activeGrant: null, suppressRehydration: false });
  });

  describe('isPasscodeRegeneratedError', () => {
    it('matches ONLY the specific 42501 regeneration error', () => {
      expect(isPasscodeRegeneratedError(regeneratedError())).toBe(true);
    });

    it('does not match a generic 42501 "not authorized" denial', () => {
      expect(
        isPasscodeRegeneratedError({ code: '42501', message: 'Not authorized to update entry x' })
      ).toBe(false);
    });

    it('does not match other error codes or non-errors', () => {
      expect(isPasscodeRegeneratedError({ code: '40001', message: 'Version conflict' })).toBe(
        false
      );
      expect(isPasscodeRegeneratedError(null)).toBe(false);
      expect(isPasscodeRegeneratedError('boom')).toBe(false);
    });
  });

  describe('isPasscodeRegeneratedMessage', () => {
    it('matches the regeneration message wrapped in the replication error string', () => {
      // The replication queue collapses a failed score-write to this string shape.
      expect(
        isPasscodeRegeneratedMessage(`Non-retryable error: ${PASSCODE_REGENERATED_DB_MESSAGE}`)
      ).toBe(true);
    });

    it('does not match a generic non-retryable failure', () => {
      expect(isPasscodeRegeneratedMessage('Non-retryable error: permission denied')).toBe(false);
      expect(isPasscodeRegeneratedMessage(undefined)).toBe(false);
      expect(isPasscodeRegeneratedMessage(null)).toBe(false);
    });
  });

  describe('revokeRingsidePasscodeAccess', () => {
    it('surfaces the toast, drops the grant, and signs out an anon session', async () => {
      useRingsideGrantStore.setState({
        activeGrant: { showId: 'show-1', role: 'judge', source: 'passcode' },
      });
      getSessionMock.mockResolvedValue({ data: { session: { user: { is_anonymous: true } } } });

      revokeRingsidePasscodeAccess();

      expect(toastErrorMock).toHaveBeenCalledWith(PASSCODE_REVOKED_TOAST_MESSAGE);
      expect(useRingsideGrantStore.getState().activeGrant).toBeNull();
      await vi.waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
    });

    // Closes the race where useRehydrateRingsideGrant could see "no grant,
    // but a still-claim-shaped session" in the gap between clearGrant() and
    // signOut() resolving, and re-admit the just-revoked user.
    it('suppresses rehydration synchronously, clearing it only after the anon signOut resolves', async () => {
      getSessionMock.mockResolvedValue({ data: { session: { user: { is_anonymous: true } } } });

      revokeRingsidePasscodeAccess();

      // Suppressed the instant clearGrant() fires — before any await.
      expect(useRingsideGrantStore.getState().suppressRehydration).toBe(true);

      await vi.waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
      await vi.waitFor(() =>
        expect(useRingsideGrantStore.getState().suppressRehydration).toBe(false)
      );
    });

    it('clears suppression immediately for a signed-in account (no anon session to sign out)', async () => {
      getSessionMock.mockResolvedValue({ data: { session: { user: { is_anonymous: false } } } });

      revokeRingsidePasscodeAccess();

      expect(useRingsideGrantStore.getState().suppressRehydration).toBe(true);
      await vi.waitFor(() =>
        expect(useRingsideGrantStore.getState().suppressRehydration).toBe(false)
      );
      expect(signOutMock).not.toHaveBeenCalled();
    });
  });

  describe('handleRingsidePasscodeRevoked', () => {
    it('surfaces the "access revoked — re-enter code" toast and reports handled', () => {
      const handled = handleRingsidePasscodeRevoked(regeneratedError());

      expect(handled).toBe(true);
      expect(toastErrorMock).toHaveBeenCalledWith(PASSCODE_REVOKED_TOAST_MESSAGE);
    });

    it('clears an active account grant so the gate stops admitting the show', () => {
      useRingsideGrantStore.setState({
        activeGrant: { showId: 'show-1', role: 'judge', source: 'passcode' },
      });

      handleRingsidePasscodeRevoked(regeneratedError());

      expect(useRingsideGrantStore.getState().activeGrant).toBeNull();
    });

    it('signs out an anonymous passcode session to route back to sign-in', async () => {
      getSessionMock.mockResolvedValue({
        data: { session: { user: { is_anonymous: true } } },
      });

      handleRingsidePasscodeRevoked(regeneratedError());

      await vi.waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
    });

    it('does NOT sign out a signed-in account session (only drops the grant)', async () => {
      getSessionMock.mockResolvedValue({
        data: { session: { user: { is_anonymous: false } } },
      });

      handleRingsidePasscodeRevoked(regeneratedError());

      await Promise.resolve();
      await Promise.resolve();
      expect(signOutMock).not.toHaveBeenCalled();
    });

    it('ignores unrelated errors (no toast, returns false)', () => {
      const handled = handleRingsidePasscodeRevoked({ code: '40001', message: 'Version conflict' });

      expect(handled).toBe(false);
      expect(toastErrorMock).not.toHaveBeenCalled();
    });
  });
});
