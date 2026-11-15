import { Alert, AlertDescription } from '@/components/ui/alert';
import { SupportTicketThread } from '@/features/support/SupportTicketThread';
import { useSupportHelp } from '@/features/support/useSupportHelp';
import { AskQAnswer } from './AskQAnswer';

const SUPPORT_TICKET_NEXT_STEP =
  'Use the box below, then click Create ticket so we can follow up in the app.';

export function AskQAppHelpContent({
  currentUserId,
  state,
}: {
  currentUserId: string | null;
  state: ReturnType<typeof useSupportHelp>['state'];
}) {
  return (
    <>
      {state.question && (
        <AskQAnswer query={state.question} answer="" toolsUsed={[]} isStreaming={false} />
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
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>{state.error}</span>
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}
