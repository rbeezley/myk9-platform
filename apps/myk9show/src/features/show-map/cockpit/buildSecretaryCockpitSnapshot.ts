import { getTrialTimezone } from '@/features/registries';

import { getAttentionActions, getRecommendedActionsForNode } from '../showMapActions';
import { SHOW_MAP_WRAP_UP_STATUS } from '../showMapTypes';
import type { ShowDeskPendingSignal } from '../showDeskPendingSignals';
import type { ShowMapAction } from '../showMapActions';
import type { ShowMapClassInput, ShowMapTree, ShowMapTrialInput } from '../showMapTypes';
import {
  getCockpitClassDetailsHref,
  getCockpitClassManagementHref,
  getCockpitPaperScoringHref,
  getCockpitReportHref,
} from './cockpitRoutes';
import type {
  CockpitAttentionKind,
  CockpitCloseoutState,
  CockpitLifecycle,
  SecretaryCockpitAction,
  SecretaryCockpitAttention,
  SecretaryCockpitPaperwork,
  SecretaryCockpitSnapshot,
} from './secretaryCockpitTypes';

export interface BuildSecretaryCockpitSnapshotInput {
  showId: string;
  trials: readonly ShowMapTrialInput[];
  classes: readonly ShowMapClassInput[];
  tree: ShowMapTree;
  pendingSignals: readonly ShowDeskPendingSignal[];
  returnTo: string;
  now: Date;
  paperworkByClassId?: ReadonlyMap<string, readonly SecretaryCockpitPaperwork[]>;
}

function lifecycleFor(status: string | undefined): CockpitLifecycle | null {
  switch ((status ?? '').trim().toLowerCase().replace(/\s+/g, '_')) {
    case 'setup':
    case 'scheduled':
    case 'upcoming':
    case 'not_started':
      return 'not-started';
    case 'in_progress':
    case 'active':
      return 'in-progress';
    case 'complete':
    case 'completed':
      return 'complete';
    case 'cancelled':
    case 'canceled':
      return 'cancelled';
    default:
      return null;
  }
}

function closeoutFor(value: string | undefined): CockpitCloseoutState {
  if (value === SHOW_MAP_WRAP_UP_STATUS.SUBMITTED_TO_REGISTRY) return 'closed';
  if (
    value === SHOW_MAP_WRAP_UP_STATUS.NEEDS_JUDGE_SIGNATURE ||
    value === SHOW_MAP_WRAP_UP_STATUS.CLASS_READY_FOR_WRAP_UP ||
    value === SHOW_MAP_WRAP_UP_STATUS.SIGNED_BY_JUDGE
  ) {
    return 'needs-closeout';
  }
  return 'none';
}

function attentionKind(action: ShowMapAction): CockpitAttentionKind {
  if (action.id === 'score-class' || action.id === 'edit-score') return 'active-work';
  if (
    action.id === 'collect-judge-signature' ||
    action.id === 'review-results' ||
    action.id === 'submit-final-results'
  ) {
    return 'closeout';
  }
  return 'blocker';
}

function destinationFor(action: ShowMapAction): SecretaryCockpitAction['destination'] {
  return action.href
    ? { kind: 'href', href: action.href }
    : { kind: 'command', commandId: `${action.id}:${action.nodeId}` };
}

function actionFor(
  action: ShowMapAction,
  group: SecretaryCockpitAction['group']
): SecretaryCockpitAction {
  return {
    id: `${action.id}:${action.nodeId}`,
    label: action.label,
    destination: destinationFor(action),
    group,
    priority: action.priority,
  };
}

function classWorkActions(input: {
  showId: string;
  trialId: string;
  classId: string;
  returnTo: string;
}): SecretaryCockpitAction[] {
  const scope = {
    kind: 'class' as const,
    showId: input.showId,
    trialId: input.trialId,
    classId: input.classId,
  };
  return [
    {
      id: `class-details:${input.classId}`,
      label: 'View entries and results',
      destination: { kind: 'href', href: getCockpitClassDetailsHref(input) },
      group: 'class-work',
    },
    {
      id: `paper-scoring:${input.classId}`,
      label: 'Enter paper scores',
      destination: { kind: 'href', href: getCockpitPaperScoringHref(input) },
      group: 'class-work',
    },
    {
      id: `run-order:${input.classId}`,
      label: 'Run order and class setup',
      destination: { kind: 'href', href: getCockpitClassManagementHref(input) },
      group: 'class-work',
    },
    {
      id: `reports:${input.classId}`,
      label: 'Class reports',
      destination: {
        kind: 'href',
        href: getCockpitReportHref({
          reportId: 'check-in-sheet',
          scope,
          returnTo: input.returnTo,
        }),
      },
      group: 'class-work',
    },
  ];
}

function administrativeAttention(
  signals: readonly ShowDeskPendingSignal[],
  returnTo: string
): SecretaryCockpitAttention[] {
  return signals.map(signal => ({
    id: signal.id,
    kind: signal.priority === 'medium' ? 'administrative' : 'blocker',
    label: signal.label,
    reason: signal.label,
    destination: signal.href
      ? {
          kind: 'href',
          href: `${signal.href}${signal.href.includes('?') ? '&' : '?'}returnTo=${encodeURIComponent(
            returnTo
          )}`,
        }
      : null,
  }));
}

export function buildSecretaryCockpitSnapshot({
  showId,
  trials,
  classes,
  tree,
  pendingSignals,
  returnTo,
  now,
  paperworkByClassId,
}: BuildSecretaryCockpitSnapshotInput): SecretaryCockpitSnapshot {
  const timeZone = getTrialTimezone(trials[0]);

  return {
    showId,
    timeZone,
    now,
    trials: trials.map((trial, index) => ({
      id: trial.id,
      date: trial.trialDate,
      number: trial.trialNumber || String(index + 1),
      ...(trial.name ? { name: trial.name } : {}),
      order: Number.parseInt(trial.order || '', 10) || index + 1,
    })),
    classes: classes.map((classItem, index) => {
      const node = tree.nodesById[`class:${classItem.id}`];
      const actions = node
        ? getRecommendedActionsForNode(node, { tree, now }, 1).map(action =>
            actionFor(action, 'primary')
          )
        : [];
      const attention = node
        ? getAttentionActions(node, { tree, now })
            // Pending Entry review has one canonical owner page and is already
            // represented by the Show-level signal below. Keeping the legacy
            // executor here would duplicate that workflow inside the cockpit.
            .filter(action => action.id !== 'review-entry')
            .map(action => ({
              id: `${action.id}:${action.nodeId}`,
              dedupeKey: `${action.id}:${action.nodeId}`,
              classId: classItem.id,
              kind: attentionKind(action),
              label: action.label,
              reason: action.why,
              destination: destinationFor(action),
            }))
        : [];
      return {
        id: classItem.id,
        trialId: classItem.trialId,
        name: classItem.name,
        classOrder: classItem.displayOrder ?? index,
        scheduledStart: classItem.time ?? null,
        revisedExpectedStart: classItem.revisedExpectedStart ?? null,
        lifecycle: lifecycleFor(classItem.status),
        actualStart: classItem.actualStartTime ?? null,
        actualFinish: classItem.actualFinishTime ?? null,
        // NOT `?? 0`. `progressFor` in secretaryCockpitModel returns
        // { evidence: 'unknown', value: null } when either count is null, and
        // the whole EvidenceValue design exists so the cockpit can say "I don't
        // know" instead of "zero". Defaulting here filled that state in one
        // step before it could ever be entered, so the unknown branch was dead
        // code and a paused entries read rendered as "0 of 0 scored".
        entryCount: classItem.entryCount ?? null,
        scoredCount: classItem.scoredCount ?? null,
        closeout: closeoutFor(node?.wrapUpStatus?.value),
        judgeName: classItem.judgeName ?? null,
        operationalArea:
          node?.ringLabel && node.ringLabel !== '—'
            ? { kind: 'ring' as const, labels: [node.ringLabel] }
            : null,
        attention,
        actions: [
          ...actions,
          ...classWorkActions({
            showId,
            trialId: classItem.trialId,
            classId: classItem.id,
            returnTo,
          }),
        ],
        paperwork: [...(paperworkByClassId?.get(classItem.id) ?? [])],
      };
    }),
    administrativeAttention: administrativeAttention(pendingSignals, returnTo),
  };
}
