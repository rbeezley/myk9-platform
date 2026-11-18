/**
 * MYK9-2044: a show that crosses the 2027 AKC rate change, one trial on each side of New Year.
 * Dependency-free so the premium's edge tests and the app's Trial Secretary Report tests read the
 * very same dates: the premium states both rates and the report bills each trial at its own.
 */
export const NEW_YEAR_SHOW_TRIAL_DATES = ['2026-12-31', '2027-01-01'] as const;
