/**
 * The combined A/B card's name, also the combined entry-list header title.
 * Dependency-free so the app can import it through `@myk9/ringside/run-queue`
 * without pulling the ringside UI barrel into the entry chunk.
 */
export function buildCombinedClassName(element: string, level: string): string {
  return `${element} ${level} A & B`;
}
