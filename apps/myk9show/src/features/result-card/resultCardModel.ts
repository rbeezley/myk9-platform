import type { EntryClass, MyEntry } from '@/pages/MyEntriesPage/modules';

export interface ResultCardVisibility {
  showQualification: boolean;
  showPlacement: boolean;
  showTime: boolean;
  showFaults: boolean;
}

export interface BuildResultCardModelInput {
  entry: MyEntry;
  classEntry: EntryClass;
  visibility: ResultCardVisibility;
}

export interface ResultCardModel {
  entryId: string;
  releaseKey: string;
  dogName: string;
  showName: string;
  showDateLabel: string;
  className: string;
  classNumber?: string;
  armband?: string;
  resultLabel: 'Q';
  placement?: number;
  placementLabel?: string;
  timeLabel?: string;
  faultsLabel?: string;
  photoUrl?: string;
  shareTitle: string;
  shareText: string;
  shareEnabled: true;
}

export function buildResultCardVisibility(classEntry: EntryClass): ResultCardVisibility {
  return {
    showQualification: classEntry.resultStatus != null,
    showPlacement: classEntry.finalPlacement != null,
    showTime: classEntry.searchTimeSeconds != null,
    showFaults: classEntry.totalFaults != null,
  };
}

export function isQualifyingResult(resultStatus: string | undefined): boolean {
  return resultStatus === 'qualified';
}

export function buildResultCardModel({
  entry,
  classEntry,
  visibility,
}: BuildResultCardModelInput): ResultCardModel | null {
  if (!classEntry.resultsReleasedAt) return null;
  if (!visibility.showQualification) return null;
  if (!isQualifyingResult(classEntry.resultStatus)) return null;

  const placement =
    visibility.showPlacement && classEntry.finalPlacement != null && classEntry.finalPlacement >= 1
      ? classEntry.finalPlacement
      : undefined;
  const placementLabel = placement != null ? formatOrdinal(placement) : undefined;
  const timeLabel =
    visibility.showTime && classEntry.searchTimeSeconds != null
      ? `${classEntry.searchTimeSeconds.toFixed(2)}s`
      : undefined;
  const faultsLabel =
    visibility.showFaults && classEntry.totalFaults != null
      ? `${classEntry.totalFaults} ${classEntry.totalFaults === 1 ? 'fault' : 'faults'}`
      : undefined;
  const classNumber = classEntry.number || undefined;
  const releaseKey = [
    classEntry.id,
    classEntry.resultsReleasedAt,
    classEntry.resultStatus,
    placement ?? 'no-placement',
  ].join(':');

  return {
    entryId: classEntry.id,
    releaseKey,
    dogName: entry.dogName,
    showName: entry.showName,
    showDateLabel: entry.showDate.toLocaleDateString(),
    className: classEntry.name,
    ...(classNumber ? { classNumber } : {}),
    ...(entry.armband ? { armband: entry.armband } : {}),
    resultLabel: 'Q',
    ...(placement != null ? { placement } : {}),
    ...(placementLabel ? { placementLabel } : {}),
    ...(timeLabel ? { timeLabel } : {}),
    ...(faultsLabel ? { faultsLabel } : {}),
    ...(classEntry.dogImageUrl ? { photoUrl: classEntry.dogImageUrl } : {}),
    shareTitle: `${entry.dogName} qualified at ${entry.showName}`,
    shareText: `${entry.dogName} earned a Q in ${classEntry.name} at ${entry.showName}.`,
    shareEnabled: true,
  };
}

function formatOrdinal(value: number): string {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;

  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}
