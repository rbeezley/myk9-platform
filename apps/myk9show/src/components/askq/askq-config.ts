export interface ExampleQuery {
  text: string;
  category: 'rules' | 'show-data' | 'app-help';
}

export type AskQPanelMode = ExampleQuery['category'] | 'operator-support';

export interface RulebookScopeOption {
  label: string;
  organizationCode: string;
  sportCode: string;
}

export const EXAMPLE_QUERIES: ExampleQuery[] = [
  { text: 'What are the AKC time limits for Excellent Containers?', category: 'rules' },
  { text: 'What are the UKC rules for Excellent Containers?', category: 'rules' },
  { text: 'How did my dog do today?', category: 'show-data' },
  { text: 'Show me the trial schedule', category: 'show-data' },
  { text: 'What classes are running right now?', category: 'show-data' },
  { text: 'How many dogs qualified in Buried?', category: 'show-data' },
  { text: 'How do I add a mail-in entry?', category: 'app-help' },
  { text: 'Where do I find my armband number?', category: 'app-help' },
  { text: 'I need help with a payment or refund', category: 'app-help' },
];

export const CATEGORY_LABELS: Record<ExampleQuery['category'], string> = {
  rules: 'Rules',
  'show-data': 'Show Data',
  'app-help': 'App Help',
};

export const QUESTION_MODE_LABELS: Record<AskQPanelMode, string> = {
  'app-help': 'App help',
  rules: 'Rules',
  'show-data': 'This show',
  'operator-support': 'Operator Support',
};

export const RULEBOOK_SCOPE_OPTIONS: RulebookScopeOption[] = [
  { label: 'AKC Scent Work', organizationCode: 'AKC', sportCode: 'akc-scent-work' },
  { label: 'UKC Nose Work', organizationCode: 'UKC', sportCode: 'ukc-nosework' },
  { label: 'ASCA Scent Detection', organizationCode: 'ASCA', sportCode: 'asca-scent-detection' },
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
  summarize_operator_alerts: 'Operator alerts',
};

export const SOURCE_LABELS: Record<string, string> = {
  rules: 'Rules',
  classes: 'Classes',
  entries: 'Entries',
  trials: 'Trials',
  guide: 'Guide',
};
