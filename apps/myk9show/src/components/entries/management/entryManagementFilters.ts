import type { FilterDefinition } from '@/components/common/FilterChips';
import type { ViewMode } from '@/components/common/ViewToggle';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';

export const ENTRY_ATTENTION_FILTER_VALUES = [
  'all',
  'pending',
  'accepted',
  'waitlist',
  'move-ups',
  'pulled',
  'issues',
] as const;

export type EntryAttentionFilter = (typeof ENTRY_ATTENTION_FILTER_VALUES)[number];

export const ENTRY_WORK_MODE_VALUES = ['review', 'day-of'] as const;
export type EntryWorkMode = (typeof ENTRY_WORK_MODE_VALUES)[number];

export const ENTRY_VIEW_MODE_VALUES = ['table', 'cards'] as const;
export type EntryManagementViewMode = (typeof ENTRY_VIEW_MODE_VALUES)[number];

export const ENTRY_VIEW_MODES: readonly ViewMode[] = [
  { key: 'table', label: 'Table', icon: 'table' },
  { key: 'cards', label: 'Cards', icon: 'grid' },
];

export const ENTRY_WORK_MODE_PRESETS: Record<
  EntryWorkMode,
  {
    attention: EntryAttentionFilter;
    payment: 'all';
    view: EntryManagementViewMode;
  }
> = {
  review: {
    attention: 'pending',
    payment: 'all',
    view: 'table',
  },
  'day-of': {
    attention: 'accepted',
    payment: 'all',
    view: 'table',
  },
};

export const ENTRY_MANAGEMENT_FILTERS: FilterDefinition[] = [
  {
    key: 'attention',
    label: 'Attention',
    options: [
      { label: 'All entries', value: 'all' },
      { label: 'Pending review', value: 'pending' },
      { label: 'Accepted', value: 'accepted' },
      { label: 'Waitlist', value: 'waitlist' },
      { label: 'Move-up requested', value: 'move-ups' },
      { label: 'Pulled / no-show', value: 'pulled' },
      { label: 'Issues', value: 'issues' },
    ],
  },
  {
    key: 'payment',
    label: 'Payment',
    options: [
      { label: 'All payments', value: 'all' },
      { label: 'Payment due', value: PaymentStatus.PENDING },
      { label: 'Paid online', value: PaymentStatus.PAID_ONLINE },
      { label: 'Paid by check', value: PaymentStatus.PAID_BY_CHECK },
      { label: 'Refunded', value: PaymentStatus.REFUNDED },
    ],
  },
];

export function isEntryAttentionFilter(value: string | null): value is EntryAttentionFilter {
  return ENTRY_ATTENTION_FILTER_VALUES.includes(value as EntryAttentionFilter);
}

function isEntryWorkMode(value: string | null): value is EntryWorkMode {
  return ENTRY_WORK_MODE_VALUES.includes(value as EntryWorkMode);
}

function isEntryManagementViewMode(value: string | null): value is EntryManagementViewMode {
  return ENTRY_VIEW_MODE_VALUES.includes(value as EntryManagementViewMode);
}

function legacyEntryTabToAttention(value: string | null): EntryAttentionFilter | null {
  switch (value) {
    case 'pending':
    case 'accepted':
    case 'waitlist':
    case 'issues':
      return value;
    case 'move-ups':
      return 'move-ups';
    case 'scratches':
      return 'pulled';
    default:
      return null;
  }
}

export function normalizeEntryManagementSearchParams(searchParams: URLSearchParams): {
  params: URLSearchParams;
  attention: EntryAttentionFilter;
  mode: EntryWorkMode;
  view: EntryManagementViewMode;
} {
  const params = new URLSearchParams(searchParams);
  const legacyAttention = legacyEntryTabToAttention(params.get('entryTab'));
  const rawAttention = params.get('attention');
  const attention =
    legacyAttention ?? (isEntryAttentionFilter(rawAttention) ? rawAttention : 'all');
  const rawMode = params.get('mode');
  const mode = isEntryWorkMode(rawMode) ? rawMode : 'review';
  const rawView = params.get('view');
  const view = isEntryManagementViewMode(rawView) ? rawView : 'table';

  params.delete('entryTab');

  if (attention === 'all') params.delete('attention');
  else params.set('attention', attention);

  if (mode === 'review') params.delete('mode');
  else params.set('mode', mode);

  if (view === 'table') params.delete('view');
  else params.set('view', view);

  return { params, attention, mode, view };
}

export function getEntryManagementEmptyStateMessage({
  attention,
  hasSearch,
  payment,
}: {
  attention: EntryAttentionFilter;
  hasSearch: boolean;
  payment: string;
}): string {
  const hasExtraFilters = hasSearch || payment !== 'all';

  if (hasExtraFilters) {
    switch (attention) {
      case 'pending':
        return 'No pending entries match these filters.';
      case 'accepted':
        return 'No accepted entries match these filters.';
      case 'waitlist':
        return 'No waitlist entries match these filters.';
      case 'move-ups':
        return 'No move-up requests match these filters.';
      case 'pulled':
        return 'No pulled / no-show entries match these filters.';
      case 'issues':
        return 'No issue entries match these filters.';
      case 'all':
        return 'No entries match these filters.';
    }
  }

  switch (attention) {
    case 'pending':
      return 'No pending entries right now.';
    case 'accepted':
      return 'No accepted entries right now.';
    case 'waitlist':
      return 'No waitlist entries right now.';
    case 'move-ups':
      return 'No move-up requests right now.';
    case 'pulled':
      return 'No pulled / no-show entries right now.';
    case 'issues':
      return 'No entries have issues right now.';
    case 'all':
      return 'No entries yet.';
  }
}

export function isMoveUpStatus(status: EntryStatus): boolean {
  return status === EntryStatus.MOVE_UP_REQUESTED;
}

export function isPulledStatus(status: EntryStatus): boolean {
  return status === EntryStatus.SCRATCHED || status === EntryStatus.CANCELLED;
}
