/**
 * Entry Management's display-preset + saved-view header cluster (tasks.md
 * 3.2/3.3). Thin adapter over the shared `DensityControl`/`SavedViewsControl`
 * — keeps `RegistrationView.tsx` from growing past its size budget.
 */
import { DensityControl } from '@/features/operational-views/DensityControl';
import { SavedViewsControl } from '@/features/operational-views/SavedViewsControl';
import {
  OPERATIONAL_VIEW_SERIALIZATION_VERSION,
  type EntryManagementOperationalView,
  type OperationalViewDensity,
} from '@/features/operational-views/operationalViews';
import type { SavedViewShowScope } from '@/features/operational-views/localViewPreferences';
import {
  isEntryPaymentFilter,
  type EntryAttentionFilter,
  type EntryManagementViewMode,
  type EntryWorkMode,
} from './entryManagementFilters';

interface EntryManagementViewControlsProps {
  density: OperationalViewDensity;
  onDensityChange: (density: OperationalViewDensity) => void;
  userId: string | null | undefined;
  showId: string | undefined;
  trialFilter: string | null;
  classFilter: string | null;
  attentionFilter: EntryAttentionFilter;
  /** `RegistrationView` types this as `string`; normalized here via `isEntryPaymentFilter`. */
  paymentFilter: string;
  workMode: EntryWorkMode;
  entryViewMode: EntryManagementViewMode;
  /** Applies a restored view through the same normalized-URL setters presets use. */
  onApplyView: (view: EntryManagementOperationalView) => void;
}

export function EntryManagementViewControls({
  density,
  onDensityChange,
  userId,
  showId,
  trialFilter,
  classFilter,
  attentionFilter,
  paymentFilter,
  workMode,
  entryViewMode,
  onApplyView,
}: EntryManagementViewControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <DensityControl density={density} onChange={onDensityChange} />
      {showId && (
        <SavedViewsControl<EntryManagementOperationalView>
          surface="entry-management"
          userId={userId}
          showScope={
            {
              showId,
              ...(trialFilter ? { trialId: trialFilter } : {}),
              ...(classFilter ? { classId: classFilter } : {}),
            } satisfies SavedViewShowScope
          }
          buildCurrentView={() => ({
            surface: 'entry-management',
            version: OPERATIONAL_VIEW_SERIALIZATION_VERSION,
            filters: {
              attention: attentionFilter,
              payment: isEntryPaymentFilter(paymentFilter) ? paymentFilter : 'all',
              mode: workMode,
              view: entryViewMode,
            },
            display: { density },
          })}
          onApply={onApplyView}
        />
      )}
    </div>
  );
}

export default EntryManagementViewControls;
