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
import { toast } from 'sonner';
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
  /** Whether the card's entry counts are the whole class's (MYK9-637); untrusted counts stay off the details. */
  countsTrusted: boolean;
  /** One per open, so reopening a card's menu never lands inside the sub-dialog it last left. */
  session: number;
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

const LOOKUP_FAILED_MESSAGE =
  "Couldn't check how this class is timed, so Set Max Time is unavailable.";

type PerAreaLookup = { status: 'pending' | 'failed' } | { status: 'ready'; perArea: boolean };

/** AKC Scent Work and ASCA time each area against its own max (same rule as the entry list). */
function usePerAreaMaxTimes(
  trial: ReplicatedTrial | null,
  className: string | undefined,
  enabled: boolean
): PerAreaLookup {
  const [result, setResult] = useState<({ key: string } & PerAreaLookup) | null>(null);
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
            status: 'ready',
            perArea: sheet === 'AKC_SCENT_WORK' || sheet === 'ASCA_SCENT_DETECTION',
          });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setResult({ key, status: 'failed' });
        toast.error(LOOKUP_FAILED_MESSAGE);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, trialId, className, key]);
  return result?.key === key ? result : { status: 'pending' };
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
  const cardKey = entry ? `${entry.id}:${active?.mode}:${active?.session}` : '';
  const optionsView: OptionsView = view?.cardKey === cardKey ? view.view : 'menu';
  const perAreaLookup = usePerAreaMaxTimes(
    active?.trial ?? null,
    live?.name ?? undefined,
    active?.mode === 'options'
  );
  const perAreaMaxTimes = perAreaLookup.status === 'ready' && perAreaLookup.perArea;
  // The max-time form sizes its inputs once, so it waits for the scoring mode rather
  // than guessing single-area. A failed lookup has already said so; the menu stays.
  const lookupFailed = perAreaLookup.status === 'failed';
  const currentView: OptionsView =
    optionsView === 'max-time' && lookupFailed ? 'menu' : optionsView;

  if (!active || !entry) return null;

  if (active.mode === 'details') {
    return (
      <ClassDetailsPopover
        isOpen
        onClose={onClose}
        anchorRef={anchorRef}
        position="bottom"
        sheet={sheet}
        data={classDetailsData(entry, live, active.trialTimeZone, active.countsTrusted)}
      />
    );
  }

  const show = (next: OptionsView) => setView({ cardKey, view: next });
  const registry = safeRegistryId(active.trial);
  const maxTimeData = { ...classMaxTimeData(entry, live), per_area_times: perAreaMaxTimes };

  return (
    <>
      <ClassOptionsDialog
        isOpen={currentView === 'menu'}
        onClose={onClose}
        classData={{ ...classOptionsData(entry), per_area_times: perAreaMaxTimes }}
        onRequirements={() => show('requirements')}
        onSetMaxTime={() => (lookupFailed ? toast.error(LOOKUP_FAILED_MESSAGE) : show('max-time'))}
        onStatus={() => show('status')}
        // Statistics opens from the dialog itself; the handler's presence shows the tile.
        onStatistics={() => {}}
        hideMaxTime={!canManageClasses}
        hideSettings={!canManageClasses}
        hidePrintOptions
      />
      <ClassRequirementsDialog
        isOpen={currentView === 'requirements'}
        onClose={onClose}
        {...(canManageClasses && !lookupFailed ? { onSetMaxTime: () => show('max-time') } : {})}
        classData={{ ...classRequirementsData(entry, registry), per_area_times: perAreaMaxTimes }}
      />
      <MaxTimeDialog
        isOpen={currentView === 'max-time' && perAreaLookup.status === 'ready'}
        onClose={onClose}
        classData={maxTimeData}
      />
      <ClassStatusDialog
        isOpen={currentView === 'status'}
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
