/**
 * Shared app-shell values consumed by the fixed header, sidebar, sticky
 * regions, and page layout primitives. Keep these CSS variable names stable
 * so shell offsets cannot drift between surfaces.
 */
export const APP_SHELL_CSS_VARS = {
  headerHeight: '--app-header-height',
  topInset: '--app-top-inset',
  pageGap: '--app-shell-page-gap',
  pageBottom: '--app-shell-page-bottom',
  pagePadding: '--app-shell-page-padding',
  safeBottom: '--app-shell-safe-bottom',
} as const;

export const APP_SHELL_HEADER_HEIGHT_PX = 48;

export const APP_SHELL_PAGE_CLASS =
  'min-h-screen bg-background pt-[var(--app-shell-page-gap,1.5rem)] pb-[var(--app-shell-page-bottom,2rem)] px-[var(--app-shell-page-padding,1rem)] sm:px-6';
