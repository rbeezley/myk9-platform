import type { ShowMapAction } from './showMapActions';
import type { ShowMapTree } from './showMapTypes';

export interface ShowMapActionGroupItem {
  action: ShowMapAction;
  disambiguator?: string;
}

export interface ShowMapActionGroup {
  key: string;
  representative: ShowMapAction;
  count: number;
  items: ShowMapActionGroupItem[];
}

function classLabelForEntryAction(
  action: ShowMapAction,
  tree: ShowMapTree
): string | undefined {
  const node = tree.nodesById[action.nodeId];
  if (!node) return undefined;
  if (node.type === 'dog-entry') return node.dogEntryDisplay?.classLabel;
  if (node.type !== 'entry' || !node.parentId) return undefined;
  const parent = tree.nodesById[node.parentId];
  return parent?.label;
}

function groupKeyFor(action: ShowMapAction, tree: ShowMapTree): string {
  const node = tree.nodesById[action.nodeId];
  if (node?.type === 'entry' || node?.type === 'dog-entry') {
    const dogId = node.entryDisplay?.dogId;
    if (dogId) return `${action.id}:dog:${dogId}`;
  }
  return `${action.id}:node:${action.nodeId}`;
}

export function groupActionsByEntity(
  actions: readonly ShowMapAction[],
  tree: ShowMapTree
): ShowMapActionGroup[] {
  const groupsByKey = new Map<string, ShowMapActionGroup>();
  const order: string[] = [];
  for (const action of actions) {
    const key = groupKeyFor(action, tree);
    const disambiguator = classLabelForEntryAction(action, tree);
    const item: ShowMapActionGroupItem = disambiguator
      ? { action, disambiguator }
      : { action };
    const existing = groupsByKey.get(key);
    if (existing) {
      existing.items.push(item);
      existing.count = existing.items.length;
    } else {
      groupsByKey.set(key, {
        key,
        representative: action,
        count: 1,
        items: [item],
      });
      order.push(key);
    }
  }
  return order.map(key => groupsByKey.get(key)!);
}
