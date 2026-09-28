/**
 * ShowCheckinToggle — show-level self check-in switch (the cascade root).
 * Lifted out of the former SelfCheckinSection so the per-trial/class toggles
 * could merge into the unified OverrideTree.
 */

import { Switch } from '@/components/ui/switch';
import { useUpdateShowCheckin } from '@/hooks/mutations/useShowSettingsMutations';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { NEEDS_CONNECTION_HINT } from '@/lib/needsConnectionHint';
import { toast } from 'sonner';

interface ShowCheckinToggleProps {
  showId: string;
  enabled: boolean;
}

export function ShowCheckinToggle({ showId, enabled }: ShowCheckinToggleProps) {
  const updateCheckin = useUpdateShowCheckin();
  const { isOnline } = useNetworkStatus();
  const connectionHint = isOnline ? undefined : NEEDS_CONNECTION_HINT;

  function handleToggle(next: boolean) {
    updateCheckin.mutate(
      { showId, enabled: next },
      {
        onSuccess: () => toast.success(`Self check-in ${next ? 'enabled' : 'disabled'} for show`),
        onError: () => toast.error('Failed to update check-in setting'),
      }
    );
  }

  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <div>
        <p className="text-sm font-medium">Allow self check-in</p>
        <p className="text-xs text-muted-foreground">
          Exhibitors can check themselves in via the app
        </p>
        {connectionHint && (
          <p className="text-xs text-muted-foreground" role="status">
            {connectionHint}
          </p>
        )}
      </div>
      {/* 44px tap row enlarges the hit area around the ~20px switch (PRODUCT.md touch floor). */}
      <label
        htmlFor="checkin-show"
        className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center"
        title={connectionHint}
      >
        <Switch
          id="checkin-show"
          aria-label="Allow self check-in for show"
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={updateCheckin.isPending || !isOnline}
        />
      </label>
    </div>
  );
}
