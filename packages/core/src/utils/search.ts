/**
 * Search and filter utilities for case-insensitive string matching
 */

/**
 * Performs a case-insensitive search within a string.
 *
 * @example
 * ```typescript
 * matchesSearch('Hello World', 'hello') // true
 * matchesSearch('Hello World', 'WORLD') // true
 * matchesSearch('Hello World', 'foo')   // false
 * ```
 */
export function matchesSearch(text: string | null | undefined, searchTerm: string): boolean {
  if (!text) return false;
  if (!searchTerm) return true;
  return text.toLowerCase().includes(searchTerm.toLowerCase());
}

/**
 * Checks if any of the provided values match the search term (case-insensitive).
 *
 * @example
 * ```typescript
 * matchesAny(['John', 'Doe', 'john@example.com'], 'john') // true
 * matchesAny(['Hello', 'World'], 'foo') // false
 * ```
 */
export function matchesAny(values: (string | null | undefined)[], searchTerm: string): boolean {
  if (!searchTerm) return true;
  const normalizedTerm = searchTerm.toLowerCase();
  return values.some(value => value?.toLowerCase().includes(normalizedTerm));
}

/**
 * Creates a filter predicate for case-insensitive search on an object's fields.
 *
 * @example
 * ```typescript
 * const dogs = [
 *   { name: 'Buddy', breed: 'Golden Retriever' },
 *   { name: 'Max', breed: 'German Shepherd' },
 * ];
 *
 * // Filter by name or breed
 * const filtered = dogs.filter(
 *   createSearchFilter('retriever', ['name', 'breed'])
 * );
 * // Returns: [{ name: 'Buddy', breed: 'Golden Retriever' }]
 * ```
 */
export function createSearchFilter<T extends Record<string, unknown>>(
  searchTerm: string,
  fields: (keyof T)[]
): (item: T) => boolean {
  if (!searchTerm) return () => true;

  const normalizedTerm = searchTerm.toLowerCase();

  return (item: T) => {
    return fields.some(field => {
      const value = item[field];
      if (typeof value === 'string') {
        return value.toLowerCase().includes(normalizedTerm);
      }
      if (value != null) {
        return String(value).toLowerCase().includes(normalizedTerm);
      }
      return false;
    });
  };
}

/**
 * Filters an array of items by a search term across specified fields.
 *
 * @example
 * ```typescript
 * const users = [
 *   { firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
 *   { firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' },
 * ];
 *
 * filterBySearchTerm(users, 'john', ['firstName', 'lastName', 'email']);
 * // Returns: [{ firstName: 'John', ... }]
 * ```
 */
export function filterBySearchTerm<T extends Record<string, unknown>>(
  items: T[],
  searchTerm: string,
  fields: (keyof T)[]
): T[] {
  if (!searchTerm) return items;
  return items.filter(createSearchFilter(searchTerm, fields));
}

/**
 * Normalizes a search term by trimming whitespace and converting to lowercase.
 *
 * @example
 * ```typescript
 * normalizeSearchTerm('  Hello World  ') // 'hello world'
 * normalizeSearchTerm('') // ''
 * normalizeSearchTerm(null) // ''
 * ```
 */
export function normalizeSearchTerm(term: string | null | undefined): string {
  if (!term) return '';
  return term.trim().toLowerCase();
}

/**
 * Creates a debounced search callback that only triggers after the user stops typing.
 *
 * @example
 * ```typescript
 * const [searchTerm, setSearchTerm] = useState('');
 * const debouncedSearch = useMemo(
 *   () => createDebouncedSearch((term) => {
 *     // Perform search
 *     fetchResults(term);
 *   }, 300),
 *   []
 * );
 *
 * // In onChange handler:
 * debouncedSearch(newValue);
 * ```
 */
export function createDebouncedSearch(
  callback: (term: string) => void,
  delayMs: number = 300
): (term: string) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (term: string) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      callback(term);
    }, delayMs);
  };
}
