/**
 * Page-level view row for Entry Management (MYK9-795): one `ListViewTabs`
 * replacing the Registrations/Exceptions `PrimaryTabs`, the queue
 * buttons-with-counts, AND the Exceptions sub-tab buttons, plus the
 * `ListFilterBar` for the four registration-queue views (Trial, Class,
 * Payment status, search). The three exception views (Waitlist, Pulls,
 * Move-ups) render their own search-only filter bar inside their own
 * component, so nothing else is rendered here for them.
 */
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ListFilterBar, ListViewTabs } from '@/components/list-toolkit';
import type { PaymentStatus } from '@/types/show-registration-types';
import type {
  EntryManagementTrial,
  EntryManagementTrialClass,
} from '@/hooks/useEntryManagementTrialScope';
import { DensityControl } from '@/features/operational-views/DensityControl';
import type { OperationalViewDensity } from '@/features/operational-views/operationalViews';
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
  density: OperationalViewDensity;
  onSelectView: (viewId: EntryManagementViewId) => void;
  onScopeChange: (trialId: string | null, classId?: string | null) => void;
  onPaymentStatusChange: (status: PaymentStatus | null) => void;
  onSearchChange: (value: string) => void;
  onDensityChange: (density: OperationalViewDensity) => void;
  onClearAll: () => void;
}

export function EntryManagementViewToolbar({
  state,
  counts,
  trials,
  trialClasses,
  density,
  onSelectView,
  onScopeChange,
  onPaymentStatusChange,
  onSearchChange,
  onDensityChange,
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
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
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
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="min-h-11 shrink-0 gap-2">
                <SlidersHorizontal className="h-4 w-4" aria-hidden />
                Density
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto">
              <p className="mb-2 text-sm font-semibold">Registration row density</p>
              <DensityControl density={density} onChange={onDensityChange} />
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
}
