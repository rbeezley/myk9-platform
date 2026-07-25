/**
 * Display-preset density control (Design Decision 3, tasks.md 3.2). A bounded
 * layout choice only — row identity, status, selection controls, and the row
 * action menu are always rendered by the surface's table regardless of this
 * value; this component never toggles those off.
 *
 * Shared between Entry Management and Class Management so there is exactly
 * one density control implementation, matching the "one preset system" rule
 * in operationalViews.ts.
 */
import { LayoutList, Rows3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  OPERATIONAL_VIEW_DENSITY_VALUES,
  type OperationalViewDensity,
} from '@/features/operational-views/operationalViews';

interface DensityControlProps {
  density: OperationalViewDensity;
  onChange: (density: OperationalViewDensity) => void;
}

const DENSITY_LABELS: Record<OperationalViewDensity, string> = {
  comfortable: 'Comfortable',
  compact: 'Compact',
};

const DENSITY_ICONS: Record<OperationalViewDensity, typeof Rows3> = {
  comfortable: Rows3,
  compact: LayoutList,
};

/** Compact segmented control so it fits the existing filter/header cluster without adding a new menu system. */
export function DensityControl({ density, onChange }: DensityControlProps) {
  return (
    <div
      role="group"
      aria-label="Row density"
      className="inline-flex items-center rounded-md border border-input p-0.5"
    >
      {OPERATIONAL_VIEW_DENSITY_VALUES.map(value => {
        const Icon = DENSITY_ICONS[value];
        const isActive = density === value;
        return (
          <Button
            key={value}
            type="button"
            variant={isActive ? 'secondary' : 'ghost'}
            size="sm"
            aria-pressed={isActive}
            className="h-8 gap-1.5 px-2"
            onClick={() => onChange(value)}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{DENSITY_LABELS[value]}</span>
          </Button>
        );
      })}
    </div>
  );
}

export default DensityControl;
