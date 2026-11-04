import { useAuthContext } from '@/hooks/useAuthContext';

/**
 * Who may send a targeted show message (class, checked-in, or one exhibitor). Club admins
 * are announcements-only, and the send-targeted-message function rejects them, so every
 * targeted-send entry point reads this one rule.
 */
export function useCanSendTargetedShowMessages(): boolean {
  const { isSecretary, isAdmin, hasRole } = useAuthContext();
  return isSecretary || isAdmin || hasRole('trial_secretary');
}
