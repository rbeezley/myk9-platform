import {
  BookOpen,
  LayoutGrid,
  Users,
  Calendar,
  MessageSquare,
} from 'lucide-react';
import type { ChatSources, PopularQuestion } from '../../services/chatbotService';

export type SourceType = 'rules' | 'classes' | 'entries' | 'trials';

export function parseOrgAndSport(orgString: string): { organizationCode: string; sportCode: string } {
  const parts = orgString.trim().split(/\s+/);
  const organizationCode = parts[0] || 'AKC';
  const sportName = parts.slice(1).join(' ').toLowerCase();

  const sportCodeMap: Record<string, string> = {
    'scent work': 'scent-work',
    'nosework': 'nosework',
    'scent detection': 'SD',
    'obedience': 'obedience',
    'rally': 'rally',
    'fast cat': 'fast-cat',
  };

  const sportCode = sportCodeMap[sportName] || 'scent-work';
  return { organizationCode, sportCode };
}

export function getSourceIcon(sourceType: SourceType) {
  switch (sourceType) {
    case 'rules': return BookOpen;
    case 'classes': return LayoutGrid;
    case 'entries': return Users;
    case 'trials': return Calendar;
    default: return MessageSquare;
  }
}

export function getSourceLabel(sourceType: SourceType): string {
  switch (sourceType) {
    case 'rules': return 'Rules';
    case 'classes': return 'Classes';
    case 'entries': return 'Entries';
    case 'trials': return 'Trials';
    default: return sourceType;
  }
}

export function getSourceCount(sources: ChatSources, sourceType: SourceType): number {
  const data = sources[sourceType];
  return Array.isArray(data) ? data.length : 0;
}

export const FALLBACK_QUERIES = {
  rules: [
    'Time limit Master Interior',
    'Handler touches dog penalty',
    'What qualifies as a false alert?',
  ],
  showData: [
    'Who got 1st place Saturday',
    'How many dogs qualified today',
    'Show me Exterior results',
  ],
};

const RULES_KEYWORDS = [
  'time limit', 'penalty', 'false alert', 'handler', 'regulation', 'rule',
  'leash', 'fault', 'nq', 'disqualif', 'allowed', 'prohibited', 'requirements',
  'maximum', 'minimum', 'seconds', 'minutes', 'area', 'hide', 'alert',
];

const SHOW_DATA_KEYWORDS = [
  'who', 'how many', 'results', 'place', '1st', '2nd', '3rd', 'first', 'second',
  'third', 'qualified', 'score', 'today', 'saturday', 'sunday', 'friday',
  'yesterday', 'class', 'entries', 'dogs', 'running', 'completed',
];

export function categorizeQuestion(query: string): 'rules' | 'showData' {
  const lowerQuery = query.toLowerCase();

  const rulesScore = RULES_KEYWORDS.filter(kw => lowerQuery.includes(kw)).length;
  const showDataScore = SHOW_DATA_KEYWORDS.filter(kw => lowerQuery.includes(kw)).length;

  return showDataScore > rulesScore ? 'showData' : 'rules';
}

export function categorizePopularQuestions(questions: PopularQuestion[]): {
  rules: string[];
  showData: string[];
} {
  const rules: string[] = [];
  const showData: string[] = [];

  for (const q of questions) {
    const category = categorizeQuestion(q.query);
    if (category === 'rules' && rules.length < 3) {
      rules.push(q.query);
    } else if (category === 'showData' && showData.length < 3) {
      showData.push(q.query);
    }

    if (rules.length >= 3 && showData.length >= 3) break;
  }

  return { rules, showData };
}
