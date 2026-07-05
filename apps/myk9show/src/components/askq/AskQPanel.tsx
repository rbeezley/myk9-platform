import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ExternalLink, Send } from 'lucide-react';
import { SlideOverPanel } from '@/components/panels/SlideOverPanel';
import { useAskQPanelStore } from '@/store/useAskQPanelStore';
import { useAskQ } from '@/hooks/useAskQ';
import { useSubscriptionGate } from '@/hooks/useSubscriptionGate';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AskQExampleQueries } from './AskQExampleQueries';
import { AskQInput } from './AskQInput';
import { AskQAnswer } from './AskQAnswer';
import { AskQSources } from './AskQSources';
import { AskQFeedback } from './AskQFeedback';
import { RATE_LIMIT_DEFAULTS, type ExampleQuery } from './askq-config';
import { useAuthContext } from '@/hooks/useAuthContext';
import { SupportTicketThread } from '@/features/support/SupportTicketThread';
import { useSupportHelp } from '@/features/support/useSupportHelp';

type AskQPanelMode = 'askq' | 'app-help';

export function AskQPanel() {
  const { isOpen, close, suggestedPrompt, promptRequestId, clearSuggestedPrompt } =
    useAskQPanelStore();
  const { isPremium } = useSubscriptionGate();
  const location = useLocation();
  const { user, userWithRoles } = useAuthContext();
  const askq = useAskQ();
  const support = useSupportHelp(user, userWithRoles);
  const [mode, setMode] = useState<AskQPanelMode>('askq');

  const showId = useMemo(
    () => location.pathname.match(/\/(?:secretary\/)?shows\/([^/]+)/)?.[1],
    [location.pathname]
  );

  const limit = isPremium ? RATE_LIMIT_DEFAULTS.premium : RATE_LIMIT_DEFAULTS.free;
  const remaining = askq.remaining ?? limit;
  const signInHref = `/sign-in?returnTo=${encodeURIComponent(
    `${location.pathname}${location.search}`
  )}`;

  const handleSubmit = useCallback(
    (query: string) => {
      if (mode === 'app-help') {
        void support.askForHelp(query);
        clearSuggestedPrompt();
        return;
      }

      askq.submitQuery(query, showId);
      clearSuggestedPrompt();
    },
    [askq, clearSuggestedPrompt, mode, showId, support]
  );

  const handleExampleQuery = useCallback(
    (query: string, category: ExampleQuery['category']) => {
      if (category === 'app-help') {
        askq.reset();
        setMode('app-help');
        void support.askForHelp(query);
        clearSuggestedPrompt();
        return;
      }

      support.reset();
      setMode('askq');
      askq.submitQuery(query, showId);
      clearSuggestedPrompt();
    },
    [askq, clearSuggestedPrompt, showId, support]
  );

  const handleTicketSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      void support.createTicket(String(formData.get('supportRequest') ?? ''));
    },
    [support]
  );

  const handleClose = useCallback(() => {
    askq.reset();
    support.reset();
    setMode('askq');
    close();
  }, [askq, close, support]);

  const handleDone = useCallback(() => {
    support.reset();
    setMode('askq');
  }, [support]);

  const startEscalation = useCallback(() => {
    support.startEscalation();
  }, [support]);

  const escalationQuestion =
    support.state.route?.kind === 'escalate' ? support.state.route.question : support.state.question;

  const footer = useMemo(() => {
    if (mode === 'app-help') {
      if (support.state.status === 'escalating' || support.state.status === 'submitting') {
        if (!user) {
          return (
            <Button asChild className="w-full">
              <Link to={signInHref}>Sign in to create a ticket</Link>
            </Button>
          );
        }

        return (
          <form onSubmit={handleTicketSubmit} className="space-y-3">
            <textarea
              key={escalationQuestion}
              name="supportRequest"
              defaultValue={escalationQuestion}
              rows={3}
              className="w-full resize-none rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              aria-label="Support request"
            />
            <Button
              type="submit"
              className="w-full gap-2"
              disabled={support.state.status === 'submitting'}
            >
              <Send className="h-4 w-4" />
              {support.state.status === 'submitting' ? 'Creating ticket...' : 'Create ticket'}
            </Button>
          </form>
        );
      }

      if (support.state.status === 'created') {
        return (
          <Button type="button" variant="outline" className="w-full" onClick={handleDone}>
            Done
          </Button>
        );
      }
    }

    return (
      <AskQInput
        key={`${mode}-${promptRequestId}`}
        onSubmit={handleSubmit}
        disabled={
          mode === 'app-help'
            ? support.state.status === 'streaming'
            : askq.status === 'streaming' || askq.status === 'rate-limited'
        }
        initialValue={mode === 'askq' ? (suggestedPrompt ?? '') : ''}
        {...(mode === 'app-help'
          ? { placeholder: 'Ask about using myK9Show...' }
          : askq.status === 'rate-limited'
            ? { placeholder: 'Daily limit reached. Resets at midnight.' }
            : askq.status === 'done'
              ? { placeholder: 'Ask another question...' }
              : {})}
      />
    );
  }, [
    askq.status,
    escalationQuestion,
    handleDone,
    handleSubmit,
    handleTicketSubmit,
    mode,
    promptRequestId,
    signInHref,
    suggestedPrompt,
    support.state.status,
    user,
  ]);

  const isAskQMode = mode === 'askq';

  const content = isAskQMode ? (
    <>
      {askq.status === 'idle' && <AskQExampleQueries onSelectQuery={handleExampleQuery} />}

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
        <div className="bg-warning/10 text-warning text-sm rounded-lg px-3.5 py-2.5">
          <p>Daily limit reached. Resets at midnight.</p>
          {!isPremium && (
            <a href="/subscription" className="mt-1 text-xs underline block">
              Upgrade for more queries
            </a>
          )}
        </div>
      )}
    </>
  ) : (
    <AskQAppHelpContent
      currentUserId={user?.id ?? null}
      onEscalate={startEscalation}
      state={support.state}
    />
  );

  return (
    <SlideOverPanel
      open={isOpen}
      onClose={handleClose}
      title="AskQ Assistant"
      size="sm"
      headerActions={
        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          {remaining} of {limit} remaining
        </span>
      }
      footer={footer}
    >
      <div className="space-y-4 p-4">{content}</div>
    </SlideOverPanel>
  );
}

function AskQAppHelpContent({
  currentUserId,
  onEscalate,
  state,
}: {
  currentUserId: string | null;
  onEscalate: () => void;
  state: ReturnType<typeof useSupportHelp>['state'];
}) {
  return (
    <>
      {state.question && <AskQAnswer query={state.question} answer="" toolsUsed={[]} isStreaming={false} />}

      {state.status === 'streaming' && (
        <div className="rounded-xl rounded-tl-sm bg-muted/50 px-3.5 py-3">
          {state.answer ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{state.answer}</p>
          ) : (
            <div className="space-y-2 animate-pulse">
              <div className="h-3 w-3/4 rounded bg-muted" />
              <div className="h-3 w-1/2 rounded bg-muted" />
            </div>
          )}
        </div>
      )}

      {state.route?.kind === 'answer' && (
        <div className="space-y-3 rounded-xl rounded-tl-sm bg-muted/50 px-3.5 py-3">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{state.route.answer}</p>
          {state.route.deepLink && (
            <Button asChild variant="outline" size="sm" className="gap-2">
              <Link to={state.route.deepLink.href}>
                {state.route.deepLink.label}
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="px-0 text-muted-foreground"
            onClick={onEscalate}
          >
            Still need help?
          </Button>
        </div>
      )}

      {state.status === 'escalating' && (
        <Alert>
          <AlertDescription>
            {currentUserId
              ? state.route?.kind === 'escalate'
                ? state.route.message
                : 'A person can help with that.'
              : 'Sign in to create a support ticket so we can reply in the app.'}
          </AlertDescription>
        </Alert>
      )}

      {state.status === 'created' && (
        <>
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="text-sm font-medium">Ticket created</p>
            <p className="mt-1 text-sm text-muted-foreground">
              We will reply in the app. Ticket {state.ticket?.id.slice(0, 8)}
            </p>
          </div>
          {state.ticket && currentUserId && (
            <SupportTicketThread ticketId={state.ticket.id} currentUserId={currentUserId} />
          )}
        </>
      )}

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
    </>
  );
}
