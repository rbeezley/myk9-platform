import { useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { SlideOverPanel } from '@/components/panels/SlideOverPanel';
import { useAskQPanelStore } from '@/store/useAskQPanelStore';
import { useAskQ } from '@/hooks/useAskQ';
import { useSubscriptionGate } from '@/hooks/useSubscriptionGate';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AskQExampleQueries } from './AskQExampleQueries';
import { AskQInput } from './AskQInput';
import { AskQAnswer } from './AskQAnswer';
import { AskQSources } from './AskQSources';
import { AskQFeedback } from './AskQFeedback';
import { RATE_LIMIT_DEFAULTS } from './askq-config';

export function AskQPanel() {
  const { isOpen, close } = useAskQPanelStore();
  const { isPremium } = useSubscriptionGate();
  const location = useLocation();
  const askq = useAskQ();

  const showId = useMemo(
    () => location.pathname.match(/\/(?:secretary\/)?shows\/([^/]+)/)?.[1],
    [location.pathname]
  );

  const limit = isPremium ? RATE_LIMIT_DEFAULTS.premium : RATE_LIMIT_DEFAULTS.free;
  const remaining = askq.remaining ?? limit;

  const handleSubmit = useCallback(
    (query: string) => {
      askq.submitQuery(query, showId);
    },
    [askq, showId]
  );

  const isInputDisabled = askq.status === 'streaming' || askq.status === 'rate-limited';

  return (
    <SlideOverPanel
      open={isOpen}
      onClose={close}
      title="AskQ Assistant"
      size="sm"
      headerActions={
        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          {remaining} of {limit} remaining
        </span>
      }
      footer={
        <AskQInput
          onSubmit={handleSubmit}
          disabled={isInputDisabled}
          {...(askq.status === 'rate-limited'
            ? { placeholder: 'Daily limit reached. Resets at midnight.' }
            : askq.status === 'done'
              ? { placeholder: 'Ask another question...' }
              : {})}
        />
      }
    >
      <div className="space-y-4 p-4">
        {askq.status === 'idle' && <AskQExampleQueries onSelectQuery={handleSubmit} />}

        {askq.query && (
          <>
            <AskQAnswer
              query={askq.query}
              answer={askq.answer}
              toolsUsed={askq.toolsUsed}
              isStreaming={askq.status === 'streaming'}
            />

            {askq.status === 'done' && (
              <>
                <AskQSources sources={askq.sources} />
                <AskQFeedback queryLogId={askq.queryLogId} />
              </>
            )}
          </>
        )}

        {askq.status === 'error' && (
          <Alert variant="destructive">
            <AlertDescription className="flex items-center justify-between">
              <span>{askq.error}</span>
              <button
                onClick={() => askq.submitQuery(askq.query, showId)}
                className="text-xs underline"
              >
                Try again
              </button>
            </AlertDescription>
          </Alert>
        )}

        {askq.status === 'rate-limited' && (
          <div className="bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 text-sm rounded-lg px-3.5 py-2.5">
            <p>Daily limit reached. Resets at midnight.</p>
            {!isPremium && (
              <a href="/subscription" className="mt-1 text-xs underline block">
                Upgrade for more queries
              </a>
            )}
          </div>
        )}
      </div>
    </SlideOverPanel>
  );
}
