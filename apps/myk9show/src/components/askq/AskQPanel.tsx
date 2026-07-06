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
import { AskQAnswer, AskQAnswerSkeleton } from './AskQAnswer';
import { AskQSources } from './AskQSources';
import { AskQFeedback } from './AskQFeedback';
import {
  QUESTION_MODE_LABELS,
  RATE_LIMIT_DEFAULTS,
  RULEBOOK_SCOPE_OPTIONS,
  type AskQPanelMode,
  type ExampleQuery,
} from './askq-config';
import { useAuthContext } from '@/hooks/useAuthContext';
import { SupportTicketThread } from '@/features/support/SupportTicketThread';
import { useSupportHelp } from '@/features/support/useSupportHelp';

const SUPPORT_TICKET_NEXT_STEP =
  'Use the box below, then click Create ticket so we can follow up in the app.';

export function AskQPanel() {
  const { isOpen, close, suggestedPrompt, promptRequestId, clearSuggestedPrompt } =
    useAskQPanelStore();
  const { isPremium } = useSubscriptionGate();
  const location = useLocation();
  const { user, userWithRoles } = useAuthContext();
  const askq = useAskQ();
  const support = useSupportHelp(user, userWithRoles);

  const showId = useMemo(
    () =>
      location.pathname.match(/\/(?:secretary\/)?shows\/([^/]+)/)?.[1] ??
      location.pathname.match(/\/at-show\/([^/]+)/)?.[1],
    [location.pathname]
  );
  const defaultMode: AskQPanelMode = showId ? 'show-data' : 'app-help';
  const [mode, setMode] = useState<AskQPanelMode | null>(null);
  const [rulebookOrganization, setRulebookOrganization] = useState('');
  const [rulebookSport, setRulebookSport] = useState('');
  const activeMode: AskQPanelMode =
    mode === 'show-data' && !showId ? 'app-help' : (mode ?? defaultMode);

  const limit = isPremium ? RATE_LIMIT_DEFAULTS.premium : RATE_LIMIT_DEFAULTS.free;
  const remaining = askq.remaining ?? limit;
  const signInHref = `/sign-in?returnTo=${encodeURIComponent(
    `${location.pathname}${location.search}`
  )}`;

  const buildSubmitOptions = useCallback(
    (questionMode?: Exclude<AskQPanelMode, 'app-help'>) => ({
      ...(showId ? { showId } : {}),
      ...(questionMode ? { questionMode } : {}),
      ...(questionMode === 'rules' && (rulebookOrganization || rulebookSport)
        ? {
            rulebookScope: {
              ...(rulebookOrganization ? { organizationCode: rulebookOrganization } : {}),
              ...(rulebookSport ? { sportCode: rulebookSport } : {}),
            },
          }
        : {}),
    }),
    [rulebookOrganization, rulebookSport, showId]
  );

  const handleSubmit = useCallback(
    (query: string) => {
      if (activeMode === 'app-help') {
        void support.askForHelp(query);
        clearSuggestedPrompt();
        return;
      }

      const questionMode = mode === 'rules' || mode === 'show-data' ? mode : undefined;
      askq.submitQuery(query, buildSubmitOptions(questionMode));
      clearSuggestedPrompt();
    },
    [activeMode, askq, buildSubmitOptions, clearSuggestedPrompt, mode, support]
  );

  const handleExampleQuery = useCallback(
    (query: string, category: ExampleQuery['category']) => {
      setMode(category);
      if (category === 'app-help') {
        askq.reset();
        void support.askForHelp(query);
        clearSuggestedPrompt();
        return;
      }

      support.reset();
      askq.submitQuery(query, buildSubmitOptions(category));
      clearSuggestedPrompt();
    },
    [askq, buildSubmitOptions, clearSuggestedPrompt, support]
  );

  const handleTicketSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      void support.createTicket(String(formData.get('supportRequest') ?? ''));
    },
    [support]
  );

  const handleModeChange = useCallback(
    (nextMode: AskQPanelMode) => {
      if (nextMode === 'show-data' && !showId) return;
      if (nextMode === 'app-help') askq.reset();
      else support.reset();
      setMode(nextMode);
    },
    [askq, showId, support]
  );

  const handleClose = useCallback(() => {
    askq.reset();
    support.reset();
    setMode(null);
    close();
  }, [askq, close, support]);

  const handleDone = useCallback(() => {
    support.reset();
    setMode(null);
  }, [support]);

  const startEscalation = useCallback(() => {
    support.startEscalation();
  }, [support]);

  const escalationQuestion =
    support.state.route?.kind === 'escalate'
      ? support.state.route.question
      : support.state.question;

  const footer = useMemo(() => {
    if (activeMode === 'app-help') {
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
        key={`${activeMode}-${promptRequestId}`}
        onSubmit={handleSubmit}
        disabled={
          activeMode === 'app-help'
            ? support.state.status === 'streaming'
            : askq.status === 'streaming' || askq.status === 'rate-limited'
        }
        initialValue={suggestedPrompt ?? ''}
        {...(activeMode === 'app-help'
          ? { placeholder: 'Ask about using myK9Show...' }
          : mode === null
            ? { placeholder: 'Ask about rules, your results, or the app...' }
            : activeMode === 'rules'
              ? { placeholder: 'Ask about the selected rulebook...' }
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
    activeMode,
    mode,
    promptRequestId,
    signInHref,
    suggestedPrompt,
    support.state.status,
    user,
  ]);

  const organizations = [...new Set(RULEBOOK_SCOPE_OPTIONS.map(option => option.organizationCode))];
  const sportOptions = RULEBOOK_SCOPE_OPTIONS.filter(
    option => !rulebookOrganization || option.organizationCode === rulebookOrganization
  );

  const isAskQMode = activeMode !== 'app-help';

  const content = isAskQMode ? (
    <>
      {activeMode === 'rules' && (
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-xs text-muted-foreground">
            <span>Organization</span>
            <select
              value={rulebookOrganization}
              onChange={event => {
                setRulebookOrganization(event.target.value);
                setRulebookSport('');
              }}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"
            >
              <option value="">Choose</option>
              {organizations.map(organization => (
                <option key={organization} value={organization}>
                  {organization}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            <span>Sport</span>
            <select
              value={rulebookSport}
              onChange={event => setRulebookSport(event.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"
            >
              <option value="">Choose</option>
              {sportOptions.map(option => (
                <option key={option.sportCode} value={option.sportCode}>
                  {option.label.replace(`${option.organizationCode} `, '')}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {askq.status === 'idle' && (
        <AskQExampleQueries onSelectQuery={handleExampleQuery} category={activeMode} />
      )}

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
              onClick={() =>
                askq.submitQuery(
                  askq.query,
                  buildSubmitOptions(mode === 'rules' || mode === 'show-data' ? mode : undefined)
                )
              }
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
    <>
      {support.state.status === 'idle' && (
        <AskQExampleQueries onSelectQuery={handleExampleQuery} category="app-help" />
      )}
      <AskQAppHelpContent
        currentUserId={user?.id ?? null}
        onEscalate={startEscalation}
        state={support.state}
      />
    </>
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
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
          {(['app-help', 'rules', 'show-data'] as AskQPanelMode[]).map(option => (
            <button
              key={option}
              type="button"
              onClick={() => handleModeChange(option)}
              disabled={option === 'show-data' && !showId}
              className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                activeMode === option
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45'
              }`}
            >
              {QUESTION_MODE_LABELS[option]}
            </button>
          ))}
        </div>
        {content}
      </div>
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
      {state.question && (
        <AskQAnswer query={state.question} answer="" toolsUsed={[]} isStreaming={false} />
      )}

      {state.status === 'streaming' &&
        (state.answer ? (
          <div className="rounded-xl rounded-tl-sm bg-muted/50 px-3.5 py-3">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{state.answer}</p>
          </div>
        ) : (
          <AskQAnswerSkeleton />
        ))}

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
          <AlertDescription className="space-y-1">
            {currentUserId ? (
              <>
                <p>
                  {state.route?.kind === 'escalate'
                    ? state.route.message
                    : "I couldn't answer that confidently."}
                </p>
                <p>{SUPPORT_TICKET_NEXT_STEP}</p>
              </>
            ) : (
              'Sign in to create a support ticket so we can reply in the app.'
            )}
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
