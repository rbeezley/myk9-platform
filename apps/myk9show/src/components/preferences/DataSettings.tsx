/**
 * Data Settings Component
 *
 * Local storage / cache management. myK9Show is offline-first automatically —
 * there are no user-facing sync/bandwidth knobs to configure.
 */

import { useState, type MouseEvent } from 'react';
import { HardDrive } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { databaseManager, REPLICATION_STORES } from '@myk9/replication';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { useOfflineScoringStore } from '@/store/offlineScoringStore';
import { withCacheClearLock } from '@/services/cacheClearGate';
import { decideClearCache } from './clearCacheGuard';

const CACHE_KEYS_TO_CLEAR = [
  'myk9-cart-storage',
  'draft-storage',
  'armband-storage',
  'myk9-notification-preferences',
  'myk9show-offline-scoring-storage',
];
const DISPOSABLE_DATABASES = ['myK9ShowDB'];

export function DataSettings() {
  const queryClient = useQueryClient();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const inspectPendingWork = async () => {
    const replicationDb = await databaseManager.getDatabase(REPLICATION_STORES.PENDING_MUTATIONS);
    const pendingMutationCount = await replicationDb.count(REPLICATION_STORES.PENDING_MUTATIONS);
    const offlineSyncQueueCount = useOfflineScoringStore.getState().syncQueue.length;
    return decideClearCache({ pendingMutationCount, offlineSyncQueueCount });
  };

  const handleClearCache = async () => {
    setIsChecking(true);
    setCheckError(null);
    try {
      const decision = await inspectPendingWork();

      if (!decision.allowed) {
        setPendingCount(decision.pendingCount);
        return;
      }

      setPendingCount(0);
      setIsConfirmOpen(true);
    } catch {
      setPendingCount(0);
      setCheckError('We could not verify unsynced changes. Connect and sync before clearing.');
    } finally {
      setIsChecking(false);
    }
  };

  const clearCache = () => {
    for (const key of CACHE_KEYS_TO_CLEAR) {
      localStorage.removeItem(key);
    }

    queryClient.clear();

    for (const databaseName of DISPOSABLE_DATABASES) {
      try {
        window.indexedDB?.deleteDatabase(databaseName);
      } catch {
        // IndexedDB cleanup is best-effort.
      }
    }

    window.location.reload();
  };

  const handleConfirmClearCache = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsChecking(true);
    setCheckError(null);
    try {
      const result = await withCacheClearLock(async () => {
        const decision = await inspectPendingWork();
        if (!decision.allowed) {
          setIsConfirmOpen(false);
          setPendingCount(decision.pendingCount);
          return false;
        }

        clearCache();
        return true;
      });
      if (result === null) {
        setCheckError('Another cache clear is already in progress. Try again in a moment.');
      }
    } catch {
      setIsConfirmOpen(false);
      setPendingCount(0);
      setCheckError('We could not verify unsynced changes. Connect and sync before clearing.');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            Local Storage
          </CardTitle>
          <CardDescription>Manage data cached on this device</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label className="font-medium">Clear Cached Data</Label>
              <div className="text-sm text-muted-foreground">
                Removes disposable local cache data and reloads the app. Your account settings and
                login are preserved.
              </div>
            </div>
            <Button variant="outline" size="lg" onClick={handleClearCache} disabled={isChecking}>
              {isChecking ? 'Checking…' : 'Clear Cache'}
            </Button>
          </div>
          {pendingCount > 0 && (
            <p role="alert" className="text-sm font-medium text-destructive">
              You have {pendingCount} unsynced {pendingCount === 1 ? 'change' : 'changes'}. Connect
              and sync before clearing cached data.
            </p>
          )}
          {checkError && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {checkError}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            myK9Show works offline automatically — show data is stored on your device and syncs when
            you're back online.
          </p>
        </CardContent>
      </Card>

      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear disposable cache data?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes cached show data, cart contents, drafts, armband data, and notification
              preferences from this device. Your account settings, login, and unsynced changes are
              not removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep cached data</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmClearCache} disabled={isChecking}>
              {isChecking ? 'Checking…' : 'Clear cache and reload'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
