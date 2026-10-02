/**
 * Adapt a record-page trail (`useBreadcrumb`, `buildRecordBreadcrumb`) to the
 * `PageHeader` breadcrumb shape. Those trails leave the current page without an
 * href; `PageHeader` wants one on every item (it renders the last as plain
 * text), so the current page is given the path it is on.
 */
export interface TrailItem {
  label: string;
  href?: string | undefined;
}

export function toPageHeaderCrumbs(
  items: readonly TrailItem[],
  currentHref: string
): Array<{ label: string; href: string }> {
  return items.map(item => ({ label: item.label, href: item.href ?? currentHref }));
}
