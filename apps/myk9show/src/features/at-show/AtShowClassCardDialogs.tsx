/**
 * The dialogs a class-picker card opens (MYK9-1506): Class Details from the info
 * icon, Class Options from the ellipsis. Both are the entry list's own components,
 * so the facts and the role gating cannot drift from it; this host only owns which
 * one is open and shapes the card's class into their props.
 *
 * Statistics lives inside Class Options. Requirements, Set Max Time and Status each
 * open from it and return to the picker on close, as they do on the entry list.
 */
import { useState, type RefObject } from 'react';
import { getClassIds, type ClassEntry } from '@myk9/ringside';
import { getTrialRegistry } from '@/features/registries';
import type { ReplicatedTrial } from '@/services/replication/ReplicatedTrialsTable';
import { ClassDetailsPopover } from './slots/ClassDetailsPopoverSlot';
import {
  ClassOptionsDialog,
  ClassRequirementsDialog,
  ClassSettingsDialog,
  ClassStatusDialog,
  MaxTimeDialog,
} from './slots/classDialogs';
import { useHasClassSettingsLinks } from './slots/classSettingsLinks';
import { MaxTimeLookupDialog } from './slots/MaxTimeLookupDialog';
import { buildRingsideReplication } from './ringsideCapabilities';
import { toStatusUpdateFields } from './ringsideClassStatusMap';
import { useLiveClasses } from './useLiveClasses';
import { usePerAreaMaxTimes, type PerAreaLookup } from './usePerAreaMaxTimes';
import {
  classDetailsData,
  classMaxTimeData,
  classOptionsData,
  classRequirementsData,
  classStatusData,
} from './classCardDialogData';

/** 'requirements' is the read-only door for people without Class Options (MYK9-2137). */
export type ClassCardDialogMode = 'details' | 'options' | 'requirements';
type OptionsView = 'menu' | 'requirements' | 'max-time' | 'status' | 'settings';

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
  showId: string | undefined;
  onClose: () => void;
}

function safeRegistryId(trial: ReplicatedTrial | null): string | undefined {
  try {
    return trial ? getTrialRegistry(trial).id : undefined;
  } catch {
    return undefined;
  }
}

export function AtShowClassCardDialogs({
  active,
  anchorRef,
  sheet,
  canManageClasses,
  showId,
  onClose,
}: AtShowClassCardDialogsProps) {
  const entry = active?.entry ?? null;
  const hasSettingsLinks = useHasClassSettingsLinks(showId);
  const [attempt, setAttempt] = useState(0);
  const liveRows = useLiveClasses(entry ? getClassIds(entry) : [], entry !== null, attempt);
  const live = liveRows?.find(row => row.id === entry?.id) ?? null;
  const pairedLive = liveRows?.find(row => row.id !== entry?.id) ?? null;
  // Which options panel is open belongs to the card that opened it.
  const [view, setView] = useState<{ cardKey: string; view: OptionsView } | null>(null);
  const cardKey = entry ? `${entry.id}:${active?.mode}:${active?.session}` : '';
  const optionsView: OptionsView = view?.cardKey === cardKey ? view.view : 'menu';
  const timingLookup = usePerAreaMaxTimes(
    active?.trial?.id,
    live?.name ?? undefined,
    active?.mode === 'options',
    attempt
  );
  // The lookup keys off the live row's name, so a read that finds no row can never settle:
  // that is a failure to recover from, not a wait.
  const perAreaLookup: PerAreaLookup =
    active?.mode === 'options' && liveRows !== null && !live ? { status: 'failed' } : timingLookup;
  const perAreaMaxTimes = perAreaLookup.status === 'ready' && perAreaLookup.perArea;

  if (!active || !entry) return null;

  if (active.mode === 'details') {
    return (
      <ClassDetailsPopover
        isOpen
        onClose={onClose}
        anchorRef={anchorRef}
        position="bottom"
        sheet={sheet}
        data={classDetailsData(entry, live, active.trialTimeZone, active.countsTrusted, pairedLive)}
      />
    );
  }

  if (active.mode === 'requirements') {
    // Read-only: no onSetMaxTime, so the max time card is not a button.
    return (
      <ClassRequirementsDialog
        isOpen
        onClose={onClose}
        timeZone={active.trialTimeZone}
        classData={classRequirementsData(entry, safeRegistryId(active.trial))}
      />
    );
  }

  const show = (next: OptionsView) => setView({ cardKey, view: next });
  const registry = safeRegistryId(active.trial);
  const maxTimeData = { ...classMaxTimeData(entry, live), per_area_times: perAreaMaxTimes };

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
        onSettings={() => show('settings')}
        hideSettings={!canManageClasses || !hasSettingsLinks}
        hidePrintOptions
      />
      <ClassRequirementsDialog
        isOpen={optionsView === 'requirements'}
        onClose={onClose}
        {...(canManageClasses ? { onSetMaxTime: () => show('max-time') } : {})}
        timeZone={active.trialTimeZone}
        classData={{ ...classRequirementsData(entry, registry), per_area_times: perAreaMaxTimes }}
      />
      <ClassSettingsDialog
        isOpen={optionsView === 'settings'}
        onClose={onClose}
        classData={classOptionsData(entry)}
      />
      <MaxTimeDialog
        isOpen={optionsView === 'max-time' && perAreaLookup.status === 'ready'}
        onClose={onClose}
        classData={maxTimeData}
      />
      {optionsView === 'max-time' && perAreaLookup.status !== 'ready' && (
        <MaxTimeLookupDialog
          className={entry.class_name}
          failed={perAreaLookup.status === 'failed'}
          onRetry={() => setAttempt(n => n + 1)}
          onClose={onClose}
        />
      )}
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
