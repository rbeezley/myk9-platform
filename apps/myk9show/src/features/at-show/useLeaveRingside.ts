/**
 * The way from Ringside back into the main app (MYK9-1086).
 *
 * Ringside mounts full-screen, outside the app shell, so every at-show page
 * needs its own exit. The destination is the user's own dashboard (the same
 * table the app uses after sign-in); a passcode session with no account goes
 * to the public home page.
 */
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '@/hooks/useAuthContext';
import { getDashboardRoute } from '@/hooks/roleUtils';

export const LEAVE_RINGSIDE_LABEL = 'Back to main app';

export function useLeaveRingside(): { label: string; path: string; leave: () => void } {
  const navigate = useNavigate();
  const { getUserRoles } = useAuthContext();
  const roles = getUserRoles();
  const path = roles.length > 0 ? getDashboardRoute(roles) : '/';
  const leave = useCallback(() => navigate(path), [navigate, path]);
  return { label: LEAVE_RINGSIDE_LABEL, path, leave };
}
