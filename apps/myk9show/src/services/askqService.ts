import { supabase } from '@/lib/supabase';

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ask-myk9show`;

export interface AskQRequest {
  message: string;
  showId?: string;
}

export interface AskQFeedback {
  queryLogId: string;
  rating?: 1 | -1;
  reportText?: string;
}

type SSECallback = (event: string, data: unknown) => void;

export async function sendAskQQuery(request: AskQRequest): Promise<ReadableStream<Uint8Array>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(request),
  });

  if (response.status === 429) {
    const data = await response.json();
    throw new RateLimitError(data.remaining, data.limit, data.resetsAt);
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(data.error || `Request failed (${response.status})`);
  }

  if (!response.body) {
    throw new Error('No response body');
  }

  return response.body;
}

export async function parseSSEStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: SSECallback
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const messages = buffer.split('\n\n');
      buffer = messages.pop() ?? '';

      for (const msg of messages) {
        if (!msg.trim()) continue;

        let eventType = 'message';
        let eventData = '';

        for (const line of msg.split('\n')) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7);
          } else if (line.startsWith('data: ')) {
            eventData = line.slice(6);
          }
        }

        if (eventData) {
          try {
            const parsed = JSON.parse(eventData);
            onEvent(eventType, parsed);
          } catch {
            onEvent(eventType, eventData);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function submitFeedback(feedback: AskQFeedback): Promise<void> {
  const { error } = await supabase.from('chatbot_feedback').insert({
    query_log_id: feedback.queryLogId,
    rating: feedback.rating,
    report_text: feedback.reportText,
    user_id: (await supabase.auth.getUser()).data.user?.id,
  });

  if (error) {
    throw new Error(`Failed to submit feedback: ${error.message}`);
  }
}

export class RateLimitError extends Error {
  remaining: number;
  limit: number;
  resetsAt: string;

  constructor(remaining: number, limit: number, resetsAt: string) {
    super('Daily limit reached');
    this.name = 'RateLimitError';
    this.remaining = remaining;
    this.limit = limit;
    this.resetsAt = resetsAt;
  }
}
