/**
 * The only place the entry-blank download path imports `@react-pdf/renderer`
 * (yoga, fontkit; ~1.2 MB). Dynamic on purpose: call it at the user's action
 * (click, or hover/focus intent), never at module scope. The bundle budget
 * check fails the build when a page chunk imports the renderer chunk statically.
 */
export function loadReactPdf(): Promise<typeof import('@react-pdf/renderer')> {
  return import('@react-pdf/renderer');
}
