import { getEntryAttention } from './attention';
import {
  buildProgress,
  classifyEntryCheckInStatus,
  classifyEntryRunStatus,
  isEntryComplete,
} from './showMapStatus';
import type {
  ShowMapClassInput,
  ShowMapDogEntryDisplay,
  ShowMapEntryDisplay,
  ShowMapEntryInput,
  ShowMapNode,
  ShowMapNodeType,
  ShowMapTree,
  ShowMapTrialInput,
} from './showMapTypes';

interface DogBranchEntry {
  dogKey: string;
  entry: ShowMapEntryInput;
  display: ShowMapEntryDisplay;
}

interface BuildAllExhibitorsBranchInput {
  tree: ShowMapTree;
  showId: string;
  organization?: string | undefined;
  trials: ShowMapTrialInput[];
  classes: ShowMapClassInput[];
  entries: ShowMapEntryInput[];
  addNode: (tree: ShowMapTree, node: ShowMapNode) => void;
  getNodeId: (type: ShowMapNodeType, id: string) => string;
  entryClassId: (entry: ShowMapEntryInput) => string | undefined;
  entryDisplay: (
    entry: ShowMapEntryInput,
    organization?: string | undefined
  ) => ShowMapEntryDisplay;
  classRingLabel: (cls: ShowMapClassInput) => string | undefined;
}

function readString(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function normalizeDogKeyPart(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-');
}

function entryDogGroupKey(
  entry: ShowMapEntryInput,
  display: ShowMapEntryDisplay
): string | undefined {
  if (display.dogId) return display.dogId;

  const entryId = readString(entry, 'id');
  if (entryId) return `unknown-entry:${entryId}`;

  const fallbackParts = [display.armband, display.handler, display.dogName]
    .filter((part): part is string => Boolean(part))
    .map(normalizeDogKeyPart);
  return fallbackParts.length > 0 ? `unknown-composite:${fallbackParts.join(':')}` : undefined;
}

function dogLabel(display: ShowMapEntryDisplay): string {
  const dogName = display.dogName === 'Unknown' ? 'Unknown dog' : display.dogName;
  if (display.armband && dogName) return `#${display.armband} ${dogName}`;
  if (display.armband) return `#${display.armband}`;
  return dogName;
}

function dogSubtitle(display: ShowMapEntryDisplay): string | undefined {
  return [display.handler, display.breed].filter(Boolean).join(' · ') || undefined;
}

function armbandSortValue(display: ShowMapEntryDisplay): number {
  if (!display.armband) return Number.POSITIVE_INFINITY;
  const parsed = Number.parseInt(display.armband, 10);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function compareDogBranchEntries(a: DogBranchEntry, b: DogBranchEntry): number {
  const armbandA = armbandSortValue(a.display);
  const armbandB = armbandSortValue(b.display);
  if (armbandA !== armbandB) return armbandA - armbandB;
  const dogName = a.display.dogName.localeCompare(b.display.dogName);
  if (dogName !== 0) return dogName;
  const handler = (a.display.handler ?? '').localeCompare(b.display.handler ?? '');
  if (handler !== 0) return handler;
  const dogKey = a.dogKey.localeCompare(b.dogKey);
  if (dogKey !== 0) return dogKey;
  return (readString(a.entry, 'id') ?? '').localeCompare(readString(b.entry, 'id') ?? '');
}

function sortDogBranchEntries(entries: DogBranchEntry[]): DogBranchEntry[] {
  return [...entries].sort(compareDogBranchEntries);
}

function classLabel(cls: ShowMapClassInput | undefined): string {
  if (!cls) return 'Unknown class';
  return (
    cls.name || [cls.element, cls.level, cls.section].filter(Boolean).join(' ') || 'Unknown class'
  );
}

function trialLabel(
  trial: ShowMapTrialInput | undefined,
  cls: ShowMapClassInput | undefined
): string | undefined {
  if (trial) {
    return (
      trial.name || trial.showName || (trial.trialNumber ? `Trial ${trial.trialNumber}` : undefined)
    );
  }
  return cls?.trialName || (cls?.trialNumber ? `Trial ${cls.trialNumber}` : undefined);
}

function dogEntryDisplayFor(
  entry: ShowMapEntryInput,
  cls: ShowMapClassInput | undefined,
  trial: ShowMapTrialInput | undefined,
  classRingLabel: (cls: ShowMapClassInput) => string | undefined
): ShowMapDogEntryDisplay | undefined {
  const entryId = readString(entry, 'id');
  if (!entryId) return undefined;
  const ringLabel = cls ? classRingLabel(cls) : undefined;
  return {
    entryId,
    classId: cls?.id,
    classLabel: classLabel(cls),
    trialId: trial?.id,
    trialLabel: trialLabel(trial, cls),
    trialDate: trial?.trialDate || cls?.trialDate,
    ringLabel,
    judgeName: cls?.judgeName || undefined,
    startTime: cls?.time || undefined,
  };
}

function dogEntrySubtitle(display: ShowMapDogEntryDisplay): string | undefined {
  return (
    [display.trialLabel, display.trialDate, display.ringLabel, display.judgeName, display.startTime]
      .filter(Boolean)
      .join(' · ') || undefined
  );
}

export function addAllExhibitorsBranch({
  tree,
  showId,
  organization,
  trials,
  classes,
  entries,
  addNode,
  getNodeId,
  entryClassId,
  entryDisplay,
  classRingLabel,
}: BuildAllExhibitorsBranchInput): boolean {
  const classById = new Map(classes.map(cls => [cls.id, cls]));
  const trialById = new Map(trials.map(trial => [trial.id, trial]));
  const dogEntriesByKey = new Map<string, DogBranchEntry[]>();

  for (const entry of entries) {
    const display = entryDisplay(entry, organization);
    const dogKey = entryDogGroupKey(entry, display);
    if (!dogKey) continue;

    const dogEntries = dogEntriesByKey.get(dogKey) ?? [];
    dogEntries.push({ dogKey, entry, display });
    dogEntriesByKey.set(dogKey, dogEntries);
  }

  if (dogEntriesByKey.size === 0) return false;

  const allExhibitorsId = getNodeId('all-exhibitors', showId);
  const dogBranches = Array.from(dogEntriesByKey.entries())
    .map(([dogKey, dogEntries]) => ({
      dogKey,
      dogEntries: sortDogBranchEntries(dogEntries),
    }))
    .sort((a, b) => compareDogBranchEntries(a.dogEntries[0]!, b.dogEntries[0]!));

  addNode(tree, {
    id: allExhibitorsId,
    type: 'all-exhibitors',
    label: 'All Exhibitors',
    count: dogBranches.length,
    parentId: tree.root.id,
    childrenCount: dogBranches.length,
    isSynthetic: true,
  });

  for (const { dogKey, dogEntries } of dogBranches) {
    const primaryDogEntry = dogEntries[0]!;
    const dogNodeId = getNodeId('dog', dogKey);
    const completedEntries = dogEntries.filter(({ entry }) => isEntryComplete(entry)).length;
    const attentionCount = dogEntries.filter(
      ({ entry }) => getEntryAttention(entry) !== null
    ).length;

    addNode(tree, {
      id: dogNodeId,
      type: 'dog',
      label: dogLabel(primaryDogEntry.display),
      subtitle: dogSubtitle(primaryDogEntry.display),
      count: dogEntries.length,
      progress: buildProgress(completedEntries, dogEntries.length, 'entries'),
      attentionCount,
      parentId: allExhibitorsId,
      childrenCount: dogEntries.length,
    });

    for (const { entry } of dogEntries) {
      const cls = classById.get(entryClassId(entry) ?? '');
      const trial = cls ? trialById.get(cls.trialId) : undefined;
      const display = dogEntryDisplayFor(entry, cls, trial, classRingLabel);
      if (!display) continue;

      addNode(tree, {
        id: getNodeId('dog-entry', display.entryId),
        type: 'dog-entry',
        label: display.classLabel,
        subtitle: dogEntrySubtitle(display),
        entryDisplay: entryDisplay(entry, organization),
        dogEntryDisplay: display,
        status: classifyEntryRunStatus(entry),
        checkInStatus: classifyEntryCheckInStatus(entry),
        trialDate: display.trialDate,
        timezone: trial?.timezone,
        parentId: dogNodeId,
        childrenCount: 0,
      });
    }
  }

  return true;
}
