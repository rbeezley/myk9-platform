/**
 * ResultsPrivacySetting — the account's "Show my results publicly" switch
 * (MYK9-969). Off by default.
 *
 * The server enforces it: an entry's results are public only when every person
 * tied to it (owner, co-owner, handler) has this on and the club has not made
 * the show private. This card only writes the person's own choice and explains
 * the rule, so nobody is surprised that a co-owner's choice also counts.
 */
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useExhibitorProfile } from '@/hooks/useExhibitorProfile';
import { getUserFriendlyError } from '@/utils/errorMessages';

const SWITCH_ID = 'results-public';
const HINT_ID = 'results-public-hint';

export function ResultsPrivacySetting() {
  const { profile, profileSettled, setResultsPublic, isSettingResultsPublic } =
    useExhibitorProfile();

  // No profile row (or not loaded yet): there is nothing to write to, and the
  // server already treats the account as private.
  if (!profileSettled || !profile) return null;

  const checked = profile.results_public;

  async function handleToggle(next: boolean) {
    try {
      await setResultsPublic(next);
      toast.success(next ? 'Your results are now public' : 'Your results are now private');
    } catch (error) {
      toast.error(getUserFriendlyError(error));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Results privacy</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <label htmlFor={SWITCH_ID} className="text-sm font-medium">
              Show my results publicly
            </label>
            <p id={HINT_ID} className="text-sm text-muted-foreground">
              {checked
                ? "Other exhibitors and the public can see your dogs' scores, times and placements."
                : "Only you, your dogs' co-owners and handlers, and show staff can see your results. Others see “Private entry” at your place."}
            </p>
            <p className="text-xs text-muted-foreground">
              A result is public only when everyone on the entry (owner, co-owner and handler) has
              this on. Clubs can also keep a whole show private. Official reports are not affected.
            </p>
          </div>
          {/* 44px tap target around the switch (PRODUCT.md touch floor). */}
          <label
            htmlFor={SWITCH_ID}
            className="flex min-h-[44px] min-w-[44px] shrink-0 cursor-pointer items-center justify-center"
          >
            <Switch
              id={SWITCH_ID}
              aria-label="Show my results publicly"
              aria-describedby={HINT_ID}
              checked={checked}
              onCheckedChange={handleToggle}
              disabled={isSettingResultsPublic}
            />
          </label>
        </div>
      </CardContent>
    </Card>
  );
}
