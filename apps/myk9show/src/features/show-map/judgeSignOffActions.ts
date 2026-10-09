/**
 * MYK9-1030: the judge's end-of-day sign-off, as Show Map actions on a class node.
 *
 * - `collect-judge-signature` opens the class's marked Result Catalog (as before MYK9-1030; a
 *   judge's-day catalog is a follow-up).
 * - `record-judge-sign-off` records "Record initials: [judge], [day]" on EVERY completed class of that
 *   judge's day in one action. It carries the class ids so the executor never re-derives them.
 * - `clear-judge-sign-off` is the per-class undo.
 *
 * Both sign-off actions appear only once the judge's day is over (`NEEDS_JUDGE_SIGNATURE`), so
 * nothing asks for initials while the judge is still judging.
 */
import { CheckCircle2, PenLine, Undo2 } from 'lucide-react';

import { judgeSignOffWording } from './judgeSignOff';
import { formatJudgeDayDate } from './judgeDay';
import { getNodeSourceId, getParentSourceId, getRootShowId } from './showMapActionHelpers';
import { getShowMapReportHref } from './showMapRoutes';
import { SHOW_MAP_WRAP_UP_STATUS } from './showMapTypes';
import type { ShowMapNode, ShowMapTree } from './showMapTypes';
import type { ShowMapAction } from './showMapActions';

/**
 * The classes one sign-off records: every class of this node's judge-day still waiting for the
 * judge, whose status is Completed (what the server requires, `mark_classes_judge_signed_off`).
 */
export function judgeDaySignOffClassIds(node: ShowMapNode, tree: ShowMapTree): string[] {
  if (node.type !== 'class' || !node.judgeDayKey) return [];
  return Object.values(tree.nodesById)
    .filter(
      candidate =>
        candidate.type === 'class' &&
        candidate.judgeDayKey === node.judgeDayKey &&
        candidate.wrapUpStatus?.value === SHOW_MAP_WRAP_UP_STATUS.NEEDS_JUDGE_SIGNATURE &&
        candidate.status?.kind === 'complete'
    )
    .map(candidate => getNodeSourceId(candidate, 'class'))
    .filter((id): id is string => Boolean(id))
    .sort();
}

export function judgeSignOffActionsForClassNode(
  node: ShowMapNode,
  tree: ShowMapTree
): ShowMapAction[] {
  if (node.type !== 'class') return [];
  const classId = getNodeSourceId(node, 'class');
  if (!classId) return [];
  const showId = getRootShowId(tree);
  const trialId = getParentSourceId(node, tree, 'trial');
  const wording = judgeSignOffWording(node.registryId);
  const ids = {
    classId,
    ...(trialId ? { trialId } : {}),
    ...(node.registryId ? { registryId: node.registryId } : {}),
  };

  if (node.wrapUpStatus?.value === SHOW_MAP_WRAP_UP_STATUS.SIGNED_BY_JUDGE) {
    return [
      {
        id: 'clear-judge-sign-off',
        nodeId: node.id,
        label: wording.undoActionLabel,
        why: 'Removes the recorded sign-off from this class only',
        priority: 15,
        icon: Undo2,
        ...ids,
      },
    ];
  }

  if (node.wrapUpStatus?.value !== SHOW_MAP_WRAP_UP_STATUS.NEEDS_JUDGE_SIGNATURE) return [];

  // Wrap-up band (see showMapActions): print the marked catalog, then record it initialed.
  const actions: ShowMapAction[] = [
    {
      id: 'collect-judge-signature',
      nodeId: node.id,
      label: wording.actionLabel,
      why: wording.actionWhy,
      priority: 55,
      icon: PenLine,
      ...ids,
      recommended: true,
      createsAttention: true,
      ...(showId && trialId
        ? {
            href: getShowMapReportHref({
              reportId: 'result-catalog',
              scope: { kind: 'class', showId, trialId, classId },
            }),
          }
        : {}),
    },
  ];

  const classIds = judgeDaySignOffClassIds(node, tree);
  if (classIds.length > 0) {
    actions.push({
      id: 'record-judge-sign-off',
      nodeId: node.id,
      label: wording.recordActionLabel(node.judgeName, formatJudgeDayDate(node.trialDate)),
      why: wording.recordActionWhy,
      priority: 54,
      icon: CheckCircle2,
      ...ids,
      classIds,
      recommended: true,
      createsAttention: true,
    });
  }
  return actions;
}
