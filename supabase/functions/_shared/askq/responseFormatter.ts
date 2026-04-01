import type {
  ChatResponse,
  ClaudeContentBlock,
  Rule,
  ClassSummary,
  EntryResult,
  TrialSummary,
} from './types.ts';

export function collectSource(
  sources: ChatResponse['sources'],
  toolName: string,
  result: unknown
): void {
  if (!sources) return;

  switch (toolName) {
    case 'search_rules':
      sources.rules = result as Rule[];
      break;
    case 'get_class_summary':
      sources.classes = result as ClassSummary[];
      break;
    case 'get_entry_results':
    case 'search_entries':
      sources.entries = result as EntryResult[];
      break;
    case 'get_trial_overview':
      sources.trials = result as TrialSummary[];
      break;
    case 'search_user_guide': {
      const guideData = result as unknown[];
      if (guideData?.length > 0) {
        sources.guide = guideData;
      }
      break;
    }
  }
}

export function buildChatResponse(
  content: ClaudeContentBlock[],
  toolsUsed: string[],
  sources: ChatResponse['sources']
): ChatResponse {
  const textBlock = content.find(block => block.type === 'text');
  const answer = textBlock?.text || "I couldn't generate a response.";

  return {
    answer,
    toolsUsed: [...new Set(toolsUsed)],
    sources: Object.keys(sources!).length > 0 ? sources : undefined,
  };
}
