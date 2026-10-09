/**
 * MYK9-1030/1031: the judge's end-of-day sign-off, as a Show Map action on a class node.
 *
 * `collect-judge-signature` appears only once the judge's day is over (`NEEDS_JUDGE_SIGNATURE`),
 * so nothing asks for initials while the judge is still judging. It is a link: the sign-off is
 * printed, recorded and undone on the Results tab's Judge sign-off section (one place for the
 * whole judge's day), so this surface only points at the class there.
 */
import { PenLine } from 'lucide-react';

import { getCockpitResultsControlHref } from './cockpit/cockpitRoutes';
import { judgeSignOffWording } from './judgeSignOff';
import { getNodeSourceId, getParentSourceId, getRootShowId } from './showMapActionHelpers';
import { SHOW_MAP_WRAP_UP_STATUS } from './showMapTypes';
import type { ShowMapNode, ShowMapTree } from './showMapTypes';
import type { ShowMapAction } from './showMapActions';

export function judgeSignOffActionsForClassNode(
  node: ShowMapNode,
  tree: ShowMapTree
): ShowMapAction[] {
  if (node.type !== 'class') return [];
  if (node.wrapUpStatus?.value !== SHOW_MAP_WRAP_UP_STATUS.NEEDS_JUDGE_SIGNATURE) return [];
  const classId = getNodeSourceId(node, 'class');
  if (!classId) return [];
  const showId = getRootShowId(tree);
  const trialId = getParentSourceId(node, tree, 'trial');
  const wording = judgeSignOffWording(node.registryId);

  return [
    {
      id: 'collect-judge-signature',
      nodeId: node.id,
      label: wording.actionLabel,
      why: wording.actionWhy,
      priority: 55,
      icon: PenLine,
      classId,
      ...(trialId ? { trialId } : {}),
      recommended: true,
      createsAttention: true,
      ...(showId && trialId
        ? { href: getCockpitResultsControlHref({ showId, trialId, classId }) }
        : {}),
    },
  ];
}
