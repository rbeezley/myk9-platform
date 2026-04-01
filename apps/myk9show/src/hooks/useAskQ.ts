import { useState, useCallback, useRef } from 'react';
import { sendAskQQuery, parseSSEStream, RateLimitError } from '@/services/askqService';
import type { AskQRequest } from '@/services/askqService';

export type AskQStatus = 'idle' | 'streaming' | 'done' | 'error' | 'rate-limited';

interface AskQState {
  status: AskQStatus;
  query: string;
  answer: string;
  toolsUsed: string[];
  sources: Record<string, unknown[]>;
  remaining: number | null;
  limit: number | null;
  queryLogId: string | null;
  error: string | null;
}

const INITIAL_STATE: AskQState = {
  status: 'idle',
  query: '',
  answer: '',
  toolsUsed: [],
  sources: {},
  remaining: null,
  limit: null,
  queryLogId: null,
  error: null,
};

export function useAskQ() {
  const [state, setState] = useState<AskQState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);
  const answerRef = useRef('');
  const rafRef = useRef<number | null>(null);

  const submitQuery = useCallback(
    async (message: string, showId?: string) => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
      abortRef.current = new AbortController();

      answerRef.current = '';
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      setState(prev => ({
        ...INITIAL_STATE,
        query: message,
        status: 'streaming',
        remaining: prev.remaining,
        limit: prev.limit,
      }));

      try {
        const request: AskQRequest = showId ? { message, showId } : { message };
        const stream = await sendAskQQuery(request);

        let answer = '';
        let toolsUsed: string[] = [];
        let sources: Record<string, unknown[]> = {};

        await parseSSEStream(stream, (event, data) => {
          switch (event) {
            case 'tools_used':
              toolsUsed = data as string[];
              setState(prev => ({ ...prev, toolsUsed }));
              break;
            case 'sources':
              sources = data as Record<string, unknown[]>;
              setState(prev => ({ ...prev, sources }));
              break;
            case 'token':
              answer += data as string;
              answerRef.current = answer;
              // Batch token renders to animation frames to avoid ~100 re-renders per response
              if (!rafRef.current) {
                rafRef.current = requestAnimationFrame(() => {
                  setState(prev => ({ ...prev, answer: answerRef.current }));
                  rafRef.current = null;
                });
              }
              break;
            case 'meta': {
              const meta = data as {
                remaining: number;
                limit: number;
                responseTimeMs: number;
                queryLogId: string | null;
              };
              setState(prev => ({
                ...prev,
                remaining: meta.remaining,
                limit: meta.limit,
                queryLogId: meta.queryLogId,
              }));
              break;
            }
            case 'done':
              // Flush any pending token render
              if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
              }
              setState(prev => ({ ...prev, answer: answerRef.current, status: 'done' }));
              break;
          }
        });
      } catch (err) {
        if (err instanceof RateLimitError) {
          setState(prev => ({
            ...prev,
            status: 'rate-limited',
            remaining: err.remaining,
            limit: err.limit,
            error: null,
          }));
        } else {
          setState(prev => ({
            ...prev,
            status: 'error',
            error: err instanceof Error ? err.message : 'An unexpected error occurred',
          }));
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const cancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    cancel();
    setState(INITIAL_STATE);
  }, [cancel]);

  return { ...state, submitQuery, reset, cancel };
}
