import type { EntryManagementEntry } from '@/types/entry-management-types';
import { groupEntriesByEnrollment, type EnrollmentGroup } from '@/utils/enrollmentGrouping';
import {
  classifyEntryAttention,
  type EntryAttentionReason,
} from '@/features/entry-operations/attentionClassification';

export const SHOW_REGISTRATION_QUEUES = [
  'needs-review',
  'missing-information',
  'payment-due',
  'all',
] as const;

export type ShowRegistrationQueue = (typeof SHOW_REGISTRATION_QUEUES)[number];

export type ShowRegistrationQueueCounts = Record<ShowRegistrationQueue, number>;

export type ShowRegistrationActionId =
  'resolve-missing-information' | 'review-registration' | 'resolve-payment' | 'view-registration';

export interface ShowRegistrationRecommendedAction {
  id: ShowRegistrationActionId;
  label: string;
  affectedEntryIds: string[];
}

export interface ShowRegistrationGroup extends EnrollmentGroup {
  exhibitorName: string;
  exhibitorEmail: string;
  submittedAt: Date;
  dogCount: number;
  entryCount: number;
  classCount: number;
  attentionReasons: EntryAttentionReason[];
  recommendedAction: ShowRegistrationRecommendedAction;
}

function entryAttentionReasons(entry: EntryManagementEntry): EntryAttentionReason[] {
  return classifyEntryAttention({
    entryStatus: entry.entryStatus,
    rawEntryStatus: entry.rawEntryStatus,
    paymentStatus: entry.paymentStatus,
    enrollmentPaymentStatus: entry.enrollmentPaymentStatus,
  });
}

function getRecommendedAction(entries: EntryManagementEntry[]): ShowRegistrationRecommendedAction {
  const affectedEntryIds = (reason: EntryAttentionReason) =>
    entries.filter(item => entryAttentionReasons(item).includes(reason)).map(item => item.id);
  const missing = affectedEntryIds('missing_information');
  if (missing.length > 0) {
    return {
      id: 'resolve-missing-information',
      label: 'Resolve missing information',
      affectedEntryIds: missing,
    };
  }

  const pending = affectedEntryIds('pending_review');
  if (pending.length > 0) {
    return {
      id: 'review-registration',
      label: 'Review registration',
      affectedEntryIds: pending,
    };
  }

  const payment = affectedEntryIds('payment_due');
  if (payment.length > 0) {
    return {
      id: 'resolve-payment',
      label: 'Resolve payment',
      affectedEntryIds: payment,
    };
  }

  return {
    id: 'view-registration',
    label: 'View registration',
    affectedEntryIds: entries.map(item => item.id),
  };
}

export function groupEntriesByShowRegistration(
  entries: EntryManagementEntry[]
): ShowRegistrationGroup[] {
  return groupEntriesByEnrollment(entries).map(group => {
    const firstEntry = group.entries[0];
    const submittedAt = group.entries.reduce(
      (oldest, item) => (item.submittedAt < oldest ? item.submittedAt : oldest),
      firstEntry?.submittedAt ?? new Date(0)
    );
    const attentionReasons = [
      ...new Set(group.entries.flatMap(item => entryAttentionReasons(item))),
    ];

    return {
      ...group,
      exhibitorName: firstEntry?.ownerName ?? 'Unknown exhibitor',
      exhibitorEmail: firstEntry?.ownerEmail ?? '',
      submittedAt,
      dogCount: new Set(group.entries.map(item => item.dogId)).size,
      entryCount: group.entries.length,
      classCount: group.entries.reduce((total, item) => total + item.classes.length, 0),
      attentionReasons,
      recommendedAction: getRecommendedAction(group.entries),
    };
  });
}

function groupMatchesQueue(group: ShowRegistrationGroup, queue: ShowRegistrationQueue): boolean {
  if (queue === 'all') return true;
  if (queue === 'needs-review') return group.attentionReasons.includes('pending_review');
  if (queue === 'missing-information') {
    return group.attentionReasons.includes('missing_information');
  }
  return group.attentionReasons.includes('payment_due');
}

export function selectShowRegistrationQueue(
  groups: ShowRegistrationGroup[],
  queue: ShowRegistrationQueue
): ShowRegistrationGroup[] {
  return groups
    .filter(group => groupMatchesQueue(group, queue))
    .sort((left, right) => left.submittedAt.getTime() - right.submittedAt.getTime());
}

export function getShowRegistrationQueueCounts(
  groups: ShowRegistrationGroup[]
): ShowRegistrationQueueCounts {
  return {
    'needs-review': groups.filter(group => groupMatchesQueue(group, 'needs-review')).length,
    'missing-information': groups.filter(group => groupMatchesQueue(group, 'missing-information'))
      .length,
    'payment-due': groups.filter(group => groupMatchesQueue(group, 'payment-due')).length,
    all: groups.length,
  };
}

export interface ShowRegistrationPage {
  items: ShowRegistrationGroup[];
  total: number;
  pageIndex: number;
  pageCount: number;
  rangeStart: number;
  rangeEnd: number;
}

export interface ShowRegistrationSearchResult {
  group: ShowRegistrationGroup;
  matchingEntryIds: string[];
}

export interface BuildShowRegistrationPageOptions {
  queue: ShowRegistrationQueue;
  search?: string;
  classId?: string | null;
  trialClassIds?: readonly string[];
  pageIndex: number;
  pageSize?: number;
}

export interface BuiltShowRegistrationPage {
  page: ShowRegistrationPage;
  effectiveGroups: ShowRegistrationGroup[];
  matchingEntryIdsByGroup: Map<string, string[]>;
}

function normalizeSearchValue(value: string | null | undefined): string {
  return value?.trim().toLocaleLowerCase() ?? '';
}

function getEntrySearchDocument(group: ShowRegistrationGroup, entry: EntryManagementEntry): string {
  return normalizeSearchValue(
    [
      group.exhibitorName,
      group.exhibitorEmail,
      group.confirmationNumber,
      entry.confirmationNumber,
      entry.dogName,
      entry.handlerName,
      entry.armbandNumber,
      entry.entryNumber,
      ...entry.classes.flatMap(entryClass => [entryClass.name, entryClass.number]),
    ]
      .filter(Boolean)
      .join(' ')
  );
}

export function searchShowRegistrationGroups(
  groups: ShowRegistrationGroup[],
  query: string
): ShowRegistrationSearchResult[] {
  const tokens = normalizeSearchValue(query).split(/\s+/).filter(Boolean);

  return groups.flatMap(group => {
    const matchingEntryIds = group.entries
      .filter(entry => {
        const document = getEntrySearchDocument(group, entry);
        return tokens.every(token => document.includes(token));
      })
      .map(entry => entry.id);

    return matchingEntryIds.length > 0 ? [{ group, matchingEntryIds }] : [];
  });
}

function entryClassId(entryClass: EntryManagementEntry['classes'][number]): string {
  return entryClass.classId ?? entryClass.id;
}

function scopeShowRegistrationGroups(
  groups: ShowRegistrationGroup[],
  classId: string | null | undefined,
  trialClassIds: readonly string[] | undefined
): ShowRegistrationGroup[] {
  if (classId) {
    return groups.filter(group =>
      group.entries.some(entry =>
        entry.classes.some(entryClass => entryClassId(entryClass) === classId)
      )
    );
  }
  if (trialClassIds && trialClassIds.length > 0) {
    const trialIds = new Set(trialClassIds);
    return groups.filter(group =>
      group.entries.some(entry =>
        entry.classes.some(entryClass => trialIds.has(entryClassId(entryClass)))
      )
    );
  }
  return groups;
}

export function buildShowRegistrationPage(
  groups: ShowRegistrationGroup[],
  options: BuildShowRegistrationPageOptions
): BuiltShowRegistrationPage {
  const matchingEntryIdsByGroup = new Map<string, string[]>();
  const search = options.search?.trim() ?? '';
  let effectiveGroups: ShowRegistrationGroup[];

  if (search) {
    const searchResults = searchShowRegistrationGroups(groups, search);
    searchResults.forEach(result => {
      matchingEntryIdsByGroup.set(result.group.groupKey, result.matchingEntryIds);
    });
    effectiveGroups = searchResults
      .map(result => result.group)
      .sort((left, right) => left.submittedAt.getTime() - right.submittedAt.getTime());
  } else {
    const scopedGroups = scopeShowRegistrationGroups(
      groups,
      options.classId,
      options.trialClassIds
    );
    effectiveGroups = selectShowRegistrationQueue(scopedGroups, options.queue);
  }

  return {
    page: paginateShowRegistrations(effectiveGroups, options.pageIndex, options.pageSize ?? 50),
    effectiveGroups,
    matchingEntryIdsByGroup,
  };
}

export function paginateShowRegistrations(
  groups: ShowRegistrationGroup[],
  requestedPageIndex: number,
  pageSize = 50
): ShowRegistrationPage {
  const safePageSize = Math.max(1, pageSize);
  const pageCount = Math.max(1, Math.ceil(groups.length / safePageSize));
  const pageIndex = Math.min(Math.max(0, requestedPageIndex), pageCount - 1);
  const startIndex = pageIndex * safePageSize;
  const items = groups.slice(startIndex, startIndex + safePageSize);

  return {
    items,
    total: groups.length,
    pageIndex,
    pageCount,
    rangeStart: items.length > 0 ? startIndex + 1 : 0,
    rangeEnd: startIndex + items.length,
  };
}

export function getEntryRegistrationRowId(groupKey: string): string {
  return `entry-registration-${encodeURIComponent(groupKey)}`;
}
