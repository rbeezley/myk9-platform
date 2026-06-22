import type { FilterDefinition } from '@/components/common/FilterChips';
import type { ViewMode } from '@/components/common/ViewToggle';
import { PaymentStatus } from '@/types/show-registration-types';

export const ENTRY_ATTENTION_FILTER_VALUES = [
  'all',
  'pending',
  'accepted',
  'waitlist',
  'issues',
] as const;

export type EntryAttentionFilter = (typeof ENTRY_ATTENTION_FILTER_VALUES)[number];

/**
 * Exception queues — move-up requests and pulls/no-shows. These are NOT entry
 * status filters: each swaps the whole content pane for a dedicated management
 * sub-app (`MoveUpRequestsTab` / `PullManagementTab`). They live on their own
 * top-level "Exceptions" tab (Phase C), reached via `?tab=exceptions&queue=…`,
 * NOT as `attention` chips — a surface-swap disguised as a status filter was the
 * core cognitive-load defect this page is being remediated for.
 */
export const EXCEPTION_QUEUE_VALUES = ['move-ups', 'pulled'] as const;
export type ExceptionQueue = (typeof EXCEPTION_QUEUE_VALUES)[number];

export function isExceptionQueue(value: string | null): value is ExceptionQueue {
  return EXCEPTION_QUEUE_VALUES.includes(value as ExceptionQueue);
}

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

/**
 * Filters surfaced through the shared `ListControls` / `FilterChips` on the
 * Entry Management page.
 *
 * INTENT: `attention` is the SINGLE source of entry-status filtering. Do not add
 * a second status-based filter key here — two status controls let the user set
 * contradictory state (e.g. attention="pending" + a second filter="accepted" =
 * always 0 rows). Status is filtered exclusively by the `attention` chip; the
 * only other structured filter is `payment`. Search (handled separately by
 * `ListControls`) is the primary triage tool and shares the same chrome as
 * Browse Shows / Dogs / People so the secretary sees one search affordance
 * app-wide. (Migrated from the now-deleted `EntryFiltersCard` guard.)
 */
export const ENTRY_MANAGEMENT_FILTERS: FilterDefinition[] = [
  {
    key: 'attention',
    label: 'Attention',
    options: [
      { label: 'All entries', value: 'all' },
      { label: 'Pending review', value: 'pending' },
      { label: 'Accepted', value: 'accepted' },
      { label: 'Waitlist', value: 'waitlist' },
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
    default:
      return null;
  }
}

/**
 * Detect a legacy URL that pointed at move-ups / pulled while they were still
 * `attention` chips (`?attention=move-ups|pulled`) or even older `entryTab`
 * values (`move-ups` / `scratches`). Phase C moved both onto the Exceptions tab,
 * so these now migrate to `?tab=exceptions&queue=…` (see normalize below).
 */
function legacyExceptionQueue(
  rawAttention: string | null,
  rawEntryTab: string | null
): ExceptionQueue | null {
  if (rawAttention === 'move-ups' || rawEntryTab === 'move-ups') return 'move-ups';
  if (rawAttention === 'pulled' || rawEntryTab === 'scratches') return 'pulled';
  return null;
}

export function normalizeEntryManagementSearchParams(searchParams: URLSearchParams): {
  params: URLSearchParams;
  attention: EntryAttentionFilter;
  mode: EntryWorkMode;
  view: EntryManagementViewMode;
} {
  const params = new URLSearchParams(searchParams);
  const rawEntryTab = params.get('entryTab');
  const rawAttention = params.get('attention');
  const exceptionQueue = legacyExceptionQueue(rawAttention, rawEntryTab);
  const legacyAttention = legacyEntryTabToAttention(rawEntryTab);
  // A legacy exceptions link resolves to attention 'all' on the (now separate)
  // Entries tab; the queue selection rides on `tab`/`queue` instead.
  const attention = exceptionQueue
    ? 'all'
    : (legacyAttention ?? (isEntryAttentionFilter(rawAttention) ? rawAttention : 'all'));
  const rawMode = params.get('mode');
  const mode = isEntryWorkMode(rawMode) ? rawMode : 'review';
  const rawView = params.get('view');
  const view = isEntryManagementViewMode(rawView) ? rawView : 'table';

  params.delete('entryTab');

  if (exceptionQueue) {
    // Migrate the stale bookmark onto the Exceptions tab. `move-ups` is the
    // default queue, so it stays out of the URL; `pulled` is explicit.
    params.set('tab', 'exceptions');
    if (exceptionQueue === 'pulled') params.set('queue', 'pulled');
    else params.delete('queue');
    params.delete('attention');
    params.delete('trial');
    params.delete('class');
  } else if (attention === 'all') {
    params.delete('attention');
  } else {
    params.set('attention', attention);
  }

  if (mode === 'review') params.delete('mode');
  else params.set('mode', mode);

  if (view === 'table') params.delete('view');
  else params.set('view', view);

  // Invariant: the Roster view is trial-scoped. An orphaned `roster` (e.g. left
  // behind when the trial was cleared on another tab) would otherwise make the
  // next trial selection jump straight into Roster without the explicit toggle.
  if (!params.get('trial')) params.delete('roster');

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
    case 'issues':
      return 'No entries have issues right now.';
    case 'all':
      return 'No entries yet.';
  }
}
