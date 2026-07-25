import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Send } from 'lucide-react';
import { SlideOverPanel } from '@/components/panels/SlideOverPanel';
import { useAskQPanelStore } from '@/store/useAskQPanelStore';
import { useAskQ } from '@/hooks/useAskQ';
import { sendOperatorSupportQuery } from '@/services/askqService';
import { useSubscriptionGate } from '@/hooks/useSubscriptionGate';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AskQExampleQueries } from './AskQExampleQueries';
import { AskQInput } from './AskQInput';
import { AskQAnswer } from './AskQAnswer';
import { AskQSources } from './AskQSources';
import { AskQFeedback } from './AskQFeedback';
import {
  RATE_LIMIT_DEFAULTS,
  RULEBOOK_SCOPE_OPTIONS,
  type AskQPanelMode,
  type ExampleQuery,
} from './askq-config';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useSupportHelp } from '@/features/support/useSupportHelp';
import { UserRole } from '@/types/auth-types';
import { AskQAppHelpContent } from './AskQAppHelpContent';
import { AskQModeSelector } from './AskQModeSelector';

export function AskQPanel() {
  const { isOpen, close, suggestedPrompt, promptRequestId, clearSuggestedPrompt } =
    useAskQPanelStore();
  const { isPremium } = useSubscriptionGate();
  const location = useLocation();
  const { user, userWithRoles } = useAuthContext();
  const askq = useAskQ();
  const operator = useAskQ(sendOperatorSupportQuery);
  const support = useSupportHelp(user, userWithRoles);
  const isSiteAdmin = userWithRoles?.roles.includes(UserRole.SITE_ADMIN) ?? false;

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
    (mode === 'show-data' && !showId) || (mode === 'operator-support' && !isSiteAdmin)
      ? 'app-help'
      : (mode ?? defaultMode);
  const activeAskQ = activeMode === 'operator-support' ? operator : askq;

  const limit = isPremium ? RATE_LIMIT_DEFAULTS.premium : RATE_LIMIT_DEFAULTS.free;
  const remaining = askq.remaining ?? limit;
  const signInHref = `/sign-in?returnTo=${encodeURIComponent(
    `${location.pathname}${location.search}`
  )}`;

  const buildSubmitOptions = useCallback(
    (questionMode?: 'rules' | 'show-data') => ({
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

      if (activeMode === 'operator-support') {
        operator.submitQuery(query);
        clearSuggestedPrompt();
        return;
      }

      const questionMode = mode === 'rules' || mode === 'show-data' ? mode : undefined;
      askq.submitQuery(query, buildSubmitOptions(questionMode));
      clearSuggestedPrompt();
    },
    [activeMode, askq, buildSubmitOptions, clearSuggestedPrompt, mode, operator, support]
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
      if (nextMode === 'operator-support' && !isSiteAdmin) return;
      if (nextMode === 'operator-support' || activeMode === 'operator-support') {
        clearSuggestedPrompt();
      }

      if (nextMode === 'operator-support') {
        askq.reset();
        support.reset();
      } else {
        operator.reset();
        if (nextMode === 'app-help') askq.reset();
        else support.reset();
      }
      setMode(nextMode);
    },
    [activeMode, askq, clearSuggestedPrompt, isSiteAdmin, operator, showId, support]
  );

  const handleClose = useCallback(() => {
    askq.reset();
    operator.reset();
    support.reset();
    setMode(null);
    close();
  }, [askq, close, operator, support]);

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
              className="w-full resize-none rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
            : activeAskQ.status === 'streaming' || activeAskQ.status === 'rate-limited'
        }
        initialValue={suggestedPrompt ?? ''}
        {...(activeMode === 'app-help'
          ? { placeholder: 'Ask about using myK9Show...' }
          : activeMode === 'operator-support'
            ? { placeholder: 'Ask about platform alerts...' }
            : mode === null
              ? { placeholder: 'Ask about rules, your results, or the app...' }
              : activeMode === 'rules'
                ? { placeholder: 'Ask about the selected rulebook...' }
                : activeAskQ.status === 'rate-limited'
                  ? { placeholder: 'Daily limit reached. Resets at midnight.' }
                  : activeAskQ.status === 'done'
                    ? { placeholder: 'Ask another question...' }
                    : {})}
      />
    );
  }, [
    activeAskQ.status,
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

      {activeMode === 'operator-support' && (
        <Alert>
          <AlertDescription className="space-y-2">
            <p>
              Read-only access to unresolved operator alerts and the latest automated System Health
              snapshot. This snapshot does not guarantee complete platform health.
            </p>
            <p>
              No user lookup, payment tracing, or write actions are available. Do not paste user or
              payment details into this mode yet.
            </p>
            <Link className="inline-block text-xs underline" to="/admin/health">
              Open full System Health
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {activeMode !== 'operator-support' && activeAskQ.status === 'idle' && (
        <AskQExampleQueries onSelectQuery={handleExampleQuery} category={activeMode} />
      )}

      {activeAskQ.query && (
        <>
          <AskQAnswer
            query={activeAskQ.query}
            answer={activeAskQ.answer}
            toolsUsed={activeAskQ.toolsUsed}
            isStreaming={activeAskQ.status === 'streaming'}
          />

          {activeAskQ.status === 'done' && activeMode !== 'operator-support' && (
            <>
              <AskQSources sources={activeAskQ.sources} />
              <AskQFeedback queryLogId={activeAskQ.queryLogId} />
            </>
          )}
        </>
      )}

      {activeAskQ.status === 'error' && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            <span>{activeAskQ.error}</span>
            <button
              onClick={() =>
                activeAskQ.submitQuery(
                  activeAskQ.query,
                  activeMode === 'operator-support'
                    ? {}
                    : buildSubmitOptions(
                        mode === 'rules' || mode === 'show-data' ? mode : undefined
                      )
                )
              }
              className="text-xs underline"
            >
              Try again
            </button>
          </AlertDescription>
        </Alert>
      )}

      {activeAskQ.status === 'rate-limited' && (
        <div className="bg-warning/10 text-warning text-sm rounded-lg px-3.5 py-2.5">
          <p>
            Daily limit reached. Resets at midnight
            {activeMode === 'operator-support' ? ' UTC' : ''}.
          </p>
          {!isPremium && activeMode !== 'operator-support' && (
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
        activeMode === 'operator-support' ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            Admin-only · read-only
          </span>
        ) : (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {remaining} of {limit} remaining
          </span>
        )
      }
      footer={footer}
    >
      <div className="space-y-4 p-4">
        <AskQModeSelector
          activeMode={activeMode}
          selectedMode={mode}
          hasShowContext={Boolean(showId)}
          isSiteAdmin={isSiteAdmin}
          onChange={handleModeChange}
        />
        {content}
      </div>
    </SlideOverPanel>
  );
}
