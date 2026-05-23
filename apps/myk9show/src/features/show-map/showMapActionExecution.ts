import type { ShowMapAction, ShowMapActionId } from './showMapActions';

export type ShowMapActionDialogKey = 'move-up-entry' | 'scratch-entry' | 'message-handler';

export type ShowMapActionMutationKey =
  | 'mark-checked-in'
  | 'mark-class-started'
  | 'mark-class-complete';

export type ShowMapActionExecution =
  | {
      kind: 'navigate';
    }
  | {
      kind: 'dialog';
      dialog: ShowMapActionDialogKey;
    }
  | {
      kind: 'mutation';
      mutation: ShowMapActionMutationKey;
      successMessage: string;
    }
  | {
      kind: 'disabled';
      disabledReason: string;
      futureKind: 'dialog' | 'mutation' | 'navigate';
    };

export type ExecutableShowMapActionExecution = Exclude<
  ShowMapActionExecution,
  { kind: 'disabled' }
>;

export type ResolvedShowMapActionExecution =
  | {
      kind: 'navigate';
      href: string;
    }
  | Extract<ExecutableShowMapActionExecution, { kind: 'dialog' }>
  | Extract<ExecutableShowMapActionExecution, { kind: 'mutation' }>
  | {
      kind: 'disabled';
      disabledReason: string;
      futureKind?: 'dialog' | 'mutation' | 'navigate' | undefined;
    };

export const showMapActionExecutionById = {
  'review-entry': { kind: 'navigate' },
  'edit-score': { kind: 'navigate' },
  'score-class': { kind: 'navigate' },
  'open-class': { kind: 'navigate' },
  'print-check-in-sheet': { kind: 'navigate' },
  'mark-class-started': {
    kind: 'mutation',
    mutation: 'mark-class-started',
    successMessage: 'Class marked started',
  },
  'mark-class-complete': {
    kind: 'mutation',
    mutation: 'mark-class-complete',
    successMessage: 'Class marked complete',
  },
  'open-schedule': { kind: 'navigate' },
  'print-trial-reports': { kind: 'navigate' },
  'collect-judge-signature': { kind: 'navigate' },
  'review-results': { kind: 'navigate' },
  'submit-final-results': { kind: 'navigate' },
  'mark-checked-in': {
    kind: 'mutation',
    mutation: 'mark-checked-in',
    successMessage: 'Entry checked in',
  },
  'move-up-entry': {
    kind: 'dialog',
    dialog: 'move-up-entry',
  },
  'scratch-entry': {
    kind: 'dialog',
    dialog: 'scratch-entry',
  },
  'message-handler': {
    kind: 'dialog',
    dialog: 'message-handler',
  },
} satisfies Record<ShowMapActionId, ShowMapActionExecution>;

export function resolveShowMapActionExecution(
  action: ShowMapAction
): ResolvedShowMapActionExecution {
  const execution = showMapActionExecutionById[action.id];

  if (execution.kind === 'navigate') {
    if (!action.href) {
      return {
        kind: 'disabled',
        futureKind: 'navigate',
        disabledReason: 'No destination is available for this action.',
      };
    }

    return {
      ...execution,
      href: action.href,
    };
  }

  return execution;
}

export function isShowMapActionEnabled(action: ShowMapAction): boolean {
  return resolveShowMapActionExecution(action).kind !== 'disabled';
}
