/**
 * The dialogs a class-picker card opens (MYK9-1506): Class Details from the info
 * icon, Class Options from the ellipsis. Both are the entry list's own components,
 * so the facts and the role gating cannot drift from it; this host only owns which
 * one is open and shapes the card's class into their props.
 *
 * Statistics lives inside Class Options. Requirements, Set Max Time and Status each
 * open from it and return to the picker on close, as they do on the entry list.
 */
import { useEffect, useState, type RefObject } from 'react';
import type { ClassEntry } from '@myk9/ringside';
import { getTrialRegistry } from '@/features/registries';
import { scoresheetKeyForClass } from '@/pages/scoring/types';
import type { ReplicatedTrial } from '@/services/replication/ReplicatedTrialsTable';
import { ClassDetailsPopover } from './slots/ClassDetailsPopoverSlot';
import {
  ClassOptionsDialog,
  ClassRequirementsDialog,
  ClassStatusDialog,
  MaxTimeDialog,
} from './slots/classDialogs';
import { buildRingsideReplication } from './ringsideCapabilities';
import { toStatusUpdateFields } from './ringsideClassStatusMap';
import { useLiveClasses } from './useLiveClasses';
import {
  classDetailsData,
  classMaxTimeData,
  classOptionsData,
  classRequirementsData,
  classStatusData,
} from './classCardDialogData';

export type ClassCardDialogMode = 'details' | 'options';
type OptionsView = 'menu' | 'requirements' | 'max-time' | 'status';

export interface ActiveClassCard {
  entry: ClassEntry;
  mode: ClassCardDialogMode;
  trial: ReplicatedTrial | null;
  trialTimeZone: string;
}

interface AtShowClassCardDialogsProps {
  active: ActiveClassCard | null;
  anchorRef: RefObject<HTMLElement | null>;
  /** Touch devices get the details as a bottom sheet instead of an anchored popover. */
  sheet: boolean;
  canManageClasses: boolean;
  onClose: () => void;
}

function safeRegistryId(trial: ReplicatedTrial | null): string | undefined {
  try {
    return trial ? getTrialRegistry(trial).id : undefined;
  } catch {
    return undefined;
  }
}

/** AKC Scent Work and ASCA time each area against its own max (same rule as the entry list). */
function usePerAreaMaxTimes(
  trial: ReplicatedTrial | null,
  className: string | undefined,
  enabled: boolean
): boolean {
  const [result, setResult] = useState<{ key: string; perArea: boolean } | null>(null);
  const trialId = trial?.id;
  const key = `${trialId ?? ''}|${className ?? ''}`;
  useEffect(() => {
    if (!enabled || !trialId || !className) return;
    let cancelled = false;
    scoresheetKeyForClass(trialId, className)
      .then(sheet => {
        if (!cancelled) {
          setResult({
            key,
            perArea: sheet === 'AKC_SCENT_WORK' || sheet === 'ASCA_SCENT_DETECTION',
          });
        }
      })
      .catch(() => {
        if (!cancelled) setResult({ key, perArea: false });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, trialId, className, key]);
  return result?.key === key && result.perArea;
}

export function AtShowClassCardDialogs({
  active,
  anchorRef,
  sheet,
  canManageClasses,
  onClose,
}: AtShowClassCardDialogsProps) {
  const entry = active?.entry ?? null;
  const live = useLiveClasses(entry ? [entry.id] : [], entry !== null)?.[0] ?? null;
  // Which options panel is open belongs to the card that opened it.
  const [view, setView] = useState<{ cardKey: string; view: OptionsView } | null>(null);
  const cardKey = entry ? `${entry.id}:${active?.mode}` : '';
  const optionsView: OptionsView = view?.cardKey === cardKey ? view.view : 'menu';
  const perAreaMaxTimes = usePerAreaMaxTimes(
    active?.trial ?? null,
    live?.name ?? undefined,
    active?.mode === 'options'
  );

  if (!active || !entry) return null;

  if (active.mode === 'details') {
    return (
      <ClassDetailsPopover
        isOpen
        onClose={onClose}
        anchorRef={anchorRef}
        position="bottom"
        sheet={sheet}
        data={classDetailsData(entry, live, active.trialTimeZone)}
      />
    );
  }

  const show = (next: OptionsView) => setView({ cardKey, view: next });
  const registry = safeRegistryId(active.trial);
  const maxTimeData = { ...classMaxTimeData(entry), per_area_times: perAreaMaxTimes };

  return (
    <>
      <ClassOptionsDialog
        isOpen={optionsView === 'menu'}
        onClose={onClose}
        classData={{ ...classOptionsData(entry), per_area_times: perAreaMaxTimes }}
        onRequirements={() => show('requirements')}
        onSetMaxTime={() => show('max-time')}
        onStatus={() => show('status')}
        // Statistics opens from the dialog itself; the handler's presence shows the tile.
        onStatistics={() => {}}
        hideMaxTime={!canManageClasses}
        hideSettings={!canManageClasses}
        hidePrintOptions
      />
      <ClassRequirementsDialog
        isOpen={optionsView === 'requirements'}
        onClose={onClose}
        {...(canManageClasses ? { onSetMaxTime: () => show('max-time') } : {})}
        classData={{ ...classRequirementsData(entry, registry), per_area_times: perAreaMaxTimes }}
      />
      <MaxTimeDialog
        isOpen={optionsView === 'max-time'}
        onClose={onClose}
        classData={maxTimeData}
      />
      <ClassStatusDialog
        isOpen={optionsView === 'status'}
        onClose={onClose}
        onStatusChange={async (status, timeValue) => {
          const ringsideStatus = status as Parameters<
            ReturnType<typeof buildRingsideReplication>['updateClassStatus']
          >[1];
          await buildRingsideReplication().updateClassStatus(
            entry.id,
            ringsideStatus,
            toStatusUpdateFields(ringsideStatus, timeValue)
          );
        }}
        classData={classStatusData(entry)}
        currentStatus={classStatusData(entry).class_status}
      />
    </>
  );
}
