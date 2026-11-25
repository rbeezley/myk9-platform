import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { SecretaryCockpitRunOrderControls } from './secretaryCockpitTypes';
import type { ClassEntryBreakdown } from '@/features/entry-operations/classEntryBreakdown';
import { buildFocusedClassFacts } from './focusedClassFacts';

import { CockpitActionLink } from './CockpitActionLink';
import { ClassChecklistSection } from './ClassChecklistSection';
import { FocusedClassRequirements } from './FocusedClassRequirements';
import { FocusedClassActionsMenu, type FocusedClassEditAction } from './FocusedClassActionsMenu';
import { RunOrderUndoNotice } from './RunOrderUndoNotice';
import { focusedClassDelay } from './focusedClassDelay';
import { formatTrialIdentity } from './secretaryCockpitModel';
import type {
  FocusedClassModel,
  SecretaryCockpitAttention,
  SecretaryCockpitClass,
  SecretaryCockpitTrial,
} from './secretaryCockpitTypes';
import { FocusedClassHeader } from './FocusedClassHeader';
import { FocusedClassHeaderButtons, FocusedClassSummaryLine } from './FocusedClassCompactBits';
import {
  actualTimingText,
  expectedStartValue,
  focusedClassSummaryParts,
} from './focusedClassTiming';
import { entriesUnread } from './cockpitClassEntries';
import { ClassEntriesTable, InRingTile } from './FocusedClassEntries';
import {
  FOCUSED_CLASS_SCROLL_MARGIN_CLASS,
  FOCUSED_CLASS_SCROLL_MARGIN_CLASS_IN_PANEL,
  type FocusedClassPinMode,
} from '@/components/shows/ShowDetails/showStickyLayout';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import type { EntriesRefresh } from '@/components/entries/management/checkInDesk/entriesRefresh';

const NO_ENTRIES: ClassEntryBreakdown = { entered: 0, pending: 0 };

export function SecretaryCockpitFocusedClass({
  showId,
  focused,
  sourceClass,
  trial,
  attention,
  timeZone,
  pinMode = 'none',
  cardListed = false,
  canManageShow,
  onCommand,
  runOrder,
  editClass,
  entryBreakdownByClassId,
  onRefreshEntries,
  putBackEntries,
}: {
  showId: string;
  focused: FocusedClassModel | null;
  sourceClass: SecretaryCockpitClass | null;
  trial: SecretaryCockpitTrial | null;
  attention: readonly SecretaryCockpitAttention[];
  timeZone: string;
  /** Rendered in the split's own-scroll panel (SecretaryCockpit), so the header pins to it. */
  pinMode?: FocusedClassPinMode;
  /**
   * The class's card is in the schedule (MYK9-2143). The card already says the count, the judge
   * and the times, so the header keeps to the name, the status and its controls. False (a class
   * the secretary's own work moved out of the filter) keeps the full line, the only place left
   * that says them.
   */
  cardListed?: boolean;
  canManageShow: boolean;
  onCommand: (commandId: string) => void;
  /** Run-order auto-sort for the focused class (F29b phase 2a). */
  runOrder?: SecretaryCockpitRunOrderControls | undefined;
  /**
   * Edit class, the header's button and an Actions menu item; the cockpit owns its dialogs
   * (MYK9-956). The panel it opens holds every class setting (MYK9-2379).
   */
  editClass?: FocusedClassEditAction | undefined;
  /** Entered/pending per class, the schedule row's own count (MYK9-943); absent until entries are read. */
  entryBreakdownByClassId?: ReadonlyMap<string, ClassEntryBreakdown> | undefined;
  /** Re-reads the page's entries after a Check-in cell write (MYK9-1797). */
  onRefreshEntries?: EntriesRefresh | undefined;
  /** The stored entries by id, so a real Pull can be put back from its row (MYK9-2038). */
  putBackEntries?: ReadonlyMap<string, EntryManagementEntry> | undefined;
}) {
  // Which class's actual-start editor is open; the header's Actual timing field and the Class started step share it.
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
  const rowMenu = canManageShow
    ? {
        actions: new Map(focused.entryRows.map(row => [row.nodeId, row.actions])),
        showId,
        classId: focused.id,
        trialId: sourceClass.trialId,
        classLifecycle: focused.lifecycle.value,
        onCommand,
      }
    : undefined;
  const unread = entriesUnread(focused.entries, sourceClass.entryCount);
  // The Run order menu hides itself below 2 entries, so its label does too.
  const runOrderEntryCount =
    sourceClass.runListCount ?? sourceClass.entryCount ?? focused.entryRows.length;
  const factsOf = (showJudge: boolean) =>
    buildFocusedClassFacts({
      focused,
      entryCount: sourceClass.entryCount ?? null,
      breakdown:
        entryBreakdownByClassId?.get(focused.id) ?? (entryBreakdownByClassId && NO_ENTRIES),
      showJudge,
      // The class's schedule card already says the count and the pending entries (MYK9-2143).
      showCount: !cardListed,
    });
  // Where the header pins (from lg), a laptop's height goes to the entries (MYK9-1989): the header
  // is one line of name and controls plus one line of values, and the entries come before the In
  // ring tile and the checklist. Below lg nothing pins and the card keeps its full layout.
  const compact = pinMode !== 'none';
  // Class settings live in Edit class (MYK9-2379), so the header says the judge itself unless
  // the class's card, beside it, already does.
  const facts = factsOf(!cardListed || !canManageShow);
  const summaryParts = !compact
    ? []
    : cardListed
      ? // Beside its card the summary is the status badge alone (and the viewer's judge).
        facts
      : focusedClassSummaryParts({
          facts: factsOf(true),
          expectedStart: expectedStartValue(sourceClass, timeZone),
          timing: actualTimingText(focused, sourceClass.lifecycle, timeZone),
        });

  const entriesSection = (
    <section aria-labelledby="focused-class-entries">
      <h3
        id="focused-class-entries"
        // Compact: the table's column headings label it, so the kicker is for screen readers only.
        className={cn(
          'text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground',
          compact ? 'sr-only' : 'mb-2'
        )}
      >
        Entries in run order
      </h3>
      <ClassEntriesTable
        entries={focused.entries}
        className={focused.name}
        canChangeCheckIn={canManageShow}
        {...(onRefreshEntries && { onRefreshEntries })}
        {...(putBackEntries && { putBackEntries })}
        hidden={focused.entriesHidden}
        unread={unread}
        // Managers only; the engine's per-entry answer, joined to the table by nodeId (MYK9-1798).
        rowMenu={rowMenu}
        // Managers only (MYK9-1872): drag a waiting dog's grip to change the run order.
        reorder={canManageShow && runOrder ? { showId, classId: focused.id, runOrder } : undefined}
      />
    </section>
  );
  const undoNotice = canManageShow && runOrder && (
    <RunOrderUndoNotice classId={focused.id} runOrder={runOrder} />
  );
  const work = (
    <div className="space-y-5" data-testid="focused-class-work">
      <InRingTile entries={focused.entries} unread={unread} />
      <ClassChecklistSection
        // Keyed by class: the "Show all steps" state belongs to one class (MYK9-2380).
        key={focused.id}
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
    </div>
  );

  return (
    <aside className="rounded-xl border bg-card text-card-foreground shadow-sm">
      {/* No overflow-hidden on the card: it would turn the card into the header's scroll
          container and the header would never pin. */}
      <FocusedClassHeader
        eyebrow={`Selected class · ${formatTrialIdentity(trial)}`}
        title={focused.name}
        facts={facts.join(' · ')}
        pinMode={pinMode}
        compact={compact}
        actions={<FocusedClassHeaderButtons editClass={editClass} className={focused.name} />}
        summary={
          <FocusedClassSummaryLine lifecycle={focused.lifecycle.value} parts={summaryParts} />
        }
        menu={
          <FocusedClassActionsMenu
            showId={showId}
            classId={focused.id}
            className={focused.name}
            canManageShow={canManageShow}
            offerDelay={offerDelay}
            delayMinutes={delayMinutes ?? undefined}
            runOrder={runOrder}
            runOrderEntryCount={runOrderEntryCount}
            editClass={editClass}
          />
        }
      />

      <div
        className={cn(
          'space-y-5',
          compact ? 'px-5 pb-5 pt-2' : 'p-5',
          pinMode === 'panel'
            ? FOCUSED_CLASS_SCROLL_MARGIN_CLASS_IN_PANEL
            : pinMode === 'page'
              ? FOCUSED_CLASS_SCROLL_MARGIN_CLASS
              : ''
        )}
      >
        {compact ? (
          <>
            {entriesSection}
            {undoNotice}
            {work}
          </>
        ) : (
          <>
            {work}
            {entriesSection}
            {undoNotice}
          </>
        )}

        <FocusedClassRequirements
          key={focused.id}
          classId={focused.id}
          registryId={sourceClass.registryId ?? ''}
          timeZone={timeZone}
        />

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
