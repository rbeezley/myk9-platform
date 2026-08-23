/**
 * Pure serialization helpers behind `useUrlFilters`.
 *
 * Kept in a sibling module so the hook file stays about scheduling, and so the
 * URL <-> state contract can be tested without a router.
 */

/**
 * Browse-page filter state is always a flat object whose every value is a
 * string (see `DogFilters`, `ShowFilters`, …). Expressed as a self-referential
 * mapped constraint rather than `Record<string, string>` so the existing
 * *interfaces* satisfy it — an interface has no implicit index signature.
 */
export type StringValued<T> = { [K in keyof T]: string };

/**
 * Read filter values out of a query string.
 *
 * A key that is absent — or present but empty — falls back to its default, so
 * `?breed=` never leaves the page in a state no chip can represent.
 */
export function parseUrlFilters<T extends StringValued<T>>(
  params: URLSearchParams,
  defaults: T
): T {
  const values = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof T & string)[]) {
    const raw = params.get(key);
    if (raw !== null && raw !== '') {
      values[key] = raw as T[keyof T & string];
    }
  }
  return values;
}

/**
 * Fold filter values into a query string, returning a NEW `URLSearchParams`.
 *
 * Only keys present in `defaults` are touched — every unrelated param
 * (`?add=true`, `?tab=`, `?view=`) survives untouched. A value equal to its
 * default is deleted rather than written, so a cleared filter leaves no trace
 * and a shared URL only carries what the user actually changed.
 */
export function applyUrlFilters<T extends StringValued<T>>(
  params: URLSearchParams,
  values: T,
  defaults: T
): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of Object.keys(defaults) as (keyof T & string)[]) {
    if (values[key] === defaults[key]) {
      next.delete(key);
    } else {
      next.set(key, values[key]);
    }
  }
  return next;
}

/** The filter keys whose values differ between two states. */
export function changedFilterKeys<T extends StringValued<T>>(
  a: T,
  b: T,
  defaults: T
): (keyof T & string)[] {
  return (Object.keys(defaults) as (keyof T & string)[]).filter(key => a[key] !== b[key]);
}
