import { Card, CardContent } from '@/components/ui/card';
import { MoveUpRequestsTab } from '@/components/entries/MoveUpRequestsTab';
import { PullManagementTab } from '@/components/entries/PullManagementTab';
import { RegistrationNeededPane } from '@/components/entries/RegistrationNeededPane';
import type { RegistrationNeededRow } from '@/components/entries/management/registrationNeeded';
import type { EntryManagementException } from '@/components/entries/management/entryManagementCockpitParams';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { CheckInDesk } from '@/components/entries/management/checkInDesk/CheckInDesk';
import WaitlistManagementPage from './WaitlistManagementPage/index';
import type { EntriesRefresh } from '@/components/entries/management/checkInDesk/storedEntryPatch';

interface EntryManagementExceptionPanesProps {
  showId: string;
  showName?: string | undefined;
  exception: EntryManagementException;
  pulledEntries: EntryManagementEntry[];
  /** Every entry on the show, for the Check-in desk. */
  entries: EntryManagementEntry[];
  /** The entries read failed: every list derived from it is unknown, not empty. */
  entriesUnknown: boolean;
  entriesLoading: boolean;
  registrationNeeded: {
    rows: readonly RegistrationNeededRow[];
    isReady: boolean;
    isError: boolean;
    retry: () => void;
  };
  onRefreshEntries: EntriesRefresh;
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
  showName,
  exception,
  pulledEntries,
  entries,
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
      {exception === 'check-in' && (
        <CheckInDesk
          showId={showId}
          entries={entries}
          loading={entriesLoading}
          unknown={entriesUnknown}
          onRetry={onRefreshEntries}
          onRefreshEntries={onRefreshEntries}
        />
      )}
      {exception === 'waitlist' && <WaitlistManagementPage showId={showId} />}
      {exception === 'registration-needed' && (
        <Card>
          <CardContent className="pt-6">
            <RegistrationNeededPane
              showId={showId}
              showName={showName}
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
