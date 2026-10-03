import { Check } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { EntryDataUnavailablePanel } from '@/components/shows/ShowDetails/EntryDataUnavailablePanel';
import type { ShowDetailTabsProps } from '@/components/shows/ShowDetails/ShowDetailTabs';
import { SetupClassesSection } from '@/components/shows/tabs/SetupClassesSection';
import { SELECT_CLASSES_PARAMS } from '@/pages/secretary/selectClassesRoutes';

/**
 * "Select classes" on the show home (MYK9-956): Class Management in place,
 * with its bulk bar, one-trial-at-a-time selection and per-row judge picker.
 * "Done" returns to the schedule and drops the mode's own params.
 */
export function HomeClassSelection({
  showId,
  tabs,
}: {
  showId: string;
  tabs: Pick<
    ShowDetailTabsProps,
    'trials' | 'classes' | 'hasUserEntries' | 'entryDataState' | 'onRetryEntryData'
  >;
}) {
  const [, setSearchParams] = useSearchParams();
  const entryDataState = tabs.entryDataState ?? 'ready';

  const done = () =>
    setSearchParams(
      previous => {
        const params = new URLSearchParams(previous);
        params.delete('select');
        for (const key of SELECT_CLASSES_PARAMS) params.delete(key);
        return params;
      },
      { replace: true, preventScrollReset: true }
    );

  return (
    <section className="space-y-4" aria-labelledby="home-select-classes-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="home-select-classes-title" className="text-2xl font-semibold tracking-tight">
            Select classes
          </h2>
          <p className="text-sm text-muted-foreground">
            Pick classes in one trial to change status, export or delete them together.
          </p>
        </div>
        <Button type="button" className="min-h-11 gap-2" onClick={done}>
          <Check className="h-4 w-4" aria-hidden="true" />
          Done
        </Button>
      </div>
      {entryDataState !== 'ready' ? (
        <EntryDataUnavailablePanel state={entryDataState} onRetry={tabs.onRetryEntryData} />
      ) : (
        <SetupClassesSection
          showId={showId}
          trials={tabs.trials}
          classes={tabs.classes}
          userHasEntries={tabs.hasUserEntries}
        />
      )}
    </section>
  );
}
