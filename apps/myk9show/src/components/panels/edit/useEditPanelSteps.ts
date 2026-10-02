import { useCallback, useState } from 'react';
import type { z } from 'zod';
import type { EditPanelSteps } from './EditPanelWrapper.types';

export interface TabIssue {
  field: string;
  message: string;
  elementId: string;
}

/**
 * The schema's issues that belong to `tab`, one per field in schema order. Only
 * fields the panel maps to a tab are considered, so an unmapped field never
 * blocks the walk.
 */
export function issuesOnTab(
  schema: z.ZodTypeAny,
  data: unknown,
  tab: string,
  locate: EditPanelSteps['locate']
): TabIssue[] {
  const result = schema.safeParse(data);
  if (result.success) return [];
  const seen = new Set<string>();
  const issues: TabIssue[] = [];
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (typeof field !== 'string' || seen.has(field)) continue;
    const location = locate(field);
    if (!location || location.tab !== tab) continue;
    seen.add(field);
    issues.push({ field, message: issue.message, elementId: location.elementId });
  }
  return issues;
}

interface UseEditPanelStepsArgs {
  steps: EditPanelSteps | undefined;
  schema: z.ZodTypeAny | undefined;
  data: unknown;
  touchField: (field: string) => void;
  /** The panel's open state; a reopened panel starts with no "blocked" message. */
  open: boolean;
}

/**
 * Footer state for a create-mode tab walk (MYK9-931). `nextTab` is set on every
 * tab but the last while creating. `goNext` moves on when the current tab has no
 * outstanding required field; otherwise it touches those fields (so each shows
 * its own inline error), focuses the first, and `blockedMessage` says why. The
 * message is derived from live data, so it clears the moment the field is fixed.
 */
export function useEditPanelSteps({
  steps,
  schema,
  data,
  touchField,
  open,
}: UseEditPanelStepsArgs) {
  const [attemptedTab, setAttemptedTab] = useState<string | null>(null);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setAttemptedTab(null);
  }

  const index = steps ? steps.tabs.findIndex(tab => tab.value === steps.activeTab) : -1;
  const nextTab = steps?.mode === 'create' && index >= 0 ? steps.tabs[index + 1] : undefined;

  const outstanding =
    steps && schema && attemptedTab === steps.activeTab
      ? issuesOnTab(schema, data, steps.activeTab, steps.locate)
      : [];
  const first = outstanding[0];
  const blockedMessage = first
    ? outstanding.length > 1
      ? `${first.message} (and ${outstanding.length - 1} more on this tab)`
      : first.message
    : null;

  const goNext = useCallback(() => {
    if (!steps || !nextTab) return;
    const missing = schema ? issuesOnTab(schema, data, steps.activeTab, steps.locate) : [];
    const firstMissing = missing[0];
    if (firstMissing) {
      for (const issue of missing) touchField(issue.field);
      setAttemptedTab(steps.activeTab);
      const el = document.getElementById(firstMissing.elementId);
      el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      el?.focus({ preventScroll: true });
      return;
    }
    setAttemptedTab(null);
    if (steps.beforeNext && steps.beforeNext(steps.activeTab, data) === false) return;
    steps.onTabChange(nextTab.value);
  }, [steps, nextTab, schema, data, touchField]);

  return { nextTab, blockedMessage, goNext };
}
