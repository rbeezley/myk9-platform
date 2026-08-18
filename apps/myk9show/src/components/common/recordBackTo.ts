/**
 * Where a record page came from, carried in router state.
 *
 * A person, dog or show record is reachable from several lists. The breadcrumb
 * should name the one the user actually walked in through — and link back to it
 * with its filters intact — instead of always claiming the canonical parent.
 * See docs/plan-ia-admin-person-detail.md Phase B: a site admin entering
 * `/people/:id` from `/admin/users` was told they were browsing People, with no
 * way back into /admin.
 *
 * Router state, not a query param: this is navigation context, not part of the
 * record's address. It must not travel when the URL is copied or shared.
 */

export interface RecordBackTo {
  /** In-app path to return to, query string included. */
  href: string;
  /** What that destination is called in the breadcrumb. */
  label: string;
  /** Optional grandparent, e.g. `Admin` above `Users`. */
  parent?: { label: string; href: string };
}

export interface BreadcrumbTrailItem {
  label: string;
  href?: string;
  isCurrentPage?: boolean;
}

/** In-app absolute paths only — never protocol-relative, never off-site. */
function isInternalHref(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//');
}

function isLabel(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validate router state into a `RecordBackTo`, or null.
 *
 * Anything unrecognised yields null and the caller falls back to the canonical
 * trail — a stale or hand-crafted history entry must not be able to point the
 * breadcrumb somewhere it shouldn't go.
 */
export function readRecordBackTo(state: unknown): RecordBackTo | null {
  if (!state || typeof state !== 'object') return null;
  const candidate = (state as { backTo?: unknown }).backTo;
  if (!candidate || typeof candidate !== 'object') return null;

  const { href, label, parent } = candidate as Record<string, unknown>;
  if (!isInternalHref(href) || !isLabel(label)) return null;

  const backTo: RecordBackTo = { href, label };

  if (parent && typeof parent === 'object') {
    const { label: parentLabel, href: parentHref } = parent as Record<string, unknown>;
    if (isLabel(parentLabel) && isInternalHref(parentHref)) {
      backTo.parent = { label: parentLabel, href: parentHref };
    }
  }

  return backTo;
}

/**
 * The trail for a record page: the origin the user came from when there is one,
 * the record's canonical parent otherwise.
 */
export function buildRecordBreadcrumb(
  backTo: RecordBackTo | null,
  canonicalParent: { label: string; href: string },
  currentLabel: string
): BreadcrumbTrailItem[] {
  const current: BreadcrumbTrailItem = { label: currentLabel, isCurrentPage: true };
  if (!backTo) return [canonicalParent, current];

  return [
    ...(backTo.parent ? [backTo.parent] : []),
    { label: backTo.label, href: backTo.href },
    current,
  ];
}
