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
 * Per-key allow-lists, for filter keys with a fixed vocabulary.
 *
 * Only list a key whose values are a closed set defined in code (a discipline,
 * an entry status). Keys whose values come from the data — a breed name, a club
 * id, free-text search — must be left out; there is no static list to check
 * them against, and inventing one would silently drop legitimate values.
 */
export type UrlFilterAllowedValues<T> = Partial<Record<keyof T & string, readonly string[]>>;

/**
 * Read filter values out of a query string.
 *
 * A key that is absent — present but empty, or carrying a value outside its
 * allow-list — falls back to its default. Without the allow-list check a
 * hand-edited `?dateRange=garbage` reads as "some filter is active" while
 * matching none of the date branches, so the date filter is skipped entirely
 * and past shows leak onto the default view.
 */
export function parseUrlFilters<T extends StringValued<T>>(
  params: URLSearchParams,
  defaults: T,
  allowedValues?: UrlFilterAllowedValues<T>
): T {
  const values = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof T & string)[]) {
    const raw = params.get(key);
    if (raw === null || raw === '') continue;
    const allowed = allowedValues?.[key];
    if (allowed && raw !== defaults[key] && !allowed.includes(raw)) continue;
    values[key] = raw as T[keyof T & string];
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

/** Whether every filter key already sits at its default. */
export function isDefaultFilterState<T extends StringValued<T>>(values: T, defaults: T): boolean {
  return (Object.keys(defaults) as (keyof T & string)[]).every(
    key => values[key] === defaults[key]
  );
}

/**
 * Whether the query string carries a filter param that `applyUrlFilters` would
 * drop — one holding its own default (`?breed=all`), an empty value (`?search=`),
 * or a value its allow-list rejects.
 *
 * Such a param never round-trips through a normal write: it parses to the
 * default, so changing that filter produces no diff and the stale param sits in
 * the URL forever, making shared links noisier than they should be.
 */
export function hasRedundantFilterParams<T extends StringValued<T>>(
  params: URLSearchParams,
  defaults: T,
  allowedValues?: UrlFilterAllowedValues<T>
): boolean {
  const parsed = parseUrlFilters(params, defaults, allowedValues);
  return (Object.keys(defaults) as (keyof T & string)[]).some(
    key => params.has(key) && parsed[key] === defaults[key]
  );
}
