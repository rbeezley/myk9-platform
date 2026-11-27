/**
 * One shape for a breadcrumb, wherever it is built (MYK9-2489).
 *
 * The rule the type carries: a crumb is either the page you are on, or an ancestor that goes
 * somewhere. An ancestor with no destination does not compile, so a page cannot forget one.
 * Before this, a crumb's `href` was optional everywhere: a missing one rendered as dead text
 * (the Add entry wizard's "Shows") or was quietly given the current page's own path.
 */

/** The page you are on. It renders as text, so it needs no destination. */
export interface CurrentCrumb {
  label: string;
  isCurrentPage: true;
  href?: string | undefined;
  id?: string | undefined;
}

/** Every other crumb: a page above this one, which must be reachable from here. */
export interface AncestorCrumb {
  label: string;
  href: string;
  isCurrentPage?: false | undefined;
  /** Runs before the link is followed; the link still navigates. */
  onClick?: (() => void) | undefined;
  id?: string | undefined;
}

export type Crumb = CurrentCrumb | AncestorCrumb;

/** A crumb at one level of a trail: the current page when `isCurrent`, a link otherwise. */
export function crumbFor(label: string, href: string, isCurrent: boolean, id?: string): Crumb {
  return isCurrent
    ? { label, isCurrentPage: true, ...(id !== undefined && { id }) }
    : { label, href, ...(id !== undefined && { id }) };
}
