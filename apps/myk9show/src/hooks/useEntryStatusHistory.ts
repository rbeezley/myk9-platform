import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserRole } from '@/types/auth-types';
import { useAuthContext } from '@/hooks/useAuthContext';
import {
  getEntryStatusHistory,
  type EntryStatusHistoryItem,
} from '@/services/database/entries/statusHistory';

const ENTRY_HISTORY_STAFF_ROLES = new Set<UserRole>([
  UserRole.SECRETARY,
  UserRole.CLUB_ADMIN,
  UserRole.SITE_ADMIN,
  UserRole.CHAIRMAN,
  UserRole.STEWARD,
]);

export function useEntryStatusHistory(entryId: string, enabled: boolean) {
  const { userWithRoles } = useAuthContext();
  const canViewHistory =
    userWithRoles?.roles.some(role => ENTRY_HISTORY_STAFF_ROLES.has(role)) ?? false;

  const { refetch, ...query } = useQuery<EntryStatusHistoryItem[]>({
    queryKey: ['entry-status-history', entryId],
    queryFn: () => getEntryStatusHistory(entryId),
    enabled: Boolean(entryId) && enabled && canViewHistory,
    staleTime: 30_000,
    retry: false,
  });

  const [isOffline, setIsOffline] = useState(
    () => typeof navigator !== 'undefined' && !navigator.onLine
  );

  useEffect(() => {
    const handleOffline = () => setIsOffline(true);
    const handleOnline = () => {
      setIsOffline(false);
      if (enabled && canViewHistory) void refetch();
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [canViewHistory, enabled, refetch]);

  return {
    ...query,
    refetch,
    canViewHistory,
    isOffline,
  };
}
