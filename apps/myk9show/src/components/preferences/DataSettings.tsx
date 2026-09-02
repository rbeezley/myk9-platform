/**
 * Data Settings Component
 *
 * Local storage / cache management. myK9Show is offline-first automatically —
 * there are no user-facing sync/bandwidth knobs to configure.
 */

import { HardDrive } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { databaseManager, REPLICATION_STORES } from '@myk9/replication';
import { useOfflineScoringStore } from '@/store/offlineScoringStore';

const DISPOSABLE_STORAGE_KEYS = [
  'myk9-notification-preferences',
  'myk9-cart-storage',
  'draft-storage',
  'armband-storage',
  'myk9show-offline-scoring-storage',
];
const DISPOSABLE_DATABASE_NAMES = ['myK9ShowDB'];

export function hasPendingOfflineWork(pendingMutations: number, pendingScores: number): boolean {
  return pendingMutations > 0 || pendingScores > 0;
}

async function getPendingOfflineWorkCount(): Promise<{ mutations: number; scores: number }> {
  const db = await databaseManager.getDatabase('data-settings-clear-cache');
  return {
    mutations: await db.count(REPLICATION_STORES.PENDING_MUTATIONS),
    scores: useOfflineScoringStore.getState().syncQueue.length,
  };
}

export function DataSettings() {
  const queryClient = useQueryClient();

  const handleClearCache = async () => {
    const { mutations, scores } = await getPendingOfflineWorkCount();
    const pendingCount = mutations + scores;
    if (hasPendingOfflineWork(mutations, scores)) {
      window.alert(
        `You have ${pendingCount} unsynced change${pendingCount === 1 ? '' : 's'}. Connect and sync before clearing cached data.`
      );
      return;
    }

    const confirmed = window.confirm(
      'This will remove cached query data, drafts, preferences, and local scoring data, then reload the app. Your settings, login, and unsynced changes will be preserved. Continue?'
    );
    if (!confirmed) return;

    for (const key of DISPOSABLE_STORAGE_KEYS) {
      localStorage.removeItem(key);
    }

    // Supabase auth and settings are intentionally untouched.

    queryClient.clear();

    try {
      for (const databaseName of DISPOSABLE_DATABASE_NAMES) {
        window.indexedDB?.deleteDatabase(databaseName);
      }
    } catch {
      // IndexedDB cleanup is best-effort
    }

    window.location.reload();
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
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="font-medium">Clear Cached Data</Label>
              <div className="text-sm text-muted-foreground">
                Removes locally cached data and reloads the app. Your settings and login are
                preserved.
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleClearCache}>
              Clear Cache
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            myK9Show works offline automatically — show data is stored on your device and syncs when
            you're back online.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
