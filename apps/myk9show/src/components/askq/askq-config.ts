export interface ExampleQuery {
  text: string;
  category: 'rules' | 'show-data' | 'app-help';
}

export interface SecretaryShowDayPrompt {
  label: string;
  prompt: string;
}

export const SECRETARY_SHOW_DAY_PROMPTS: SecretaryShowDayPrompt[] = [
  {
    label: 'Scratch or no-show',
    prompt: 'What should I do if an exhibitor says their dog is a scratch or no-show today?',
  },
  {
    label: 'Move-up request',
    prompt: 'What should I do if an exhibitor asks to move up after entries have closed?',
  },
  {
    label: 'Late entry',
    prompt: 'What should I do if someone walks up and wants to enter on show day?',
  },
  {
    label: 'Ring running behind',
    prompt: 'What should I do if one ring is running behind schedule?',
  },
  {
    label: 'Message handler',
    prompt: 'What should I say to a handler who has not checked in yet?',
  },
  {
    label: 'Submit results',
    prompt: 'What should I check before submitting final results after the show?',
  },
];

export const EXAMPLE_QUERIES: ExampleQuery[] = [
  { text: 'What are the time limits for Excellent?', category: 'rules' },
  { text: 'Ring size requirements for Novice', category: 'rules' },
  { text: 'How did my dog do today?', category: 'show-data' },
  { text: 'Show me the trial schedule', category: 'show-data' },
  { text: 'What classes are running right now?', category: 'show-data' },
  { text: 'How many dogs qualified in Buried?', category: 'show-data' },
  ...SECRETARY_SHOW_DAY_PROMPTS.map(({ prompt }) => ({
    text: prompt,
    category: 'app-help' as const,
  })),
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
