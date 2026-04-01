export interface ChatRequest {
  message: string;
  licenseKey: string;
  organizationCode?: string;
  sportCode?: string;
}

export interface ChatResponse {
  answer: string;
  toolsUsed: string[];
  sources?: {
    rules?: Rule[];
    classes?: ClassSummary[];
    entries?: EntryResult[];
    trials?: TrialSummary[];
    guide?: unknown[];
  };
}

export interface Rule {
  id: string;
  section: string;
  title: string;
  content: string;
  categories: { level?: string; element?: string };
  keywords: string[];
  measurements: Record<string, unknown>;
}

export interface ClassSummary {
  class_id: number;
  element: string;
  level: string;
  section: string | null;
  judge_name: string | null;
  class_status: string;
  total_entries: number;
  scored_entries: number;
  checked_in_count: number;
  qualified_count: number;
  nq_count: number;
  trial_date: string;
  trial_name: string;
  briefing_time: string | null;
  start_time: string | null;
}

export interface EntryResult {
  armband_number: string;
  call_name: string;
  handler: string;
  entry_status: string;
  result_status: string | null;
  time: number | null;
  faults: number | null;
  placement: number | null;
  is_scored: boolean;
  element: string;
  level: string;
}

export interface TrialSummary {
  trial_id: string;
  trial_number: number;
  trial_date: string;
  trial_name: string;
  competition_type: string;
  show_name: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | ClaudeContentBlock[];
}

export interface ClaudeContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

export interface UserContext {
  userId: string;
  displayName: string | null;
  dogs: Array<{ id: string; name: string; callName: string | null; breed: string }>;
  showId: string | null;
  showName: string | null;
}

export interface AskQShowRequest {
  message: string;
  showId?: string;
}

export interface RateLimitInfo {
  remaining: number;
  limit: number;
  resetsAt: string;
}

export interface StreamEvent {
  event: 'tools_used' | 'sources' | 'token' | 'meta' | 'done' | 'error';
  data: unknown;
}
