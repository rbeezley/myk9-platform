import type { ShowMapAction, ShowMapActionId } from './showMapActions';

export type ShowMapActionDialogKey =
  | 'move-up-entry'
  | 'scratch-entry'
  | 'message-handler';

export type ShowMapActionMutationKey = 'mark-checked-in';

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
  'resolve-check-in-conflict': { kind: 'navigate' },
  'review-entry': { kind: 'navigate' },
  'score-class': { kind: 'navigate' },
  'open-class': { kind: 'navigate' },
  'print-check-in-sheet': { kind: 'navigate' },
  'open-schedule': { kind: 'navigate' },
  'print-trial-reports': { kind: 'navigate' },
  'mark-checked-in': {
    kind: 'disabled',
    futureKind: 'mutation',
    disabledReason: 'Check-in from Show Map is coming next. Use the Check-In tab for now.',
  },
  'move-up-entry': {
    kind: 'disabled',
    futureKind: 'dialog',
    disabledReason: 'Move-ups from Show Map are coming next. Use Day of Show > Move-Ups for now.',
  },
  'scratch-entry': {
    kind: 'disabled',
    futureKind: 'dialog',
    disabledReason: 'Scratches from Show Map are coming next. Use Day of Show > Pulled for now.',
  },
  'message-handler': {
    kind: 'disabled',
    futureKind: 'dialog',
    disabledReason: 'Messaging from Show Map is coming next. Use Messages for now.',
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
