export const SHOW_MANAGEMENT_SECTIONS = [
  { label: 'Setup', path: 'setup' },
  { label: 'Show Desk', path: 'show-desk' },
  { label: 'Entry Management', path: 'entry-management' },
  { label: 'Reports', path: 'reports' },
  { label: 'Results Control', path: 'results-control' },
  { label: 'Submit Results', path: 'submit-results' },
] as const;

export type ShowManagementSectionPath = (typeof SHOW_MANAGEMENT_SECTIONS)[number]['path'];
