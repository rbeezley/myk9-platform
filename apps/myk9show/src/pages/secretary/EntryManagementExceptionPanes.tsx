import { Card, CardContent } from '@/components/ui/card';
import { MoveUpRequestsTab } from '@/components/entries/MoveUpRequestsTab';
import { PullManagementTab } from '@/components/entries/PullManagementTab';
import { RegistrationNeededTab } from '@/components/entries/RegistrationNeededTab';
import type { RegistrationNeededRow } from '@/components/entries/management/registrationNeeded';
import type { EntryManagementException } from '@/components/entries/management/entryManagementCockpitParams';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import WaitlistManagementPage from './WaitlistManagementPage/index';

interface EntryManagementExceptionPanesProps {
  showId: string;
  exception: EntryManagementException;
  pulledEntries: EntryManagementEntry[];
  /** The entries read failed: every list derived from it is unknown, not empty. */
  entriesUnknown: boolean;
  entriesLoading: boolean;
  registrationNeeded: {
    rows: readonly RegistrationNeededRow[];
    isReady: boolean;
    isError: boolean;
    retry: () => void;
  };
  onRefreshEntries: () => void;
  onMoveUpsChanged: () => void;
  onOpenEntry: (entry: EntryManagementEntry) => void;
}

/**
 * The Entries cockpit's "Other lists": one pane per exception, selected by the
 * URL's `exception`. Split out of `EntryManagementPage` so the page does not
 * grow a branch per list.
 */
export function EntryManagementExceptionPanes({
  showId,
  exception,
  pulledEntries,
  entriesUnknown,
  entriesLoading,
  registrationNeeded,
  onRefreshEntries,
  onMoveUpsChanged,
  onOpenEntry,
}: EntryManagementExceptionPanesProps) {
  return (
    <div className="mt-6">
      {exception === 'move-ups' && (
        <Card>
          <CardContent className="pt-6">
            <MoveUpRequestsTab showId={showId} onRefresh={onMoveUpsChanged} />
          </CardContent>
        </Card>
      )}
      {exception === 'pulls' && (
        <Card>
          <CardContent className="pt-6">
            <PullManagementTab
              processedEntries={pulledEntries}
              processedEntriesUnknown={entriesUnknown}
              processedEntriesLoading={entriesLoading}
              onRefresh={onRefreshEntries}
            />
          </CardContent>
        </Card>
      )}
      {exception === 'waitlist' && <WaitlistManagementPage showId={showId} />}
      {exception === 'registration-needed' && (
        <Card>
          <CardContent className="pt-6">
            <RegistrationNeededTab
              rows={registrationNeeded.rows}
              loading={
                entriesLoading || (!registrationNeeded.isReady && !registrationNeeded.isError)
              }
              unknown={entriesUnknown || registrationNeeded.isError}
              onRetry={registrationNeeded.isError ? registrationNeeded.retry : undefined}
              onOpenEntry={onOpenEntry}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
