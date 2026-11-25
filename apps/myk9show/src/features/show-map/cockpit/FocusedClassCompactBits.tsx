import { ChevronDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ClassStatusBadge } from './ClassOperationalControls';
import type { CockpitLifecycle } from './secretaryCockpitTypes';

/**
 * The compact header's one line of values (MYK9-1989): the status badge, then the class's facts,
 * expected start and actual timing. The settings that edit them are one click away, behind
 * Class settings.
 */
export function FocusedClassSummaryLine({
  lifecycle,
  parts,
}: {
  lifecycle: CockpitLifecycle | null;
  parts: readonly string[];
}) {
  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground"
      data-testid="focused-class-summary"
    >
      <ClassStatusBadge lifecycle={lifecycle} />
      {parts.length > 0 && <span className="min-w-0">{parts.join(' · ')}</span>}
    </div>
  );
}

/**
 * The compact header's button: Class settings opens the full fields (status, judge, scoring,
 * expected start, actual timing) under the name.
 */
export function FocusedClassHeaderToggles({
  settingsOpen,
  settingsId,
  onToggleSettings,
}: {
  settingsOpen: boolean;
  settingsId: string;
  onToggleSettings: () => void;
}) {
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-expanded={settingsOpen}
        aria-controls={settingsId}
        onClick={onToggleSettings}
        className="min-h-11 gap-1.5 px-2.5"
      >
        Class settings
        <ChevronDown
          className={cn('h-4 w-4 transition-transform', settingsOpen && 'rotate-180')}
          aria-hidden="true"
        />
      </Button>
    </>
  );
}
