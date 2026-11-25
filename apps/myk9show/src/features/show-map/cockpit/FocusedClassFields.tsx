import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Clock3 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ClassStatusBadge,
  ClassStatusChoices,
  ExpectedStartControl,
  STATUS_LABEL,
  useClassStatusChange,
} from './ClassOperationalControls';
import { SCORING_COPY } from './classScoringModel';
import { expectedStartValue } from './focusedClassTiming';
import type {
  FocusedClassModel,
  SecretaryCockpitClass,
  SecretaryCockpitTrial,
} from './secretaryCockpitTypes';

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className ?? 'min-w-0'}>
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
  if (!canManageShow) return <ClassStatusBadge lifecycle={lifecycle} />;
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
            <ClassStatusBadge lifecycle={lifecycle} />
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
  const effective = expectedStartValue(sourceClass, timeZone);
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
 * The focused class's settings, shown in Edit class opened from Show Desk (MYK9-2379; they sat in
 * the pinned header under Class settings before, MYK9-1867). A manager edits each in place:
 * status through the same confirmed change the Actions menu used, expected start through the
 * existing editor. The Judge, Scoring and Stewards stay the cockpit's own controls (MYK9-1323,
 * MYK9-1971, MYK9-2328). Actual timing is the checklist's Class started step. Everyone else sees the values.
 */
export function FocusedClassFields({
  focused,
  sourceClass,
  trial,
  timeZone,
  canManageShow,
  judgeControl,
  scoringControl,
  stewardControl,
}: {
  focused: FocusedClassModel;
  sourceClass: SecretaryCockpitClass;
  trial: SecretaryCockpitTrial;
  timeZone: string;
  canManageShow: boolean;
  judgeControl?: ReactNode;
  scoringControl?: ReactNode;
  /** The class's ring jobs from the volunteer list (MYK9-2328). Managers only. */
  stewardControl?: ReactNode;
}) {
  return (
    <dl className="flex flex-wrap items-start gap-x-6 gap-y-2">
      <Field label="Status">
        <StatusField focused={focused} canManageShow={canManageShow} />
      </Field>
      {judgeControl && <Field label="Judge">{judgeControl}</Field>}
      {scoringControl && <Field label={SCORING_COPY.fieldLabel}>{scoringControl}</Field>}
      <Field label="Expected start">
        <ExpectedStartField
          focused={focused}
          sourceClass={sourceClass}
          trial={trial}
          timeZone={timeZone}
          canManageShow={canManageShow}
        />
      </Field>
      {stewardControl && (
        <Field label="Stewards" className="min-w-0 basis-full">
          {stewardControl}
        </Field>
      )}
    </dl>
  );
}
