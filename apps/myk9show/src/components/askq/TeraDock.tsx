import { useIsOnline } from '@/hooks/useNetworkStatus';
import { TERA_IDLE_COPY, TERA_OFFLINE_COPY } from './askq-config';
import { TeraAvatar } from './TeraAvatar';

/**
 * Tera on an empty AskQ panel (MYK9-851): idle while online, napping while
 * offline, with copy saying AskQ needs a connection but show data does not.
 * Online state comes from the app's NetworkStatusProvider, the same source the
 * replication sync reads; there is no second detector.
 */
export function TeraDock({ children }: { children?: React.ReactNode }) {
  const isOnline = useIsOnline();

  return (
    <div className="space-y-3">
      <div
        role="status"
        aria-label={isOnline ? TERA_IDLE_COPY : TERA_OFFLINE_COPY}
        className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/45 px-3.5 py-3"
      >
        <TeraAvatar state={isOnline ? 'idle' : 'napping'} />
        <p className="text-sm text-muted-foreground">
          {isOnline ? TERA_IDLE_COPY : TERA_OFFLINE_COPY}
        </p>
      </div>
      {/* Example questions would only fail offline. */}
      {isOnline && children}
    </div>
  );
}
