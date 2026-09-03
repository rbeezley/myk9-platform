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
