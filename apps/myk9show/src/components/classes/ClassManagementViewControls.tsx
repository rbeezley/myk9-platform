/**
 * Class Management's display-density control. Kept as its own file to hold
 * `ClassManagementPage.tsx` under its size budget (docs blocks match its
 * Entry Management counterpart). Used to also render `SavedViewsControl`
 * (personal saved views); the list-toolkit rollout (MYK9-811) replaced that
 * with `ListViewTabs` — views now live in the URL, not a per-device saved-view
 * store — so only the density toggle remains here.
 */
import { DensityControl } from '@/features/operational-views/DensityControl';
import type { OperationalViewDensity } from '@/features/operational-views/operationalViews';

interface ClassManagementViewControlsProps {
  density: OperationalViewDensity;
  onDensityChange: (density: OperationalViewDensity) => void;
}

export function ClassManagementViewControls({
  density,
  onDensityChange,
}: ClassManagementViewControlsProps) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <DensityControl density={density} onChange={onDensityChange} />
    </div>
  );
}

export default ClassManagementViewControls;
