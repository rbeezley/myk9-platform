/** Exhibitor and spectator suggestions: one set, whatever page the panel opens on. */
export const EXAMPLE_QUERIES: string[] = [
  'What are the AKC time limits for Excellent Containers?',
  'How did my dog do today?',
  'Show me the trial schedule',
  'Where do I find my armband number?',
  'I need help with a payment or refund',
];

/** Secretary, club admin and judge suggestions: how-to questions the secretary guide answers. */
export const STAFF_EXAMPLE_QUERIES: string[] = [
  'How do I add a late entry?',
  'How do I add a mail-in entry?',
  'How do I check dogs in?',
  'How do I refund an entry?',
];

export const RATE_LIMIT_DEFAULTS = {
  free: 10,
  premium: 50,
};

export const TOOL_LABELS: Record<string, string> = {
  get_class_summary: 'Classes',
  get_entry_results: 'Results',
  get_trial_overview: 'Trials',
  search_entries: 'Entries',
};

export const TERA_WORKING_COPY = 'Sniffing that out for you...';
export const TERA_IDLE_COPY = 'Ask a question, or try one of these.';
export const TERA_OFFLINE_COPY = 'AskQ needs a connection. Your show data still works offline.';

export const SOURCE_LABELS: Record<string, string> = {
  rules: 'Rules',
  classes: 'Classes',
  entries: 'Entries',
  trials: 'Trials',
  guide: 'Guide',
};
