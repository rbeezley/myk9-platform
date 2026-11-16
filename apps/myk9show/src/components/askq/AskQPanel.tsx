import { useCallback, useMemo, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { SlideOverPanel } from '@/components/panels/SlideOverPanel';
import { useAskQPanelStore } from '@/store/useAskQPanelStore';
import { useAskQ } from '@/hooks/useAskQ';
import { useThreadPinning } from './useThreadPinning';
import { useSubscriptionGate } from '@/hooks/useSubscriptionGate';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AskQExampleQueries } from './AskQExampleQueries';
import { TeraDock } from './TeraDock';
import { AskQInput } from './AskQInput';
import { AskQAnswer } from './AskQAnswer';
import { AskQSources } from './AskQSources';
import { AskQFeedback } from './AskQFeedback';
import { RATE_LIMIT_DEFAULTS } from './askq-config';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useSupportHelp } from '@/features/support/useSupportHelp';
import { AskQAppHelpContent } from './AskQAppHelpContent';
import { AskQTicketForm } from './AskQTicketForm';
import { AskQSendToPerson } from './AskQSendToPerson';
import { holdsStaffRole } from '@/pages/onboarding/onboardingSteps';

export function AskQPanel({ portal = false }: { portal?: boolean } = {}) {
  const { isOpen, close, suggestedPrompt, promptRequestId, clearSuggestedPrompt } =
    useAskQPanelStore();
  const { isPremium } = useSubscriptionGate();
  const location = useLocation();
  const { user, userWithRoles } = useAuthContext();
  const support = useSupportHelp(user, userWithRoles);
  const isStaff = holdsStaffRole(userWithRoles?.roles ?? []);

  const showId = useMemo(
    () =>
      location.pathname.match(/\/(?:secretary\/)?shows\/([^/]+)/)?.[1] ??
      location.pathname.match(/\/at-show\/([^/]+)/)?.[1],
    [location.pathname]
  );
  const askq = useAskQ(undefined, { userId: user?.id ?? null, scope: showId ?? 'app' });

  const limit = isPremium ? RATE_LIMIT_DEFAULTS.premium : RATE_LIMIT_DEFAULTS.free;
  const remaining = askq.remaining ?? limit;
  const signInHref = `/sign-in?returnTo=${encodeURIComponent(
    `${location.pathname}${location.search}`
  )}`;

  const submitOptions = useMemo(() => (showId ? { showId } : {}), [showId]);

  const lastEntry = askq.thread[askq.thread.length - 1];
  const hasConversation = askq.thread.length > 0 || askq.query !== '';
  // Driven by the newest text and status, not thread length: streamed tokens grow the live
  // answer, and at the 20-entry cap a finished answer leaves the length unchanged.
  const newestText = askq.answer || lastEntry?.answer;
  const { threadEndRef, pinToBottom } = useThreadPinning({
    isOpen,
    hasConversation,
    conversationKey: `${user?.id ?? ''}:${showId ?? 'app'}`,
    followToken: [askq.thread.length, askq.query, askq.status, newestText],
  });

  const handleSubmit = useCallback(
    (query: string) => {
      pinToBottom();
      askq.submitQuery(query, submitOptions);
      clearSuggestedPrompt();
    },
    [askq, clearSuggestedPrompt, pinToBottom, submitOptions]
  );

  const handleExampleQuery = useCallback(
    (query: string) => {
      pinToBottom();
      support.reset();
      askq.submitQuery(query, submitOptions);
      clearSuggestedPrompt();
    },
    [askq, clearSuggestedPrompt, pinToBottom, submitOptions, support]
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
    askq.reset(); // current request only; the saved thread stays
    support.reset();
    close();
  }, [askq, close, support]);

  const handleDone = useCallback(() => {
    support.reset();
  }, [support]);

  // AskQ could not answer (error or daily limit): move the typed question into the ticket step.
  // Ticket creation is a separate write, so this works with no AskQ questions left.
  const sendToPerson = useCallback(() => {
    const question = askq.query;
    askq.newQuestion(); // keeps the usage counters and a still-active daily limit
    support.startEscalation(question);
  }, [askq, support]);

  const escalationQuestion =
    support.state.route?.kind === 'escalate'
      ? support.state.route.question
      : support.state.question;

  const footer = useMemo(() => {
    if (support.state.status === 'escalating' || support.state.status === 'submitting') {
      if (!user) {
        return (
          <Button asChild className="w-full">
            <Link to={signInHref}>Sign in to create a ticket</Link>
          </Button>
        );
      }

      return (
        <AskQTicketForm
          question={escalationQuestion}
          submitting={support.state.status === 'submitting'}
          onSubmit={handleTicketSubmit}
        />
      );
    }

    if (support.state.status === 'created') {
      return (
        <Button type="button" variant="outline" className="w-full" onClick={handleDone}>
          Done
        </Button>
      );
    }

    return (
      <AskQInput
        key={promptRequestId}
        onSubmit={handleSubmit}
        disabled={askq.status === 'streaming' || askq.status === 'rate-limited'}
        initialValue={suggestedPrompt ?? ''}
        placeholder={
          askq.status === 'rate-limited'
            ? 'Daily limit reached. Resets at midnight.'
            : askq.status === 'done'
              ? 'Ask another question...'
              : 'Ask about rules, your results, or the app...'
        }
      />
    );
  }, [
    askq.status,
    escalationQuestion,
    handleDone,
    handleSubmit,
    handleTicketSubmit,
    promptRequestId,
    signInHref,
    suggestedPrompt,
    support.state.status,
    user,
  ]);

  const ticketStepActive = support.state.status !== 'idle';
  // A finished turn with nothing to show is a handoff too, never an empty bubble with feedback.
  const handoffMessage =
    askq.status !== 'done'
      ? null
      : (askq.escalation?.message ??
        (askq.answer.trim() === '' ? "I couldn't find a reliable answer for that." : null));
  // The just-finished answer is still shown in the live slot below the thread.
  const liveAnswerShown =
    askq.status === 'done' &&
    askq.query !== '' &&
    lastEntry?.question === askq.query &&
    lastEntry.answer === askq.answer;
  const visibleThread = liveAnswerShown ? askq.thread.slice(0, -1) : askq.thread;

  const content = (
    <>
      {visibleThread.map(entry => (
        <div key={entry.id} className="space-y-3">
          <AskQAnswer
            query={entry.question}
            answer={entry.answer}
            toolsUsed={entry.toolsUsed}
            isStreaming={false}
            isComplete
          />
          <AskQSources sources={entry.sources} />
          <AskQFeedback queryLogId={entry.queryLogId} />
        </div>
      ))}

      {askq.status === 'idle' && askq.thread.length === 0 && !ticketStepActive && (
        <TeraDock>
          <AskQExampleQueries onSelectQuery={handleExampleQuery} isStaff={isStaff} />
        </TeraDock>
      )}

      {askq.query && (
        <>
          <AskQAnswer
            query={askq.query}
            answer={askq.answer}
            toolsUsed={askq.toolsUsed}
            isStreaming={askq.status === 'streaming'}
            isComplete={askq.status === 'done'}
          />

          {handoffMessage && (
            <Alert>
              <AlertDescription className="space-y-2">
                <p>{handoffMessage}</p>
                {!ticketStepActive && <AskQSendToPerson onSend={sendToPerson} />}
              </AlertDescription>
            </Alert>
          )}

          {askq.status === 'done' && !handoffMessage && (
            <>
              <AskQSources sources={askq.sources} />
              <AskQFeedback queryLogId={askq.queryLogId} />
              {/* An answer that did not help still has a way to a person. */}
              {!ticketStepActive && (
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>Still need help?</span>
                  <AskQSendToPerson onSend={sendToPerson} />
                </div>
              )}
            </>
          )}
        </>
      )}

      {askq.status === 'error' && (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>{askq.error}</span>
            <button
              onClick={() => askq.submitQuery(askq.query, submitOptions)}
              className="text-xs underline"
            >
              Try again
            </button>
            {!ticketStepActive && <AskQSendToPerson onSend={sendToPerson} />}
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
          {!ticketStepActive && (
            <div className="mt-2">
              <AskQSendToPerson onSend={sendToPerson} />
            </div>
          )}
        </div>
      )}

      {ticketStepActive && (
        <AskQAppHelpContent currentUserId={user?.id ?? null} state={support.state} />
      )}

      <div ref={threadEndRef} data-testid="thread-end" />

      {askq.thread.length > 0 && (
        <div className="flex items-center justify-between gap-2">
          <Button type="button" variant="outline" size="sm" onClick={askq.newQuestion}>
            New question
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={askq.clearHistory}>
            Clear history
          </Button>
        </div>
      )}
    </>
  );

  return (
    <SlideOverPanel
      open={isOpen}
      onClose={handleClose}
      portal={portal}
      title="Ask for help"
      subtitle="AskQ"
      size="sm"
      headerActions={
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {remaining} of {limit} remaining
        </span>
      }
      footer={footer}
    >
      <div className="space-y-4 p-4">{content}</div>
    </SlideOverPanel>
  );
}
