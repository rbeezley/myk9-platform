import {
  buildClassProgress,
  buildProgress,
  classifyClassStatus,
  classifyEntryCheckInStatus,
  classifyEntryRunStatus,
  hasEntryAttention,
  isEntryComplete,
} from './showMapStatus';
import {
  getShowMapClassHref,
  getShowMapShowHref,
  getShowMapTrialHref,
} from './showMapRoutes';
import type {
  BuildShowMapTreeInput,
  ShowMapEntryInput,
  ShowMapNode,
  ShowMapTree,
} from './showMapTypes';

const DEFAULT_ENTRY_PREVIEW_LIMIT = 25;

function readString(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function entryClassId(entry: ShowMapEntryInput): string | undefined {
  return readString(entry, 'class_id');
}

function entryDogName(entry: ShowMapEntryInput): string | undefined {
  const dog = entry.dog;
  if (!dog || typeof dog !== 'object') return undefined;
  return readString(dog as Record<string, unknown>, 'call_name') ?? readString(dog as Record<string, unknown>, 'name');
}

function entryLabel(entry: ShowMapEntryInput): string {
  const armband = readString(entry, 'armband');
  const dogName = entryDogName(entry);
  if (armband && dogName) return `#${armband} ${dogName}`;
  if (armband) return `#${armband}`;
  if (dogName) return dogName;
  const id = readString(entry, 'id') ?? 'entry';
  return `Entry ${id.slice(-6)}`;
}

function addNode(tree: ShowMapTree, node: ShowMapNode): void {
  tree.nodesById[node.id] = node;
  if (node.parentId) {
    tree.childIdsByParentId[node.parentId] = tree.childIdsByParentId[node.parentId] ?? [];
    tree.childIdsByParentId[node.parentId].push(node.id);
  }
}

function sortEntries(entries: ShowMapEntryInput[]): ShowMapEntryInput[] {
  return [...entries].sort((a, b) => {
    const orderA = readNumber(a, 'run_order') ?? Number.POSITIVE_INFINITY;
    const orderB = readNumber(b, 'run_order') ?? Number.POSITIVE_INFINITY;
    if (orderA !== orderB) return orderA - orderB;
    return entryLabel(a).localeCompare(entryLabel(b));
  });
}

export function buildShowMapTree({
  show,
  trials,
  classes,
  entries,
  entryPreviewLimit = DEFAULT_ENTRY_PREVIEW_LIMIT,
}: BuildShowMapTreeInput): ShowMapTree {
  const entriesByClassId = new Map<string, ShowMapEntryInput[]>();
  for (const entry of entries) {
    const classId = entryClassId(entry);
    if (!classId) continue;
    const classEntries = entriesByClassId.get(classId) ?? [];
    classEntries.push(entry);
    entriesByClassId.set(classId, classEntries);
  }

  const classesByTrialId = new Map<string, typeof classes>();
  for (const cls of classes) {
    const trialClasses = classesByTrialId.get(cls.trialId) ?? [];
    trialClasses.push(cls);
    classesByTrialId.set(cls.trialId, trialClasses);
  }

  const root: ShowMapNode = {
    id: `show:${show.id}`,
    type: 'show',
    label: show.name || 'Untitled Show',
    subtitle: show.clubName || undefined,
    count: trials.length,
    href: getShowMapShowHref(show.id),
    childrenCount: trials.length,
  };

  const tree: ShowMapTree = {
    root,
    nodesById: { [root.id]: root },
    childIdsByParentId: { [root.id]: [] },
  };

  for (const trial of trials) {
    const trialClasses = [...(classesByTrialId.get(trial.id) ?? [])].sort((a, b) => {
      const element = (a.element ?? '').localeCompare(b.element ?? '');
      if (element !== 0) return element;
      return (a.level ?? '').localeCompare(b.level ?? '');
    });
    const trialEntries = trialClasses.flatMap(cls => entriesByClassId.get(cls.id) ?? []);
    const completedClasses = trialClasses.filter(cls => classifyClassStatus(cls.status)?.kind === 'complete').length;
    const attentionCount = trialEntries.filter(hasEntryAttention).length;
    const trialNode: ShowMapNode = {
      id: `trial:${trial.id}`,
      type: 'trial',
      label: trial.name || `Trial ${trial.trialNumber || trial.id.slice(-4)}`,
      subtitle: [trial.trialDate, trial.trialNumber ? `Trial ${trial.trialNumber}` : undefined]
        .filter(Boolean)
        .join(' · '),
      count: trialClasses.length,
      status: classifyClassStatus(trial.status),
      progress: buildProgress(completedClasses, trialClasses.length, 'classes'),
      attentionCount,
      href: getShowMapTrialHref(show.id, trial.id),
      parentId: root.id,
      childrenCount: trialClasses.length,
    };
    addNode(tree, trialNode);

    for (const cls of trialClasses) {
      const classEntries = sortEntries(entriesByClassId.get(cls.id) ?? []);
      const attentionCountForClass = classEntries.filter(hasEntryAttention).length;
      const classNode: ShowMapNode = {
        id: `class:${cls.id}`,
        type: 'class',
        label: cls.name || [cls.element, cls.level, cls.section].filter(Boolean).join(' '),
        subtitle: cls.section ? `Section ${cls.section}` : undefined,
        count: classEntries.length,
        status: classifyClassStatus(cls.status),
        progress: buildClassProgress(cls, classEntries),
        attentionCount: attentionCountForClass,
        href: getShowMapClassHref(show.id, trial.id, cls.id),
        parentId: trialNode.id,
        childrenCount: classEntries.length,
      };
      addNode(tree, classNode);

      const visibleEntries = classEntries.slice(0, entryPreviewLimit);
      for (const entry of visibleEntries) {
        const entryId = readString(entry, 'id');
        if (!entryId) continue;
        addNode(tree, {
          id: `entry:${entryId}`,
          type: 'entry',
          label: entryLabel(entry),
          status: classifyEntryRunStatus(entry),
          checkInStatus: classifyEntryCheckInStatus(entry),
          parentId: classNode.id,
          childrenCount: 0,
        });
      }

      if (classEntries.length > entryPreviewLimit) {
        addNode(tree, {
          id: `more:${cls.id}`,
          type: 'more',
          label: `${classEntries.length - entryPreviewLimit} more entries`,
          parentId: classNode.id,
          childrenCount: 0,
          isSynthetic: true,
        });
      }
    }
  }

  const totalClasses = classes.length;
  const completedEntries = entries.filter(isEntryComplete).length;
  tree.root.count = trials.length;
  tree.root.subtitle = `${trials.length} trials · ${totalClasses} classes · ${entries.length} entries`;
  tree.root.progress = buildProgress(completedEntries, entries.length, 'entries');
  tree.root.attentionCount = entries.filter(hasEntryAttention).length;

  return tree;
}
