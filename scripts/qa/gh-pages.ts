/**
 * Every row of a GitHub REST list, paged by hand with `&per_page=100&page=N`.
 *
 * Not `gh api --paginate`: GitHub's next-page links use `repositories/{id}/…`
 * paths, which the Claude Code cloud session proxy rejects with a 403, so any
 * list past one page failed there (MYK9-1425). A short page ends the list; a
 * list still full after GH_MAX_PAGES throws rather than returning a truncated
 * list as complete.
 *
 * `readRows` runs one `gh api` call and returns that page's rows, so each
 * caller keeps its own error type, its own idea of a missing resource, and its
 * own unwrapping of an object page (`{ artifacts: [...] }`).
 */
export const GH_PAGE_SIZE = 100;
export const GH_MAX_PAGES = 500;

export function ghPages<T>(readRows: (args: string[]) => T[], path: string): T[] {
  const sep = path.includes('?') ? '&' : '?';
  const rows: T[] = [];
  for (let page = 1; page <= GH_MAX_PAGES; page++) {
    const batch = readRows(['api', `${path}${sep}per_page=${GH_PAGE_SIZE}&page=${page}`]);
    rows.push(...batch);
    if (batch.length < GH_PAGE_SIZE) return rows;
  }
  throw new Error(`more than ${GH_MAX_PAGES} pages`);
}
