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
  const waitlistTab = params.get('tab') === 'waitlist';
  const rawAttention = params.get('attention');
  const attention =
    legacyAttention ??
    (waitlistTab ? 'waitlist' : isEntryAttentionFilter(rawAttention) ? rawAttention : 'all');
  const rawMode = params.get('mode');
  const mode = isEntryWorkMode(rawMode) ? rawMode : 'review';
  const rawView = params.get('view');
  const view = isEntryManagementViewMode(rawView) ? rawView : 'table';

  params.delete('entryTab');
  if (waitlistTab) params.delete('tab');

  if (attention === 'all') params.delete('attention');
  else params.set('attention', attention);

  if (mode === 'review') params.delete('mode');
  else params.set('mode', mode);

  if (view === 'table') params.delete('view');
  else params.set('view', view);

  return { params, attention, mode, view };
}

export function isMoveUpStatus(status: EntryStatus): boolean {
  return status === EntryStatus.MOVE_UP_REQUESTED;
}

export function isPulledStatus(status: EntryStatus): boolean {
  return status === EntryStatus.SCRATCHED || status === EntryStatus.CANCELLED;
}
