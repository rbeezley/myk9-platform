# Sidebar Account Footer Plan

## Scope

Consolidate authenticated identity and account access into one sidebar-footer control on desktop while preserving the header account trigger on mobile and on the sidebar-free onboarding route.

This does not duplicate an existing page or workflow. It reuses the existing account dropdown and removes the separate sidebar name and access-level surfaces.

## Implementation

1. Add a shared account-menu trigger that supports compact header and expanded/collapsed sidebar presentations.
2. Replace the sidebar name header and static role footer with one account control showing the user's first name and primary role.
3. Keep notifications, theme, and desktop AskQ controls in the header; make the header account trigger mobile-only except on onboarding.
4. Use the canonical role hierarchy and labels, summarizing additional roles as `+N`.

## Testing

1. Add focused sidebar tests for the combined identity control, collapsed accessible name, and removal of redundant identity surfaces.
2. Add focused header tests for responsive account-trigger visibility and onboarding access.
3. Run focused Vitest suites, app-local typecheck, lint for touched files, and a final code review.
