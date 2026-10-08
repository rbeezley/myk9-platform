import {
  SHOW_REGISTRATION_QUEUES,
  type ShowRegistrationGroup,
  type ShowRegistrationQueue,
} from './showRegistrationProjection';

export const ENTRY_MANAGEMENT_COCKPIT_TABS = ['registrations', 'exceptions'] as const;
export type EntryManagementCockpitTab = (typeof ENTRY_MANAGEMENT_COCKPIT_TABS)[number];

export const ENTRY_MANAGEMENT_EXCEPTIONS = ['move-ups', 'pulls', 'waitlist'] as const;
export type EntryManagementException = (typeof ENTRY_MANAGEMENT_EXCEPTIONS)[number];

/**
 * Every id the unified list-toolkit view row (`ListViewTabs`) can select
 * (MYK9-795): the four registration queues plus the three exception panes.
 * The two id spaces are disjoint, so one `activeId` can describe either.
 */
export type EntryManagementViewId = ShowRegistrationQueue | EntryManagementException;

export interface EntryManagementCockpitState {
  tab: EntryManagementCockpitTab;
  exception: EntryManagementException;
  queue: ShowRegistrationQueue;
  search: string;
  trialId: string | null;
  classId: string | null;
  registrationKey: string | null;
}

/** The view id the current state resolves to — what `ListViewTabs` highlights. */
export function entryManagementViewId(state: EntryManagementCockpitState): EntryManagementViewId {
  return state.tab === 'exceptions' ? state.exception : state.queue;
}

export interface CockpitNormalizationContext {
  validRegistrationKeys?: ReadonlySet<string>;
  entryToRegistration?: ReadonlyMap<string, string>;
}

export function getCockpitNormalizationContext(
  groups: readonly ShowRegistrationGroup[]
): CockpitNormalizationContext {
  const validRegistrationKeys = new Set<string>();
  const entryToRegistration = new Map<string, string>();

  groups.forEach(group => {
    validRegistrationKeys.add(group.groupKey);
    group.entries.forEach(entry => entryToRegistration.set(entry.id, group.groupKey));
  });

  return { validRegistrationKeys, entryToRegistration };
}

function isShowRegistrationQueue(value: string | null): value is ShowRegistrationQueue {
  return SHOW_REGISTRATION_QUEUES.includes(value as ShowRegistrationQueue);
}

function isEntryManagementException(value: string | null): value is EntryManagementException {
  return ENTRY_MANAGEMENT_EXCEPTIONS.includes(value as EntryManagementException);
}

function getLegacyException(source: URLSearchParams): EntryManagementException | null {
  const tab = source.get('tab');
  const attention = source.get('attention');
  const entryTab = source.get('entryTab');
  const oldQueue = source.get('queue');
  const explicit = source.get('exception');

  if (isEntryManagementException(explicit)) return explicit;
  if (tab === 'move-ups' || attention === 'move-ups' || entryTab === 'move-ups') return 'move-ups';
  if (
    tab === 'pulls' ||
    attention === 'pulled' ||
    entryTab === 'scratches' ||
    (tab === 'exceptions' && oldQueue === 'pulled')
  ) {
    return 'pulls';
  }
  if (tab === 'waitlist' || attention === 'waitlist' || entryTab === 'waitlist') return 'waitlist';
  if (tab === 'exceptions') return 'move-ups';
  return null;
}

function getQueue(source: URLSearchParams): ShowRegistrationQueue {
  const canonical = source.get('queue');
  if (isShowRegistrationQueue(canonical)) return canonical;
  if (source.get('payment') === 'pending') return 'payment-due';

  const legacy = source.get('attention') ?? source.get('entryTab');
  if (legacy === 'missing_information') return 'missing-information';
  if (legacy === 'all' || legacy === 'accepted' || legacy === 'issues') return 'all';
  return 'needs-review';
}

function getRegistrationKey(
  source: URLSearchParams,
  context: CockpitNormalizationContext
): string | null {
  const canonical = source.get('registration');
  const legacyEntry = source.get('entry');
  const candidate =
    canonical ?? (legacyEntry ? context.entryToRegistration?.get(legacyEntry) : null);
  if (!candidate) return null;
  if (context.validRegistrationKeys && !context.validRegistrationKeys.has(candidate)) return null;
  return candidate;
}

export function normalizeEntryManagementCockpitParams(
  source: URLSearchParams,
  context: CockpitNormalizationContext = {}
): { params: URLSearchParams; state: EntryManagementCockpitState } {
  const exception = getLegacyException(source) ?? 'move-ups';
  const tab: EntryManagementCockpitTab = getLegacyException(source)
    ? 'exceptions'
    : 'registrations';
  const queue = getQueue(source);
  const rawSearch = source.get('search') ?? source.get('person') ?? '';
  const search = rawSearch.trim() ? rawSearch : '';
  const trialId = tab === 'registrations' ? source.get('trial') : null;
  const classId = tab === 'registrations' ? source.get('class') : null;
  const registrationKey = tab === 'registrations' ? getRegistrationKey(source, context) : null;
  const params = new URLSearchParams();

  if (tab === 'exceptions') {
    params.set('tab', 'exceptions');
    if (exception !== 'move-ups') params.set('exception', exception);
  } else {
    if (queue !== 'needs-review') params.set('queue', queue);
    if (search) params.set('search', search);
    if (trialId) params.set('trial', trialId);
    if (classId) params.set('class', classId);
    if (registrationKey) params.set('registration', registrationKey);
  }

  return {
    params,
    state: {
      tab,
      exception,
      queue,
      search,
      trialId,
      classId,
      registrationKey,
    },
  };
}

export function writeCockpitQueue(
  source: URLSearchParams,
  queue: ShowRegistrationQueue
): URLSearchParams {
  const next = new URLSearchParams(source);
  if (queue === 'needs-review') next.delete('queue');
  else next.set('queue', queue);
  next.delete('registration');
  return next;
}

export function writeCockpitSearch(source: URLSearchParams, search: string): URLSearchParams {
  const next = new URLSearchParams(source);
  if (search.trim()) next.set('search', search);
  else next.delete('search');
  next.delete('registration');
  return next;
}

export function writeCockpitFocus(
  source: URLSearchParams,
  registrationKey: string | null
): URLSearchParams {
  const next = new URLSearchParams(source);
  if (registrationKey) next.set('registration', registrationKey);
  else next.delete('registration');
  return next;
}

export function writeCockpitScope(
  source: URLSearchParams,
  trialId: string | null,
  classId: string | null = null
): URLSearchParams {
  const next = new URLSearchParams(source);
  if (trialId) next.set('trial', trialId);
  else next.delete('trial');
  if (trialId && classId) next.set('class', classId);
  else next.delete('class');
  next.delete('registration');
  return next;
}

export function writeCockpitTab(
  source: URLSearchParams,
  tab: EntryManagementCockpitTab
): URLSearchParams {
  const next = new URLSearchParams(source);
  if (tab === 'registrations') {
    next.delete('tab');
    next.delete('exception');
    return next;
  }

  next.set('tab', 'exceptions');
  next.delete('exception');
  next.delete('queue');
  next.delete('search');
  next.delete('trial');
  next.delete('class');
  next.delete('registration');
  return next;
}

export function writeCockpitException(
  source: URLSearchParams,
  exception: EntryManagementException
): URLSearchParams {
  const next = writeCockpitTab(source, 'exceptions');
  if (exception === 'move-ups') next.delete('exception');
  else next.set('exception', exception);
  return next;
}

/**
 * Selects one of the seven unified views (MYK9-795): the four registration
 * queues route through the Registrations tab, the other three swap in the
 * Exceptions workspace's dedicated pane. One setter for `ListViewTabs`, so the
 * page never has to know which id space a click landed in.
 */
export function writeCockpitView(
  source: URLSearchParams,
  viewId: EntryManagementViewId
): URLSearchParams {
  if ((ENTRY_MANAGEMENT_EXCEPTIONS as readonly string[]).includes(viewId)) {
    return writeCockpitException(source, viewId as EntryManagementException);
  }
  return writeCockpitQueue(
    writeCockpitTab(source, 'registrations'),
    viewId as ShowRegistrationQueue
  );
}

/**
 * The empty-state "Show all forms" step: widen the queue first and keep the
 * trial/class scope and search, so a class with no forms awaiting review shows
 * its own forms rather than the whole show. Only once the queue is already
 * "all" does it drop the scope and search that are still narrowing the list.
 */
export function widenCockpitFilters(
  source: URLSearchParams,
  state: Pick<EntryManagementCockpitState, 'queue'>
): URLSearchParams {
  if (state.queue !== 'all') return writeCockpitView(source, 'all');
  return writeCockpitScope(writeCockpitSearch(source, ''), null, null);
}
