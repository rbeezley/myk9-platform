/**
 * Class Management's display-preset + saved-view header cluster (tasks.md
 * 3.2/3.3). Thin adapter over the shared `DensityControl`/`SavedViewsControl`
 * — keeps `ClassManagementPage.tsx` from growing past its size budget,
 * mirroring `EntryManagementViewControls.tsx`.
 */
import { DensityControl } from '@/features/operational-views/DensityControl';
import { SavedViewsControl } from '@/features/operational-views/SavedViewsControl';
import {
  OPERATIONAL_VIEW_SERIALIZATION_VERSION,
  type ClassManagementOperationalView,
  type ClassManagementStatusFilter,
  type OperationalViewDensity,
} from '@/features/operational-views/operationalViews';
import type { SavedViewShowScope } from '@/features/operational-views/localViewPreferences';

interface ClassManagementViewControlsProps {
  density: OperationalViewDensity;
  onDensityChange: (density: OperationalViewDensity) => void;
  userId: string | null | undefined;
  showId: string | undefined;
  trialId: string | undefined;
  statusFilter: ClassManagementStatusFilter;
  searchTerm: string;
  /** Applies a restored view through the same normalized-URL setters presets use. */
  onApplyView: (view: ClassManagementOperationalView) => void;
}

export function ClassManagementViewControls({
  density,
  onDensityChange,
  userId,
  showId,
  trialId,
  statusFilter,
  searchTerm,
  onApplyView,
}: ClassManagementViewControlsProps) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <DensityControl density={density} onChange={onDensityChange} />
      {showId && trialId && (
        <SavedViewsControl<ClassManagementOperationalView>
          surface="class-management"
          userId={userId}
          showScope={{ showId, trialId } satisfies SavedViewShowScope}
          buildCurrentView={() => ({
            surface: 'class-management',
            version: OPERATIONAL_VIEW_SERIALIZATION_VERSION,
            scope: { showId, trialId },
            filters: { status: statusFilter, search: searchTerm },
            display: { density },
          })}
          onApply={onApplyView}
        />
      )}
    </div>
  );
}

export default ClassManagementViewControls;
