import { useState, useCallback, useRef, useEffect } from 'react';
import { sendAskQQuery, parseSSEStream, RateLimitError } from '@/services/askqService';
import {
  clearAskQHistory,
  loadAskQHistory,
  projectSourcesForHistory,
  pruneAskQHistory,
  saveAskQHistory,
  type AskQHistoryEntry,
} from './askqHistory';
import type {
  AskQQuerySender,
  AskQQuestionMode,
  AskQRequest,
  AskQRulebookScope,
} from '@/services/askqService';

export type AskQStatus = 'idle' | 'streaming' | 'done' | 'error' | 'rate-limited';

interface SubmitAskQOptions {
  showId?: string;
  questionMode?: AskQQuestionMode;
  rulebookScope?: AskQRulebookScope;
}

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

/** Cleared request state that keeps the usage counters and a still-active daily limit. */
function freshState(prev: AskQState): AskQState {
  return {
    ...INITIAL_STATE,
    status: prev.status === 'rate-limited' ? 'rate-limited' : INITIAL_STATE.status,
    remaining: prev.remaining,
    limit: prev.limit,
  };
}

export interface AskQHistoryOptions {
  /** Signed-in user id; null while unresolved (thread stays in memory only). */
  userId: string | null;
  /** Show id, or 'app' outside a show. */
  scope: string;
}

type HistoryKey = { userId: string | null; scope: string };

export function useAskQ(sendQuery: AskQQuerySender = sendAskQQuery, history?: AskQHistoryOptions) {
  const [state, setState] = useState<AskQState>(INITIAL_STATE);
  const [thread, setThread] = useState<AskQHistoryEntry[]>([]);
  const historyUserId = history?.userId ?? null;
  const historyScope = history?.scope ?? 'app';
  const persistEnabled = history !== undefined;
  const persistKeyRef = useRef<HistoryKey>({
    userId: historyUserId,
    scope: historyScope,
  });
  persistKeyRef.current = { userId: historyUserId, scope: historyScope };

  const appendToThread = useCallback((entry: AskQHistoryEntry, key: HistoryKey) => {
    // Context changed mid-request: never file the answer under the new user or show.
    const current = persistKeyRef.current;
    if (current.userId !== key.userId || current.scope !== key.scope) return;
    const { userId, scope } = key;
    setThread(prev => {
      const next = pruneAskQHistory([...prev, entry], entry.askedAt);
      if (userId) saveAskQHistory(userId, scope, next);
      return next;
    });
  }, []);
  const abortRef = useRef<AbortController | null>(null);
  const answerRef = useRef('');
  const rafRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  // Cleanup on unmount: cancel any in-flight stream and pending rAF
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  const submitQuery = useCallback(
    async (message: string, options: SubmitAskQOptions = {}) => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
      abortRef.current = new AbortController();
      const { signal } = abortRef.current;

      const historyKey = persistKeyRef.current;
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
        const request: AskQRequest = {
          message,
          ...(options.showId ? { showId: options.showId } : {}),
          ...(options.questionMode ? { questionMode: options.questionMode } : {}),
          ...(options.rulebookScope ? { rulebookScope: options.rulebookScope } : {}),
        };
        const stream = await sendQuery(request, signal);

        let answer = '';
        let toolsUsed: string[] = [];
        let sources: Record<string, unknown[]> = {};
        let queryLogId: string | null = null;

        await parseSSEStream(stream, (event, data) => {
          if (!mountedRef.current || signal.aborted) return;

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
              if (!rafRef.current) {
                rafRef.current = requestAnimationFrame(() => {
                  if (mountedRef.current) {
                    setState(prev => ({ ...prev, answer: answerRef.current }));
                  }
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
              queryLogId = meta.queryLogId;
              setState(prev => ({
                ...prev,
                remaining: meta.remaining,
                limit: meta.limit,
                queryLogId: meta.queryLogId,
              }));
              break;
            }
            case 'done':
              if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
              }
              if (persistEnabled && answer) {
                appendToThread(
                  {
                    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    question: message,
                    answer,
                    toolsUsed,
                    sources: projectSourcesForHistory(sources),
                    queryLogId,
                    askedAt: Date.now(),
                  },
                  historyKey
                );
              }
              setState(prev => ({ ...prev, answer: answerRef.current, status: 'done' }));
              break;
          }
        });
      } catch (err) {
        if (!mountedRef.current) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;

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

    [sendQuery, persistEnabled, appendToThread]
  );

  const cancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    cancel();
    setState(INITIAL_STATE);
  }, [cancel]);

  // On a user or show change: drop any in-flight or finished live answer (it belongs to the
  // old context) and load that context's saved thread. Unresolved user: memory only.
  // The daily limit belongs to the user, so a different user starts with clean counters.
  const stateUserIdRef = useRef(historyUserId);
  useEffect(() => {
    if (!persistEnabled) return;
    cancel();
    const userChanged = stateUserIdRef.current !== historyUserId;
    stateUserIdRef.current = historyUserId;
    setState(prev => (userChanged ? INITIAL_STATE : freshState(prev)));
    setThread(historyUserId ? loadAskQHistory(historyUserId, historyScope) : []);
  }, [persistEnabled, historyUserId, historyScope, cancel]);

  /** Starts a fresh question: drops the current answer, keeps saved history. */
  const newQuestion = useCallback(() => {
    cancel();
    setState(prev => freshState(prev));
  }, [cancel]);

  const clearHistory = useCallback(() => {
    const { userId, scope } = persistKeyRef.current;
    if (userId) clearAskQHistory(userId, scope);
    setThread([]);
    cancel();
    setState(prev => freshState(prev));
  }, [cancel]);

  return { ...state, thread, submitQuery, reset, cancel, newQuestion, clearHistory };
}
