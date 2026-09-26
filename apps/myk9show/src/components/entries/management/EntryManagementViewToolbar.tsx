/**
 * Page-level view row for Entry Management (MYK9-795): one `ListViewTabs`
 * replacing the Registrations/Exceptions `PrimaryTabs`, the queue
 * buttons-with-counts, AND the Exceptions sub-tab buttons, plus the
 * `ListFilterBar` for the four registration-queue views (Trial, Class,
 * Payment status, search). The three exception views (Waitlist, Pulls,
 * Move-ups) render their own search-only filter bar inside their own
 * component, so nothing else is rendered here for them.
 */
import { ListFilterBar, ListViewTabs } from '@/components/list-toolkit';
import type { PaymentStatus } from '@/types/show-registration-types';
import type {
  EntryManagementTrial,
  EntryManagementTrialClass,
} from '@/hooks/useEntryManagementTrialScope';
import {
  entryManagementViewId,
  type EntryManagementCockpitState,
  type EntryManagementViewId,
} from './entryManagementCockpitParams';
import { buildEntryManagementFilterFields } from './entryManagementFilterFields';
import { buildEntryManagementViews, type EntryManagementViewCounts } from './entryManagementViews';

interface EntryManagementViewToolbarProps {
  state: EntryManagementCockpitState;
  counts: EntryManagementViewCounts;
  trials: readonly EntryManagementTrial[];
  trialClasses: readonly EntryManagementTrialClass[];
  onSelectView: (viewId: EntryManagementViewId) => void;
  onScopeChange: (trialId: string | null, classId?: string | null) => void;
  onPaymentStatusChange: (status: PaymentStatus | null) => void;
  onSearchChange: (value: string) => void;
  onClearAll: () => void;
}

export function EntryManagementViewToolbar({
  state,
  counts,
  trials,
  trialClasses,
  onSelectView,
  onScopeChange,
  onPaymentStatusChange,
  onSearchChange,
  onClearAll,
}: EntryManagementViewToolbarProps) {
  const views = buildEntryManagementViews(counts);
  const activeId = entryManagementViewId(state);
  const isRegistrationsView = state.tab === 'registrations';

  return (
    <div className="flex flex-col gap-3">
      <ListViewTabs
        label="Entry views"
        views={views}
        activeId={activeId}
        onSelect={id => onSelectView(id as EntryManagementViewId)}
      />
      {isRegistrationsView && (
        <ListFilterBar
          searchValue={state.search}
          onSearchChange={onSearchChange}
          searchPlaceholder="Search exhibitor, dog, handler, armband, confirmation, class…"
          fields={buildEntryManagementFilterFields({
            state,
            trials,
            trialClasses,
            onScopeChange,
            onPaymentStatusChange,
          })}
          onClearAll={onClearAll}
        />
      )}
    </div>
  );
}
