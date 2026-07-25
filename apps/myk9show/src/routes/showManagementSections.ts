export const SHOW_MANAGEMENT_SECTIONS = [
  { label: 'Setup', path: 'setup' },
  { label: 'Show Desk', path: 'show-desk' },
  { label: 'Entry Management', path: 'entry-management' },
  { label: 'Reports', path: 'reports' },
  { label: 'Results & Check-In', path: 'results-control' },
  { label: 'Submit Results', path: 'submit-results' },
] as const;

export type ShowManagementSectionPath = (typeof SHOW_MANAGEMENT_SECTIONS)[number]['path'];

/**
 * Setup remains in the route registry for compatibility, but its information
 * now lives on the primary Overview and it is no longer a peer workflow.
 */
export const SHOW_MANAGEMENT_NAV_SECTIONS = SHOW_MANAGEMENT_SECTIONS.filter(
  section => section.path !== 'setup'
);
