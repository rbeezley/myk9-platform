import React, { useEffect } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ShieldAlert } from 'lucide-react';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useOnlineStatus } from '@/lib/networkUtils';
import { OFFLINE_SAVED_MESSAGE } from '@/lib/offlineCopy';
import { OFFLINE_TOAST_ID } from './networkStatusToast';

/**
 * Visible marker that role/permission data is being served from the
 * device-local cache because the network fetch failed on a cold boot
 * (MYK9-200). Renders nothing while permissions are live. Offset above
 * NetworkStatusIndicator's slot so the two notices stack instead of overlap.
 */
export const RbacOfflineNotice: React.FC = () => {
  const { rbacFromCacheAt } = useAuthContext();
  const isOnline = useOnlineStatus();
  const showsOfflineSentence = Boolean(rbacFromCacheAt) && !isOnline;

  // One offline message, not two (MYK9-2014): this card carries the "saved on this
  // device" sentence, so the offline toast is dropped. The provider's own effect runs
  // after this one on a shared mount, hence the deferred dismiss.
  useEffect(() => {
    if (!showsOfflineSentence) return;
    const timer = setTimeout(() => toast.dismiss(OFFLINE_TOAST_ID), 0);
    return () => clearTimeout(timer);
  }, [showsOfflineSentence]);

  if (!rbacFromCacheAt) return null;

  const asOf = new Date(rbacFromCacheAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div className="pointer-events-none fixed bottom-24 left-4 right-4 z-50 md:left-auto md:right-4 md:max-w-sm">
      <Alert className="pointer-events-none border-orange-200 bg-orange-50">
        <ShieldAlert className="h-4 w-4 text-orange-600" />
        <AlertDescription>
          <div className="font-medium text-orange-800">Working offline</div>
          <div className="text-sm text-orange-800">
            Using your saved permissions as of {asOf}. They will refresh automatically when the
            connection returns.
          </div>
          {showsOfflineSentence && (
            <div className="text-sm text-orange-800">{OFFLINE_SAVED_MESSAGE}</div>
          )}
        </AlertDescription>
      </Alert>
    </div>
  );
};
