/**
 * OverrideTree — one trial→class hierarchy carrying BOTH facets per row:
 * results-visibility preset (Select) and self check-in (Switch), each with its own
 * independent reset. Replaces the four duplicated trees (visibility-trial,
 * visibility-class, checkin-trial, checkin-class) that previously split this same
 * hierarchy across two cards.
 *
 * Inheritance is resolved per facet (see overrideTreeUtils): a row can have its
 * visibility overridden while check-in still inherits, so each control shows its own
 * status label and gets its own reset.
 */

import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { PRESET_INFO, PRESET_CONFIGS, type VisibilityPreset } from '@myk9/secretary';
import {
  useUpdateTrialOverride,
  useUpdateClassOverride,
  useResetOverride,
} from '@/hooks/mutations/useShowSettingsMutations';
import type {
  ShowSettings,
  TrialOverrideEntry,
  ClassOverrideEntry,
} from '@/hooks/queries/useShowSettingsDatabase';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { SyncableClassData } from '@/store/classStore';
import { getClassName } from '@/components/classes/types/classTypes';
import {
  resolveTrialVisibility,
  resolveTrialCheckin,
  resolveClassVisibility,
  resolveClassCheckin,
  countOverriddenClasses,
  type VisibilityFacet,
  type CheckinFacet,
} from './overrideTreeUtils';

interface OverrideTreeProps {
  showId: string;
  settings: ShowSettings;
  trials: SyncableTrial[];
  classes: SyncableClassData[];
  trialOverrides: TrialOverrideEntry[];
  classOverrides: ClassOverrideEntry[];
  selectedClasses: Set<string>;
  onToggleClass: (classId: string) => void;
  onToggleAllInTrial: (trialId: string, classIds: string[]) => void;
}

const PRESET_KEYS = Object.keys(PRESET_INFO) as VisibilityPreset[];

// ── Shared per-row controls: visibility Select + check-in Switch + two resets ──

interface OverrideControlsProps {
  name: string;
  visibility: VisibilityFacet;
  checkin: CheckinFacet;
  onVisibilityPreset: (preset: VisibilityPreset) => void;
  onCheckinToggle: (enabled: boolean) => void;
  onResetVisibility: () => void;
  onResetCheckin: () => void;
  mutating: boolean;
}

function OverrideControls({
  name,
  visibility,
  checkin,
  onVisibilityPreset,
  onCheckinToggle,
  onResetVisibility,
  onResetCheckin,
  mutating,
}: OverrideControlsProps) {
  const switchId = useId();
  return (
    <div className="flex w-full min-w-0 flex-wrap items-center justify-start gap-1 sm:w-auto sm:flex-nowrap sm:justify-end sm:gap-2">
      {/* Results visibility */}
      <Select
        value={visibility.preset ?? ''}
        onValueChange={v => onVisibilityPreset(v as VisibilityPreset)}
      >
        <SelectTrigger
          className="min-h-[44px] w-32 shrink-0"
          aria-label={`Results visibility for ${name}`}
        >
          <SelectValue placeholder="Inherit" />
        </SelectTrigger>
        <SelectContent>
          {PRESET_KEYS.map(p => (
            <SelectItem key={p} value={p}>
              {PRESET_INFO[p].title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {visibility.hasOverride && (
        <Button
          variant="ghost"
          size="icon-lg"
          title={`Reset visibility for ${name}`}
          onClick={onResetVisibility}
          disabled={mutating}
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      )}

      {/* Self check-in: 44px tap row wraps the ~20px switch without resizing it. */}
      <label
        htmlFor={switchId}
        className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center"
      >
        <Switch
          id={switchId}
          aria-label={`Self check-in for ${name}`}
          checked={checkin.effective}
          onCheckedChange={onCheckinToggle}
          disabled={mutating}
        />
      </label>
      {checkin.hasOverride && (
        <Button
          variant="ghost"
          size="icon-lg"
          title={`Reset check-in for ${name}`}
          onClick={onResetCheckin}
          disabled={mutating}
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

/** Two-facet status line shown under a trial/class name. */
function FacetStatus({
  visibility,
  checkin,
}: {
  visibility: VisibilityFacet;
  checkin: CheckinFacet;
}) {
  return (
    <p className="text-xs text-muted-foreground">
      <span>Visibility: {visibility.label}</span>
      <span className="px-1">·</span>
      <span>Check-in: {checkin.label}</span>
    </p>
  );
}

export function OverrideTree({
  showId,
  settings,
  trials,
  classes,
  trialOverrides,
  classOverrides,
  selectedClasses,
  onToggleClass,
  onToggleAllInTrial,
}: OverrideTreeProps) {
  const updateTrialOverride = useUpdateTrialOverride();
  const updateClassOverride = useUpdateClassOverride();
  const resetOverride = useResetOverride();

  const mutating =
    updateTrialOverride.isPending || updateClassOverride.isPending || resetOverride.isPending;

  if (trials.length === 0) return null;

  const trialOverrideById = new Map(trialOverrides.map(o => [o.trialId, o]));
  const classOverrideById = new Map(classOverrides.map(o => [o.classId, o]));

  // ── Trial handlers ──────────────────────────────────────────────────────────
  function setTrialPreset(trialId: string, preset: VisibilityPreset) {
    const cfg = PRESET_CONFIGS[preset];
    updateTrialOverride.mutate(
      {
        trialId,
        showId,
        preset,
        placementTiming: cfg.placement,
        qualificationTiming: cfg.qualification,
        timeTiming: cfg.time,
        faultsTiming: cfg.faults,
      },
      {
        onSuccess: () => toast.success('Trial visibility saved'),
        onError: () => toast.error('Failed to save trial visibility'),
      }
    );
  }

  function setTrialCheckin(trialId: string, enabled: boolean) {
    updateTrialOverride.mutate(
      { trialId, showId, selfCheckinEnabled: enabled },
      {
        onSuccess: () => toast.success('Trial check-in override saved'),
        onError: () => toast.error('Failed to save trial check-in'),
      }
    );
  }

  function resetTrial(trialId: string, facet: 'visibility' | 'checkin') {
    resetOverride.mutate(
      { entityId: trialId, showId, level: 'trial', facet },
      {
        onSuccess: () =>
          toast.success(
            facet === 'visibility'
              ? 'Trial visibility reset to show default'
              : 'Trial check-in reset to show default'
          ),
        onError: () => toast.error('Failed to reset trial override'),
      }
    );
  }

  // ── Class handlers ──────────────────────────────────────────────────────────
  function setClassPreset(classId: string, trialId: string, preset: VisibilityPreset) {
    const cfg = PRESET_CONFIGS[preset];
    updateClassOverride.mutate(
      {
        classId,
        trialId,
        showId,
        preset,
        placementTiming: cfg.placement,
        qualificationTiming: cfg.qualification,
        timeTiming: cfg.time,
        faultsTiming: cfg.faults,
      },
      {
        onSuccess: () => toast.success('Class visibility saved'),
        onError: () => toast.error('Failed to save class visibility'),
      }
    );
  }

  function setClassCheckin(classId: string, trialId: string, enabled: boolean) {
    updateClassOverride.mutate(
      { classId, trialId, showId, selfCheckinEnabled: enabled },
      {
        onSuccess: () => toast.success('Class check-in override saved'),
        onError: () => toast.error('Failed to save class check-in'),
      }
    );
  }

  function resetClass(classId: string, facet: 'visibility' | 'checkin') {
    resetOverride.mutate(
      { entityId: classId, showId, level: 'class', facet },
      {
        onSuccess: () =>
          toast.success(
            facet === 'visibility'
              ? 'Class visibility reset to inherited'
              : 'Class check-in reset to inherited'
          ),
        onError: () => toast.error('Failed to reset class override'),
      }
    );
  }

  return (
    <div className="space-y-3">
      <Separator />
      <h3 className="text-sm font-semibold">Trial &amp; class overrides</h3>
      {trials.map(trial => {
        const trialClasses = classes.filter(c => c.trialId === trial.id);
        const trialOverride = trialOverrideById.get(trial.id);
        const trialVis = resolveTrialVisibility(settings, trialOverride);
        const trialCheckin = resolveTrialCheckin(settings, trialOverride);
        const trialClassIds = trialClasses.map(c => c.id);
        const allSelected =
          trialClassIds.length > 0 && trialClassIds.every(id => selectedClasses.has(id));
        const overrideCount = countOverriddenClasses(trialClassIds, classOverrides);

        return (
          <Collapsible key={trial.id} className="rounded-md border">
            {/* Trial header: chevron+name is the ONLY collapsible trigger; the
                controls live outside it to avoid nested interactive elements. */}
            <div className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&[data-state=open]>svg]:rotate-180"
                >
                  <ChevronDown className="h-4 w-4 shrink-0 transition-transform" />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="max-w-full truncate text-sm font-medium" title={trial.name}>
                        {trial.name}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {trialClasses.length} {trialClasses.length === 1 ? 'class' : 'classes'}
                        {overrideCount > 0 && ` · ${overrideCount} overridden`}
                      </span>
                    </span>
                    <FacetStatus visibility={trialVis} checkin={trialCheckin} />
                  </span>
                </button>
              </CollapsibleTrigger>
              <OverrideControls
                name={trial.name ?? ''}
                visibility={trialVis}
                checkin={trialCheckin}
                onVisibilityPreset={p => setTrialPreset(trial.id, p)}
                onCheckinToggle={v => setTrialCheckin(trial.id, v)}
                onResetVisibility={() => resetTrial(trial.id, 'visibility')}
                onResetCheckin={() => resetTrial(trial.id, 'checkin')}
                mutating={mutating}
              />
            </div>

            {trialClasses.length > 0 && (
              <CollapsibleContent className="space-y-1 border-t px-3 pb-2 pt-1">
                <div className="flex items-center gap-2 px-3 py-1">
                  <Checkbox
                    // 16px intrinsic. The pseudo-element extends the hit area to
                    // the 44px floor without changing the visual size, matching
                    // the treatment the Switch beside it already had.
                    className="relative before:absolute before:-inset-3.5 before:content-['']"
                    checked={allSelected}
                    onCheckedChange={() => onToggleAllInTrial(trial.id, trialClassIds)}
                    aria-label={`Select all classes in ${trial.name}`}
                  />
                  <span className="text-xs text-muted-foreground">Select all</span>
                </div>
                {trialClasses.map(cls => {
                  const className = getClassName(cls);
                  const classOverride = classOverrideById.get(cls.id);
                  const classVis = resolveClassVisibility(settings, classOverride, trialOverride);
                  const classCheckin = resolveClassCheckin(settings, classOverride, trialOverride);

                  return (
                    <div
                      key={cls.id}
                      className="flex flex-col gap-2 rounded-md border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <Checkbox
                          className="relative before:absolute before:-inset-3.5 before:content-['']"
                          checked={selectedClasses.has(cls.id)}
                          onCheckedChange={() => onToggleClass(cls.id)}
                          aria-label={`Select ${className}`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium" title={className}>
                            {className}
                          </p>
                          <FacetStatus visibility={classVis} checkin={classCheckin} />
                        </div>
                      </div>
                      <OverrideControls
                        name={className}
                        visibility={classVis}
                        checkin={classCheckin}
                        onVisibilityPreset={p => setClassPreset(cls.id, trial.id, p)}
                        onCheckinToggle={v => setClassCheckin(cls.id, trial.id, v)}
                        onResetVisibility={() => resetClass(cls.id, 'visibility')}
                        onResetCheckin={() => resetClass(cls.id, 'checkin')}
                        mutating={mutating}
                      />
                    </div>
                  );
                })}
              </CollapsibleContent>
            )}
          </Collapsible>
        );
      })}
    </div>
  );
}
