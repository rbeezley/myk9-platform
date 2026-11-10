import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Clock3 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatTime } from '@/lib/format/dates';
import {
  ClassStatusChoices,
  ClassStatusControl,
  ExpectedStartControl,
  STATUS_LABEL,
  useClassStatusChange,
} from './ClassOperationalControls';
import { instantToClockTime, scheduledClockValue } from './cockpitTime';
import type {
  FocusedClassModel,
  SecretaryCockpitClass,
  SecretaryCockpitTrial,
} from './secretaryCockpitTypes';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

/** Status: the badge for everyone; a manager opens the choices (and their confirmations) from it. */
function StatusField({
  focused,
  canManageShow,
}: {
  focused: FocusedClassModel;
  canManageShow: boolean;
}) {
  const unentered =
    focused.progress.value === null
      ? null
      : Math.max(0, focused.progress.value.total - focused.progress.value.completed);
  const status = useClassStatusChange({
    classId: focused.id,
    className: focused.name,
    unenteredScoreCount: unentered,
  });
  const lifecycle = focused.lifecycle.value;
  if (!canManageShow) return <ClassStatusControl lifecycle={lifecycle} />;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild nativeButton>
          <Button
            type="button"
            variant="ghost"
            disabled={status.isSaving}
            aria-label={`Status: ${lifecycle ? STATUS_LABEL[lifecycle] : 'Status unknown'}. Change status of ${focused.name}`}
            className="h-11 gap-1.5 px-1.5"
          >
            <ClassStatusControl lifecycle={lifecycle} />
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <ClassStatusChoices
            label={lifecycle ? STATUS_LABEL[lifecycle] : 'Status unknown'}
            onSelect={status.update}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      {status.confirmDialog}
    </>
  );
}

function ExpectedStartField({
  focused,
  sourceClass,
  trial,
  timeZone,
  canManageShow,
}: {
  focused: FocusedClassModel;
  sourceClass: SecretaryCockpitClass;
  trial: SecretaryCockpitTrial;
  timeZone: string;
  canManageShow: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  // Closing the editor (save, cancel, Escape) unmounts what had focus; hand it back to the opener.
  useEffect(() => {
    if (wasEditing.current && !editing) openerRef.current?.focus();
    wasEditing.current = editing;
  }, [editing]);
  const scheduledStart = sourceClass.scheduledStart ?? null;
  const revisedExpectedStart = sourceClass.revisedExpectedStart ?? null;
  const effective =
    instantToClockTime(revisedExpectedStart, timeZone) || scheduledClockValue(scheduledStart);
  return (
    <div className="space-y-0.5">
      {canManageShow && !editing ? (
        <button
          ref={openerRef}
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`Expected start: ${effective || 'not set'}. Change expected start`}
          className="inline-flex min-h-11 items-center gap-1.5 text-left text-sm font-semibold underline-offset-4 hover:underline"
        >
          <Clock3 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {effective || 'Set expected start'}
        </button>
      ) : (
        <ExpectedStartControl
          classId={focused.id}
          scheduledStart={scheduledStart}
          revisedExpectedStart={revisedExpectedStart}
          trialDate={trial.date}
          timeZone={timeZone}
          canManageShow={canManageShow}
          {...(canManageShow && { editing, onEditingChange: setEditing })}
        />
      )}
      {revisedExpectedStart && scheduledStart && (
        <div className="text-xs text-muted-foreground">Scheduled {scheduledStart}</div>
      )}
    </div>
  );
}

/**
 * The focused class's settings, as inline fields under the title in the header card (MYK9-1867,
 * superseding the read-only Class settings card of MYK9-1796). A manager edits each in place:
 * status through the same confirmed change the Actions menu used, expected start through the
 * existing editor, actual start through the checklist's editor (`onEditActualStart`). The Judge
 * stays the cockpit's own control (MYK9-1323). Everyone else sees the values.
 */
export function FocusedClassFields({
  focused,
  sourceClass,
  trial,
  timeZone,
  canManageShow,
  judgeControl,
  onEditActualStart,
}: {
  focused: FocusedClassModel;
  sourceClass: SecretaryCockpitClass;
  trial: SecretaryCockpitTrial;
  timeZone: string;
  canManageShow: boolean;
  judgeControl?: ReactNode;
  onEditActualStart: () => void;
}) {
  const timing = `${
    focused.actualStart.value
      ? `Started ${formatTime(focused.actualStart.value, timeZone)}`
      : // A class that ran without a recorded start must not claim it never started.
        sourceClass.lifecycle === 'not-started'
        ? 'Not started'
        : 'Start not recorded'
  }${focused.actualFinish.value ? ` · Finished ${formatTime(focused.actualFinish.value, timeZone)}` : ''}`;
  // The editor is mounted by the class checklist, which a cancelled class does not have
  // (buildClassChecklist returns no items; ClassChecklistSection renders the editor only with items).
  const editable = canManageShow && sourceClass.lifecycle !== 'cancelled';
  return (
    <dl className="mt-3 flex flex-wrap items-start gap-x-6 gap-y-2">
      <Field label="Status">
        <StatusField focused={focused} canManageShow={canManageShow} />
      </Field>
      {judgeControl && <Field label="Judge">{judgeControl}</Field>}
      <Field label="Expected start">
        <ExpectedStartField
          focused={focused}
          sourceClass={sourceClass}
          trial={trial}
          timeZone={timeZone}
          canManageShow={canManageShow}
        />
      </Field>
      <Field label="Actual timing">
        {editable ? (
          <button
            type="button"
            onClick={onEditActualStart}
            aria-label={`Actual timing: ${timing}. Edit actual start`}
            className="min-h-11 text-left font-medium underline-offset-4 hover:underline"
          >
            {timing}
          </button>
        ) : (
          <span className="font-medium">{timing}</span>
        )}
      </Field>
    </dl>
  );
}
