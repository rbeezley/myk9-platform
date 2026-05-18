import {
  buildClassProgress,
  buildProgress,
  classifyClassStatus,
  classifyClassWrapUpStatus,
  classifyEntryCheckInStatus,
  classifyEntryRunStatus,
  isEntryComplete,
} from './showMapStatus';
import { getEntryAttention } from './attention';
import {
  getShowMapClassHref,
  getShowMapClassScoringHref,
  getShowMapShowHref,
  getShowMapTrialHref,
} from './showMapRoutes';
import { getRegisteredBreedForOrganization } from '@/lib/dogRegistrationBreed';
import type {
  BuildShowMapTreeInput,
  ShowMapEntryDisplay,
  ShowMapEntryInput,
  ShowMapNode,
  ShowMapNodeType,
  ShowMapTree,
} from './showMapTypes';

const DEFAULT_ENTRY_PREVIEW_LIMIT = 25;

export function getShowMapNodeId(type: ShowMapNodeType, id: string): string {
  return `${type}:${id}`;
}

function readString(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function classRingLabel(cls: {
  ring?: string | number | null | undefined;
  ringName?: string | undefined;
}) {
  if (cls.ringName?.trim()) return cls.ringName.trim();
  if (typeof cls.ring === 'number' && cls.ring > 0) return `Ring ${cls.ring}`;
  if (typeof cls.ring === 'string') {
    const ring = cls.ring.trim();
    if (!ring || ring === '0') return undefined;
    return ring.toLowerCase().startsWith('ring') ? ring : `Ring ${ring}`;
  }
  return undefined;
}

function entryClassId(entry: ShowMapEntryInput): string | undefined {
  return readString(entry, 'class_id');
}

function entryDogName(entry: ShowMapEntryInput): string | undefined {
  const dog = entry.dog;
  if (!dog || typeof dog !== 'object') return undefined;
  return (
    readString(dog as Record<string, unknown>, 'call_name') ??
    readString(dog as Record<string, unknown>, 'name')
  );
}

function entryDogId(entry: ShowMapEntryInput): string | undefined {
  const dog = entry.dog;
  if (dog && typeof dog === 'object') {
    return readString(dog as Record<string, unknown>, 'id') ?? readString(entry, 'dog_id');
  }
  return readString(entry, 'dog_id');
}

function entryHandlerName(entry: ShowMapEntryInput): string | undefined {
  return readString(entry, 'handler') ?? readString(entry, 'handler_name');
}

function entryHandlerId(entry: ShowMapEntryInput): string | undefined {
  return readString(entry, 'handler_id');
}

function entryRegisteredBreed(entry: ShowMapEntryInput, organization?: string): string | undefined {
  const dog = entry.dog;
  if (!dog || typeof dog !== 'object') return undefined;
  const dogRecord = dog as Record<string, unknown>;
  const registrations = dogRecord.registrations;
  if (organization && Array.isArray(registrations)) {
    const registrationBreed = getRegisteredBreedForOrganization(
      registrations.filter(registration => registration && typeof registration === 'object') as {
        organization?: string | null | undefined;
        breed?: string | null | undefined;
      }[],
      organization
    );
    if (registrationBreed) return registrationBreed;
  }
  return readString(dogRecord, 'breed') ?? readString(entry, 'dog_breed');
}

function entryDisplay(entry: ShowMapEntryInput, organization?: string): ShowMapEntryDisplay {
  const dogId = entryDogId(entry);
  const handlerId = entryHandlerId(entry);
  return {
    armband: readString(entry, 'armband') ?? readString(entry, 'armband_number'),
    dogName: entryDogName(entry) ?? 'Unknown',
    breed: entryRegisteredBreed(entry, organization),
    handler: entryHandlerName(entry),
    handlerId,
    dogHref: dogId ? `/dogs/${dogId}` : undefined,
    handlerHref: handlerId ? `/people/${handlerId}` : undefined,
  };
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
    id: getShowMapNodeId('show', show.id),
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
    const completedClasses = trialClasses.filter(
      cls => classifyClassStatus(cls.status)?.kind === 'complete'
    ).length;
    const classWrapUpStatuses = trialClasses
      .map(cls => classifyClassWrapUpStatus(cls, entriesByClassId.get(cls.id) ?? []))
      .filter((status): status is NonNullable<typeof status> => Boolean(status));
    const trialWrapUpStatus =
      classWrapUpStatuses.length === 0
        ? undefined
        : classWrapUpStatuses.some(status => status.kind === 'attention')
          ? { value: 'needs-wrap-up', label: 'Needs wrap-up', kind: 'attention' as const }
          : classWrapUpStatuses.every(status => status.value === 'submitted-to-registry')
            ? {
                value: 'submitted-to-registry',
                label: 'Submitted to registry',
                kind: 'complete' as const,
              }
            : { value: 'wrap-up-ready', label: 'Wrap-up ready', kind: 'neutral' as const };
    const attentionCount = trialEntries.filter(entry => getEntryAttention(entry) !== null).length;
    const trialNode: ShowMapNode = {
      id: getShowMapNodeId('trial', trial.id),
      type: 'trial',
      label: trial.name || `Trial ${trial.trialNumber || trial.id.slice(-4)}`,
      subtitle: [trial.trialDate, trial.trialNumber ? `Trial ${trial.trialNumber}` : undefined]
        .filter(Boolean)
        .join(' · '),
      count: trialClasses.length,
      status: classifyClassStatus(trial.status),
      wrapUpStatus: trialWrapUpStatus,
      progress: buildProgress(completedClasses, trialClasses.length, 'classes'),
      attentionCount,
      href: getShowMapTrialHref(show.id, trial.id),
      trialDate: trial.trialDate || undefined,
      timezone: trial.timezone,
      parentId: root.id,
      childrenCount: trialClasses.length,
    };
    addNode(tree, trialNode);

    for (const cls of trialClasses) {
      const classEntries = sortEntries(entriesByClassId.get(cls.id) ?? []);
      const attentionCountForClass = classEntries.filter(
        entry => getEntryAttention(entry) !== null
      ).length;
      const classNode: ShowMapNode = {
        id: getShowMapNodeId('class', cls.id),
        type: 'class',
        label: cls.name || [cls.element, cls.level, cls.section].filter(Boolean).join(' '),
        subtitle: cls.section ? `Section ${cls.section}` : undefined,
        count: classEntries.length,
        status: classifyClassStatus(cls.status),
        wrapUpStatus: classifyClassWrapUpStatus(cls, classEntries),
        progress: buildClassProgress(cls, classEntries),
        attentionCount: attentionCountForClass,
        href: getShowMapClassHref(show.id, trial.id, cls.id),
        scoreHref: getShowMapClassScoringHref(cls.id),
        trialDate: trial.trialDate || undefined,
        timezone: trial.timezone,
        ringLabel: classRingLabel(cls),
        judgeName: cls.judgeName || undefined,
        startTime: cls.time || undefined,
        parentId: trialNode.id,
        childrenCount: classEntries.length,
      };
      addNode(tree, classNode);

      const visibleEntries = classEntries.slice(0, entryPreviewLimit);
      for (const entry of visibleEntries) {
        const entryId = readString(entry, 'id');
        if (!entryId) continue;
        addNode(tree, {
          id: getShowMapNodeId('entry', entryId),
          type: 'entry',
          label: entryLabel(entry),
          entryDisplay: entryDisplay(entry, show.organization),
          status: classifyEntryRunStatus(entry),
          checkInStatus: classifyEntryCheckInStatus(entry),
          trialDate: trial.trialDate || undefined,
          timezone: trial.timezone,
          parentId: classNode.id,
          childrenCount: 0,
        });
      }

      if (classEntries.length > entryPreviewLimit) {
        addNode(tree, {
          id: getShowMapNodeId('more', cls.id),
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
  tree.root.attentionCount = entries.filter(entry => getEntryAttention(entry) !== null).length;

  return tree;
}

// INTENT: Default to root-only expansion so the secretary lands on a calm
// list of trial rows ("a clear checklist view — green checks, not a wall of
// data"). Trials remain visible because the root is expanded, but their
// class children stay collapsed until the secretary opens the trial they
// care about. The toolbar's "Expand trials" button still expands every trial
// on demand. See OPEN-TODOS / "Show Map default expansion creates a wall of
// empty rows".
export function getDefaultExpandedNodeIds(tree: ShowMapTree): Set<string> {
  return new Set([tree.root.id]);
}

// "Expand trials" toolbar action — expands the root plus every trial so
// every class row is visible at once. This is the previous default; it now
// only fires when the secretary explicitly asks for it.
export function getTrialsExpandedNodeIds(tree: ShowMapTree): Set<string> {
  return new Set([tree.root.id, ...(tree.childIdsByParentId[tree.root.id] ?? [])]);
}
