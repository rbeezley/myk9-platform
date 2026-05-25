export interface ExampleQuery {
  text: string;
  category: 'rules' | 'show-data' | 'app-help';
}

export const EXAMPLE_QUERIES: ExampleQuery[] = [
  { text: 'What are the time limits for Excellent?', category: 'rules' },
  { text: 'Ring size requirements for Novice', category: 'rules' },
  { text: 'How did my dog do today?', category: 'show-data' },
  { text: 'Show me the trial schedule', category: 'show-data' },
  { text: 'What classes are running right now?', category: 'show-data' },
  { text: 'How many dogs qualified in Buried?', category: 'show-data' },
];

export const CATEGORY_LABELS: Record<ExampleQuery['category'], string> = {
  rules: 'Rules',
  'show-data': 'Show Data',
  'app-help': 'App Help',
};

export const RATE_LIMIT_DEFAULTS = {
  free: 10,
  premium: 50,
};

export const TOOL_LABELS: Record<string, string> = {
  search_rules: 'Rules',
  get_class_summary: 'Classes',
  get_entry_results: 'Results',
  get_trial_overview: 'Trials',
  search_entries: 'Entries',
  search_user_guide: 'Guide',
};

export const SOURCE_LABELS: Record<string, string> = {
  rules: 'Rules',
  classes: 'Classes',
  entries: 'Entries',
  trials: 'Trials',
  guide: 'Guide',
};
