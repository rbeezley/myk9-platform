import type { Crumb } from './breadcrumbCrumb';

/**
 * Adapt a record-page trail (`useBreadcrumb`, `buildRecordBreadcrumb`) to the
 * `PageHeader` breadcrumb shape. `PageHeader` wants an href on every item (it
 * renders the last as plain text), so the current page is given the path it is on.
 *
 * Only the current page may lack a destination: `Crumb` requires one on every
 * ancestor (MYK9-2489). This used to hand ANY crumb without an href the current
 * path, so a forgotten ancestor link silently pointed at the page you were on.
 */
export type TrailItem = Crumb;

export function toPageHeaderCrumbs(
  items: readonly TrailItem[],
  currentHref: string
): Array<{ label: string; href: string }> {
  return items.map(item => ({
    label: item.label,
    href: item.isCurrentPage ? (item.href ?? currentHref) : item.href,
  }));
}
