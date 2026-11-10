import { useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { SecretaryCockpitRunOrderControls } from './secretaryCockpitTypes';
import type { ClassEntryBreakdown } from '@/features/entry-operations/classEntryBreakdown';
import { buildFocusedClassFacts } from './focusedClassFacts';

import { CockpitActionLink } from './CockpitActionLink';
import { ClassChecklistSection } from './ClassChecklistSection';
import { FocusedClassSettings } from './FocusedClassSettings';
import { FocusedClassActionsMenu, type FocusedClassEditAction } from './FocusedClassActionsMenu';
import { RunOrderHandPlacement, RunOrderUndoNotice } from './RunOrderHandPlacement';
import { focusedClassDelay } from './focusedClassDelay';
import { formatTrialIdentity } from './secretaryCockpitModel';
import type {
  FocusedClassModel,
  SecretaryCockpitAttention,
  SecretaryCockpitClass,
  SecretaryCockpitTrial,
} from './secretaryCockpitTypes';
import { FocusedClassHeader } from './FocusedClassHeader';
import { entriesUnread } from './cockpitClassEntries';
import { ClassCountTiles, ClassEntriesTable } from './FocusedClassEntries';
import {
  FOCUSED_CLASS_SCROLL_MARGIN_CLASS,
  FOCUSED_CLASS_SCROLL_MARGIN_CLASS_IN_PANEL,
  type FocusedClassPinMode,
} from '@/components/shows/ShowDetails/showStickyLayout';

const NO_ENTRIES: ClassEntryBreakdown = { entered: 0, pending: 0 };

export function SecretaryCockpitFocusedClass({
  showId,
  focused,
  sourceClass,
  trial,
  attention,
  timeZone,
  pinMode = 'none',
  canManageShow,
  onCommand,
  runOrder,
  editClass,
  judgeControl,
  entryBreakdownByClassId,
  onRefreshEntries,
}: {
  showId: string;
  focused: FocusedClassModel | null;
  sourceClass: SecretaryCockpitClass | null;
  trial: SecretaryCockpitTrial | null;
  attention: readonly SecretaryCockpitAttention[];
  timeZone: string;
  /** Rendered in the split's own-scroll panel (SecretaryCockpit), so the header pins to it. */
  pinMode?: FocusedClassPinMode;
  canManageShow: boolean;
  onCommand: (commandId: string) => void;
  /** Run-order auto-sort for the focused class (F29b phase 2a). */
  runOrder?: SecretaryCockpitRunOrderControls | undefined;
  /** Edit class, an Actions menu item; the cockpit owns its dialogs (MYK9-956). */
  editClass?: FocusedClassEditAction | undefined;
  /** The Judge setting (MYK9-1323); the cockpit owns its pending assignment. Managers only. */
  judgeControl?: ReactNode;
  /** Entered/pending per class, the schedule row's own count (MYK9-943); absent until entries are read. */
  entryBreakdownByClassId?: ReadonlyMap<string, ClassEntryBreakdown> | undefined;
  /** Re-reads the page's entries after a Check-in cell write (MYK9-1797). */
  onRefreshEntries?: (() => void | Promise<void>) | undefined;
}) {
  // Which class's hand-placement list is open; scoped by id so focusing another
  // class closes it rather than carrying it over.
  const [placingClassId, setPlacingClassId] = useState<string | null>(null);
  // Which class's actual-start editor is open; the Actions menu and the Class started step share it.
  const [editingStart, setEditingStart] = useState<string | null>(null);
  if (!focused || !sourceClass || !trial) {
    return (
      <aside className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        Pick a class from the schedule to see its work and paperwork.
      </aside>
    );
  }

  // The editor must not reopen on returning to a class.
  if (editingStart !== null && editingStart !== focused.id) setEditingStart(null);

  const { delayMinutes, offerDelay } = focusedClassDelay({
    sourceClass,
    trialDate: trial.date,
    timeZone,
  });
  // The `class-details:` destination, the one class-work door left (the step bar and the entries
  // table own scoring, reports and entries).
  const detailsAction = focused.classWorkActions.find(action =>
    action.id.startsWith('class-details:')
  );
  const entriesHref =
    detailsAction?.destination.kind === 'href' ? detailsAction.destination.href : null;

  const rowMenu = canManageShow
    ? { actions: new Map(focused.entryRows.map(row => [row.nodeId, row.actions])), onCommand }
    : undefined;
  const unread = entriesUnread(focused.entries, sourceClass.entryCount);
  // The Run order menu hides itself below 2 entries, so its label does too.
  const runOrderEntryCount =
    sourceClass.runListCount ?? sourceClass.entryCount ?? focused.entryRows.length;
  const facts = buildFocusedClassFacts({
    focused,
    entryCount: sourceClass.entryCount ?? null,
    breakdown: entryBreakdownByClassId?.get(focused.id) ?? (entryBreakdownByClassId && NO_ENTRIES),
    // With the Judge setting below, the header would only repeat it.
    showJudge: !judgeControl,
  });

  return (
    <aside className="rounded-xl border bg-card text-card-foreground shadow-sm">
      {/* No overflow-hidden on the card: it would turn the card into the header's scroll
          container and the header would never pin. */}
      <FocusedClassHeader
        eyebrow={`Selected class · ${formatTrialIdentity(trial)}`}
        title={focused.name}
        facts={facts.join(' · ')}
        pinMode={pinMode}
      >
        <FocusedClassActionsMenu
          showId={showId}
          classId={focused.id}
          className={focused.name}
          lifecycle={focused.lifecycle.value}
          unenteredScoreCount={
            focused.progress.value === null
              ? 0
              : Math.max(0, focused.progress.value.total - focused.progress.value.completed)
          }
          canManageShow={canManageShow}
          scheduledStart={sourceClass.scheduledStart ?? null}
          revisedExpectedStart={sourceClass.revisedExpectedStart ?? null}
          trialDate={trial.date}
          timeZone={timeZone}
          offerDelay={offerDelay}
          delayMinutes={delayMinutes ?? undefined}
          runOrder={runOrder}
          runOrderEntryCount={runOrderEntryCount}
          editClass={editClass}
          onEditActualStart={() => setEditingStart(focused.id)}
          onPlaceByHand={() => setPlacingClassId(focused.id)}
          entriesHref={entriesHref}
        />
      </FocusedClassHeader>

      <div
        className={cn(
          'space-y-5 p-5',
          pinMode === 'panel'
            ? FOCUSED_CLASS_SCROLL_MARGIN_CLASS_IN_PANEL
            : pinMode === 'page'
              ? FOCUSED_CLASS_SCROLL_MARGIN_CLASS
              : ''
        )}
      >
        <ClassCountTiles entries={focused.entries} unread={unread} />
        <ClassChecklistSection
          showId={showId}
          sourceClass={sourceClass}
          paperwork={focused.paperwork}
          timeZone={timeZone}
          onCommand={onCommand}
          printTrackingInUse={focused.printTrackingInUse}
          canManageShow={canManageShow}
          trialDate={trial.date}
          editingStart={editingStart}
          onEditingStartChange={setEditingStart}
        />
        <section aria-labelledby="focused-class-entries">
          <h3
            id="focused-class-entries"
            className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
          >
            Entries in run order
          </h3>
          <ClassEntriesTable
            entries={focused.entries}
            className={focused.name}
            canChangeCheckIn={canManageShow}
            {...(onRefreshEntries && { onRefreshEntries })}
            hidden={focused.entriesHidden}
            unread={unread}
            // Managers only; the engine's per-entry answer, joined to the table by nodeId (MYK9-1798).
            rowMenu={rowMenu}
          />
        </section>

        <FocusedClassSettings
          focused={focused}
          sourceClass={sourceClass}
          trial={trial}
          timeZone={timeZone}
          judgeControl={judgeControl}
        />

        {canManageShow && runOrder && (
          <RunOrderUndoNotice classId={focused.id} runOrder={runOrder} />
        )}
        {canManageShow && runOrder && placingClassId === focused.id && (
          <RunOrderHandPlacement
            showId={showId}
            classId={focused.id}
            runOrder={runOrder}
            onDone={() => setPlacingClassId(null)}
          />
        )}

        {attention.length > 0 && (
          <div className="space-y-2">
            {attention.map(item => (
              <div
                key={item.id}
                className="rounded-lg border border-destructive/30 bg-destructive/5 p-3"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-destructive">{item.label}</div>
                    <div className="mt-0.5 text-sm text-muted-foreground">{item.reason}</div>
                  </div>
                </div>
                {item.destination && (
                  <CockpitActionLink
                    destination={item.destination}
                    onCommand={onCommand}
                    className="mt-3 w-full"
                  >
                    {item.label}
                  </CockpitActionLink>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
