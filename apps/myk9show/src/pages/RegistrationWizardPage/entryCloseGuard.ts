import type { WorkflowMode } from '@/components/shows/RegistrationWorkflow/RegistrationWorkflow.types';
import { formatDateLocal, parseLocalDateString } from '@/utils/dateLocal';

export interface EntryCloseSubmitGuardContext {
  startDate?: string | null | undefined;
  entryCloseDate?: string | null | undefined;
  today?: string | undefined;
  isLateEntryMode: boolean;
  workflowMode: WorkflowMode;
}

function parseCalendarDate(value?: string | null): Date | undefined {
  if (!value) return undefined;
  return parseLocalDateString(value.split('T')[0] ?? value);
}

export function getEntryCloseSubmitBlocker({
  entryCloseDate,
  today,
  isLateEntryMode,
}: EntryCloseSubmitGuardContext): string | null {
  if (isLateEntryMode) return null;

  const closeDate = parseCalendarDate(entryCloseDate);
  if (!closeDate) return null;

  const currentDate = parseCalendarDate(today ?? formatDateLocal(new Date()));
  if (!currentDate) return null;

  if (currentDate.getTime() > closeDate.getTime()) {
    return 'Entries are closed for this show. Contact the trial secretary for late-entry help.';
  }

  return null;
}
