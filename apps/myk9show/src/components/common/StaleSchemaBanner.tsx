import { useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { applyPwaUpdate } from '@/services/pwa/pwaUpdate';
import { getStaleSchemaSnapshot, subscribeStaleSchema } from '@/services/pwa/staleSchemaRecovery';

/**
 * Persistent notice once the offline database and this build disagree
 * (MYK9-1663). Mounted once in the app shell so route changes never unmount it.
 *
 * INTENT: a judge mid-scoresheet is never reloaded by surprise. The banner
 * cannot be dismissed; queued scores stay safe in the newer build's database.
 */
export function StaleSchemaBanner() {
  const stale = useSyncExternalStore(subscribeStaleSchema, getStaleSchemaSnapshot);
  if (!stale) return null;

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted px-4 py-3 text-sm text-foreground"
    >
      <span>myK9Show was updated. Reload to keep working offline.</span>
      <Button type="button" className="min-h-11 min-w-11" onClick={() => void applyPwaUpdate()}>
        Reload
      </Button>
    </div>
  );
}
