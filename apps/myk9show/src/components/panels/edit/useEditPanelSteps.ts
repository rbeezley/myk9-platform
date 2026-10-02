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

function focusLater(elementId: string) {
  const focus = () => {
    const el = document.getElementById(elementId);
    el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    el?.focus({ preventScroll: true });
  };
  focus();
  // The target tab may only be mounted after the switch renders.
  requestAnimationFrame(focus);
}

/**
 * Footer and tab-bar state for a create-mode tab walk (MYK9-931, decision 13).
 *
 * `nextTab` is set on every tab but the last while creating. `goNext` and
 * `requestTab` share ONE gate: a move forward is allowed only when every tab
 * before the destination passes its per-tab check. Otherwise the user is held on
 * (or returned to) the first unfinished tab, its fields are touched so each shows
 * its own error, the first is focused, and `blockedMessage` says why. The message
 * is derived from live data, so it clears the moment the field is fixed. Backward
 * moves and edit mode are never gated.
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

  /** True when the user may arrive at tab `targetIndex`; otherwise holds them on the first unfinished tab. */
  const mayReach = useCallback(
    (targetIndex: number): boolean => {
      if (!steps) return true;
      if (schema) {
        for (let i = 0; i < targetIndex; i += 1) {
          const tab = steps.tabs[i];
          if (!tab) continue;
          const missing = issuesOnTab(schema, data, tab.value, steps.locate);
          const firstMissing = missing[0];
          if (!firstMissing) continue;
          for (const issue of missing) touchField(issue.field);
          setAttemptedTab(tab.value);
          if (tab.value !== steps.activeTab) steps.onTabChange(tab.value);
          focusLater(firstMissing.elementId);
          return false;
        }
      }
      if (
        index >= 0 &&
        index < targetIndex &&
        steps.beforeNext &&
        steps.beforeNext(steps.activeTab, data) === false
      ) {
        return false;
      }
      setAttemptedTab(null);
      return true;
    },
    [steps, schema, data, touchField, index]
  );

  const goNext = useCallback(() => {
    if (!steps || !nextTab) return;
    if (mayReach(index + 1)) steps.onTabChange(nextTab.value);
  }, [steps, nextTab, mayReach, index]);

  /** A tab-bar click. Create mode gates forward jumps; everything else goes straight through. */
  const requestTab = useCallback(
    (target: string) => {
      if (!steps) return;
      const targetIndex = steps.tabs.findIndex(tab => tab.value === target);
      if (steps.mode !== 'create' || targetIndex <= index || targetIndex < 0) {
        setAttemptedTab(null);
        steps.onTabChange(target);
        return;
      }
      if (mayReach(targetIndex)) steps.onTabChange(target);
    },
    [steps, index, mayReach]
  );

  return { nextTab, blockedMessage, goNext, requestTab: steps ? requestTab : undefined };
}
