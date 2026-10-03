import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SupportTicketThread } from '@/features/support/SupportTicketThread';
import { useSupportHelp } from '@/features/support/useSupportHelp';
import { AskQAnswer, TeraWorkingIndicator } from './AskQAnswer';
import { TeraAnswerMark, useFoundIt } from './TeraAnswerMark';

const SUPPORT_TICKET_NEXT_STEP =
  'Use the box below, then click Create ticket so we can follow up in the app.';

export function AskQAppHelpContent({
  currentUserId,
  onEscalate,
  state,
}: {
  currentUserId: string | null;
  onEscalate: () => void;
  state: ReturnType<typeof useSupportHelp>['state'];
}) {
  // An escalation is not an answer, so only 'answered' plays Found it.
  const [foundIt, clearFoundIt] = useFoundIt(
    state.status === 'streaming',
    state.status === 'answered'
  );

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
          <TeraWorkingIndicator />
        ))}

      {state.route?.kind === 'answer' && (
        <div className="flex items-start gap-2">
          <TeraAnswerMark foundIt={foundIt} onDone={clearFoundIt} />
          <div className="min-w-0 flex-1 space-y-3 rounded-xl rounded-tl-sm bg-muted/50 px-3.5 py-3">
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
