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

const PRESERVED_KEYS = ['myK9Q_settings'];

export function DataSettings() {
  const queryClient = useQueryClient();

  const handleClearCache = async () => {
    const confirmed = window.confirm(
      'This will clear all cached data and reload the app. Your settings and login will be preserved. Continue?'
    );
    if (!confirmed) return;

    const preserved = new Map<string, string>();
    for (const key of PRESERVED_KEYS) {
      const value = localStorage.getItem(key);
      if (value !== null) preserved.set(key, value);
    }
    // Supabase auth key uses dynamic prefix (sb-<ref>-auth-token)
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('sb-') && key.includes('auth-token')) {
        preserved.set(key, localStorage.getItem(key)!);
      }
    }
    localStorage.clear();
    for (const [key, value] of preserved) {
      localStorage.setItem(key, value);
    }

    queryClient.clear();

    // Firefox doesn't support indexedDB.databases()
    try {
      if (window.indexedDB?.databases) {
        const dbs = await window.indexedDB.databases();
        for (const db of dbs) {
          if (db.name) window.indexedDB.deleteDatabase(db.name);
        }
      } else if (window.indexedDB) {
        window.indexedDB.deleteDatabase('myK9ShowDB');
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
