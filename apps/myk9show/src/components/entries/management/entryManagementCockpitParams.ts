import { parseListParam, serializeListParam } from '@/components/list-toolkit';
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
 * Every id the Show: menu (`EntryManagementShowMenu`) can select
 * (MYK9-795): the four registration queues plus the three exception panes.
 * The two id spaces are disjoint, so one `activeId` can describe either.
 */
export type EntryManagementViewId = ShowRegistrationQueue | EntryManagementException;

export interface EntryManagementCockpitState {
  tab: EntryManagementCockpitTab;
  exception: EntryManagementException;
  /**
   * The registration queues shown together, never empty: exactly `['all']`, or one or more of
   * the others in menu order (docs/plan-entries-filter-button.md, settled rule 1).
   */
  queues: ShowRegistrationQueue[];
  search: string;
  trialIds: string[];
  classIds: string[];
  registrationKey: string | null;
}

export interface CockpitNormalizationContext {
  validRegistrationKeys?: ReadonlySet<string>;
  entryToRegistration?: ReadonlyMap<string, string>;
  /** The show's trial ids, only once they have loaded; until then `trial` ids are kept as written. */
  knownTrialIds?: ReadonlySet<string>;
  /** The show's class ids, only once every trial's classes have loaded. */
  knownClassIds?: ReadonlySet<string>;
  /**
   * The selected trials' class ids, only once each of them has loaded. A picked class narrows
   * WITHIN the selected trials (settled rule 12), so one outside them (a stale or hand-edited
   * link) is dropped rather than shown under a trial it does not belong to.
   */
  selectedTrialClassIds?: ReadonlySet<string>;
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

/**
 * Queues in menu order, without repeats or unknown values. All is exclusive and wins over the
 * others, so a hand-edited link never hides anything. Empty when nothing was recognised.
 */
export function canonicalQueues(values: readonly string[]): ShowRegistrationQueue[] {
  const known = SHOW_REGISTRATION_QUEUES.filter(queue => values.includes(queue));
  return known.includes('all') ? ['all'] : known;
}

/**
 * The Show: menu's check on one queue. All clears the others; any other queue clears All; and
 * unchecking the last box shows All, never an empty list.
 */
export function toggleQueueSelection(
  current: readonly ShowRegistrationQueue[],
  queue: ShowRegistrationQueue
): ShowRegistrationQueue[] {
  if (queue === 'all') return ['all'];
  const others = current.filter(value => value !== 'all');
  const next = others.includes(queue)
    ? others.filter(value => value !== queue)
    : [...others, queue];
  const canonical = canonicalQueues(next);
  return canonical.length > 0 ? canonical : ['all'];
}

function getQueues(source: URLSearchParams): ShowRegistrationQueue[] {
  const canonical = canonicalQueues(parseListParam(source.get('queue')));
  if (canonical.length > 0) return canonical;
  if (source.get('payment') === 'pending') return ['payment-due'];

  const legacy = source.get('attention') ?? source.get('entryTab');
  if (legacy === 'missing_information') return ['missing-information'];
  if (legacy === 'all' || legacy === 'accepted' || legacy === 'issues') return ['all'];
  return ['needs-review'];
}

/** The ids in a list param, dropping any the loaded list does not know (kept while unknown). */
function getIds(raw: string | null, known: ReadonlySet<string> | undefined): string[] {
  const ids = parseListParam(raw);
  return known ? ids.filter(id => known.has(id)) : ids;
}

function isDefaultQueues(queues: readonly ShowRegistrationQueue[]): boolean {
  return queues.length === 1 && queues[0] === 'needs-review';
}

function setListParam(params: URLSearchParams, key: string, values: readonly string[]): void {
  const serialized = serializeListParam(values);
  if (serialized) params.set(key, serialized);
  else params.delete(key);
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
  const queues = getQueues(source);
  const rawSearch = source.get('search') ?? source.get('person') ?? '';
  const search = rawSearch.trim() ? rawSearch : '';
  const trialIds =
    tab === 'registrations' ? getIds(source.get('trial'), context.knownTrialIds) : [];
  const classIds =
    tab === 'registrations'
      ? getIds(source.get('class'), context.knownClassIds).filter(
          id =>
            trialIds.length === 0 ||
            !context.selectedTrialClassIds ||
            context.selectedTrialClassIds.has(id)
        )
      : [];
  const registrationKey = tab === 'registrations' ? getRegistrationKey(source, context) : null;
  const params = new URLSearchParams();

  if (tab === 'exceptions') {
    params.set('tab', 'exceptions');
    if (exception !== 'move-ups') params.set('exception', exception);
  } else {
    if (!isDefaultQueues(queues)) setListParam(params, 'queue', queues);
    if (search) params.set('search', search);
    setListParam(params, 'trial', trialIds);
    setListParam(params, 'class', classIds);
    if (registrationKey) params.set('registration', registrationKey);
  }

  return {
    params,
    state: {
      tab,
      exception,
      queues,
      search,
      trialIds,
      classIds,
      registrationKey,
    },
  };
}

export function writeCockpitQueues(
  source: URLSearchParams,
  queues: readonly ShowRegistrationQueue[]
): URLSearchParams {
  const next = new URLSearchParams(source);
  const canonical = canonicalQueues(queues);
  const written = canonical.length > 0 ? canonical : (['all'] as const);
  if (isDefaultQueues(written)) next.delete('queue');
  else setListParam(next, 'queue', written);
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

/**
 * Trials and classes in one write, so a gesture that changes both (picking a trial drops the
 * classes it no longer offers) never races two writes on stale params (settled rule 4). A class
 * without a trial is valid: before a trial is picked, every class in the show is offered.
 */
export function writeCockpitScope(
  source: URLSearchParams,
  trialIds: readonly string[],
  classIds: readonly string[]
): URLSearchParams {
  const next = new URLSearchParams(source);
  setListParam(next, 'trial', trialIds);
  setListParam(next, 'class', classIds);
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
 * Exceptions workspace's dedicated pane. One setter for any single view, so the
 * page never has to know which id space a click landed in.
 */
export function writeCockpitView(
  source: URLSearchParams,
  viewId: EntryManagementViewId
): URLSearchParams {
  if ((ENTRY_MANAGEMENT_EXCEPTIONS as readonly string[]).includes(viewId)) {
    return writeCockpitException(source, viewId as EntryManagementException);
  }
  return writeCockpitQueues(writeCockpitTab(source, 'registrations'), [
    viewId as ShowRegistrationQueue,
  ]);
}
