/**
 * Entry Management's display-preset + saved-view header cluster (tasks.md
 * 3.2/3.3). Thin adapter over the shared `DensityControl`/`SavedViewsControl`
 * — keeps `RegistrationView.tsx` from growing past its size budget.
 */
import type { ReactNode } from 'react';
import { DensityControl } from '@/features/operational-views/DensityControl';
import { EntryDisplayPresetControl } from '@/features/operational-views/EntryDisplayPresetControl';
import { SavedViewsControl } from '@/features/operational-views/SavedViewsControl';
import {
  OPERATIONAL_VIEW_SERIALIZATION_VERSION,
  type EntryDisplayPreset,
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
  displayPreset: EntryDisplayPreset;
  onDisplayPresetChange: (preset: EntryDisplayPreset) => void;
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
  displayPreset,
  onDisplayPresetChange,
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
  // Rendered inside the "View options" popover (MYK9-64 F5): stacked with
  // section labels so each control reads as a named setting, not a mystery
  // segmented bar competing with the work queue.
  return (
    <div className="flex flex-col gap-3">
      <LabeledControl label="Display">
        <EntryDisplayPresetControl preset={displayPreset} onChange={onDisplayPresetChange} />
      </LabeledControl>
      <LabeledControl label="Row density">
        <DensityControl density={density} onChange={onDensityChange} />
      </LabeledControl>
      {showId && (
        <LabeledControl label="Saved views">
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
              scope: {
                showId,
                ...(trialFilter ? { trialId: trialFilter } : {}),
                ...(classFilter ? { classId: classFilter } : {}),
              },
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
        </LabeledControl>
      )}
    </div>
  );
}

function LabeledControl({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export default EntryManagementViewControls;
