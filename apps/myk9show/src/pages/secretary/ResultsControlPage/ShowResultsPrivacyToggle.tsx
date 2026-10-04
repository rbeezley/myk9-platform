/**
 * ShowResultsPrivacyToggle — the club's show-wide "keep results private"
 * switch (MYK9-969), beside the other show defaults on the Results page.
 *
 * It only ever adds privacy: each exhibitor still sees their own dogs'
 * results, staff see everything, and reports are unchanged. It never makes an
 * exhibitor's private results public — that choice stays on their account.
 */

import { Switch } from '@/components/ui/switch';
import { useUpdateShowResultsPrivacy } from '@/hooks/mutations/useShowSettingsMutations';
import { useConnectionHint } from '@/hooks/useConnectionHint';
import { toast } from 'sonner';

interface ShowResultsPrivacyToggleProps {
  showId: string;
  resultsPrivate: boolean;
}

const SWITCH_ID = 'results-private-show';
const HINT_ID = 'results-private-show-hint';

export function ShowResultsPrivacyToggle({
  showId,
  resultsPrivate,
}: ShowResultsPrivacyToggleProps) {
  const updatePrivacy = useUpdateShowResultsPrivacy();
  const connectionHint = useConnectionHint();

  function handleToggle(next: boolean) {
    updatePrivacy.mutate(
      { showId, resultsPrivate: next },
      {
        onSuccess: () =>
          toast.success(
            next
              ? 'Results are now private for this show'
              : 'Results privacy follows each exhibitor'
          ),
        onError: () => toast.error('Failed to update results privacy'),
      }
    );
  }

  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <div>
        <p className="text-sm font-medium">Keep this show&apos;s results private</p>
        <p className="text-xs text-muted-foreground" id={HINT_ID}>
          {resultsPrivate
            ? 'Only each exhibitor (for their own dogs) and show staff see results. Reports are unchanged.'
            : "Each exhibitor's own privacy setting decides. Results are public only when everyone on the entry opted in."}
        </p>
        {connectionHint && (
          <p className="text-xs text-muted-foreground" role="status">
            {connectionHint}
          </p>
        )}
      </div>
      {/* 44px tap row enlarges the hit area around the ~20px switch (PRODUCT.md touch floor). */}
      <label
        htmlFor={SWITCH_ID}
        className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center"
        title={connectionHint}
      >
        <Switch
          id={SWITCH_ID}
          aria-label="Keep this show's results private"
          aria-describedby={HINT_ID}
          checked={resultsPrivate}
          onCheckedChange={handleToggle}
          disabled={updatePrivacy.isPending || Boolean(connectionHint)}
        />
      </label>
    </div>
  );
}
