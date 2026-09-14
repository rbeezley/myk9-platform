/**
 * Pure URL-param model for the Dog Details Overview/Career/Records hierarchy.
 *
 * State lives in two stable search params: `section` and `view`.
 *   - `section` is one of the three top-level concerns (default: overview).
 *   - `view` selects a secondary view within Career or Records; Overview has
 *     no secondary views.
 *
 * Legacy single-`tab` links (the pre-consolidation seven-tab strip) map onto
 * this scheme so bookmarks, copied links, and upgrade-return state remain
 * valid. See openspec/changes/exhibitor-journey-completion/design.md
 * Decision 1 and specs/exhibitor-dog-management/spec.md.
 */

export type DogDetailsSection = 'overview' | 'career' | 'records';
export type CareerView = 'competitions' | 'titles' | 'statistics';
export type RecordsView = 'health' | 'training' | 'pedigree';
export type DogDetailsView = CareerView | RecordsView;

export interface DogDetailsSectionState {
  section: DogDetailsSection;
  /** null on Overview — it has no secondary views. */
  view: DogDetailsView | null;
}

export const DEFAULT_SECTION: DogDetailsSection = 'overview';
export const DEFAULT_CAREER_VIEW: CareerView = 'competitions';
export const DEFAULT_RECORDS_VIEW: RecordsView = 'health';

export const CAREER_VIEWS: readonly CareerView[] = ['competitions', 'titles', 'statistics'];
export const RECORDS_VIEWS: readonly RecordsView[] = ['health', 'training', 'pedigree'];

const SECTIONS: readonly DogDetailsSection[] = ['overview', 'career', 'records'];

function defaultViewFor(section: DogDetailsSection): DogDetailsView | null {
  if (section === 'career') return DEFAULT_CAREER_VIEW;
  if (section === 'records') return DEFAULT_RECORDS_VIEW;
  return null;
}

function isValidViewForSection(section: DogDetailsSection, view: string): view is DogDetailsView {
  if (section === 'career') return (CAREER_VIEWS as readonly string[]).includes(view);
  if (section === 'records') return (RECORDS_VIEWS as readonly string[]).includes(view);
  return false;
}

/**
 * Legacy `tab=` ids (including the current in-app ids and the prose ids used
 * in the delta spec) mapped onto their new section/view home. Every entry
 * here must resolve to a real, reachable secondary view.
 */
export const LEGACY_TAB_TO_SECTION_VIEW: Readonly<Record<string, DogDetailsSectionState>> = {
  registrations: { section: 'overview', view: null },
  activity: { section: 'overview', view: null },
  competitions: { section: 'career', view: 'competitions' },
  'title-progress': { section: 'career', view: 'titles' },
  titles: { section: 'career', view: 'titles' },
  statistics: { section: 'career', view: 'statistics' },
  'health-records': { section: 'records', view: 'health' },
  health: { section: 'records', view: 'health' },
  'training-journal': { section: 'records', view: 'training' },
  training: { section: 'records', view: 'training' },
  pedigree: { section: 'records', view: 'pedigree' },
};

/**
 * Resolves the current Dog Details section/view from URL search params.
 *
 * Precedence: a valid `section`/`view` pair wins; otherwise a legacy `tab`
 * id is mapped; otherwise the default (Overview) applies. Invalid or
 * unrecognized values never throw — they fall back to a valid state so a
 * malformed or stale URL can never strand the page.
 */
export function parseDogDetailsState(searchParams: URLSearchParams): DogDetailsSectionState {
  const rawSection = searchParams.get('section');
  if (rawSection && (SECTIONS as readonly string[]).includes(rawSection)) {
    const section = rawSection as DogDetailsSection;
    const rawView = searchParams.get('view');
    if (rawView && isValidViewForSection(section, rawView)) {
      return { section, view: rawView as DogDetailsView };
    }
    return { section, view: defaultViewFor(section) };
  }

  const legacyTab = searchParams.get('tab');
  if (legacyTab && legacyTab in LEGACY_TAB_TO_SECTION_VIEW) {
    return LEGACY_TAB_TO_SECTION_VIEW[legacyTab];
  }

  return { section: DEFAULT_SECTION, view: null };
}

/**
 * Applies a section/view selection onto existing search params, stripping
 * legacy `tab` and defaulting away param clutter (Overview needs no params
 * at all) so URLs stay short and stable.
 */
export function applyDogDetailsState(
  prev: URLSearchParams,
  next: DogDetailsSectionState
): URLSearchParams {
  const params = new URLSearchParams(prev);
  params.delete('tab');

  if (next.section === DEFAULT_SECTION) {
    params.delete('section');
    params.delete('view');
    return params;
  }

  params.set('section', next.section);

  const fallbackView = defaultViewFor(next.section);
  const view = next.view ?? fallbackView;
  if (view && view !== fallbackView) {
    params.set('view', view);
  } else {
    params.delete('view');
  }

  return params;
}

export function isCareerView(view: DogDetailsView | null): view is CareerView {
  return view !== null && (CAREER_VIEWS as readonly string[]).includes(view);
}

export function isRecordsView(view: DogDetailsView | null): view is RecordsView {
  return view !== null && (RECORDS_VIEWS as readonly string[]).includes(view);
}
