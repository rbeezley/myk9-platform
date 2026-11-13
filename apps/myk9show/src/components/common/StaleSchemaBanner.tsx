import { useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { UPDATE_THE_APP_LABEL } from '@/lib/offlineCopy';
import { applyPwaUpdate } from '@/services/pwa/pwaUpdate';
import { getStaleSchemaSnapshot, subscribeStaleSchema } from '@/services/pwa/staleSchemaRecovery';

/**
 * Persistent notice once the offline database and this build disagree
 * (MYK9-1663). Mounted once in the app shell so route changes never unmount it.
 *
 * INTENT: a judge mid-scoresheet is never reloaded by surprise. The banner
 * cannot be dismissed; queued scores stay safe in the newer build's database.
 */
const RELOAD_FALLBACK_MS = 1500;

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

const getOnline = (): boolean => navigator.onLine !== false;

export function StaleSchemaBanner() {
  const stale = useSyncExternalStore(subscribeStaleSchema, getStaleSchemaSnapshot);
  const online = useSyncExternalStore(subscribeOnline, getOnline);
  if (!stale) return null;

  // applyPwaUpdate() reloads only when a worker is waiting and we are online;
  // otherwise the page (and the latch) would stay. The click is the user's
  // choice, so a plain reload after a grace period is allowed.
  const reload = async () => {
    await applyPwaUpdate();
    setTimeout(() => window.location.reload(), RELOAD_FALLBACK_MS);
  };

  return (
    <div
      role="alert"
      // Same offset mechanism as RingsideReturnBar: clear the fixed AppHeader
      // (and the install banner above it) so Reload is never covered.
      className="sticky top-[calc(var(--pwa-banner-height,0px)+var(--app-header-height,3rem))] z-30 mt-[calc(var(--pwa-banner-height,0px)+var(--app-header-height,3rem))] flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted px-4 py-3 text-sm text-foreground"
    >
      <span>
        {online
          ? 'myK9Show was updated. Update the app to keep working offline.'
          : 'Connect to the internet, then update the app.'}
      </span>
      <Button
        type="button"
        className="min-h-11 min-w-11"
        disabled={!online}
        onClick={() => void reload()}
      >
        {UPDATE_THE_APP_LABEL}
      </Button>
    </div>
  );
}
