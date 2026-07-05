import { useState, type FormEvent } from 'react';
import { ExternalLink, LifeBuoy, Send } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SlideOverPanel } from '@/components/panels/SlideOverPanel';
import { useAuthContext } from '@/hooks/useAuthContext';
import { SupportTicketThread } from './SupportTicketThread';
import { useSupportHelp } from './useSupportHelp';

export function SupportHelpLauncher() {
  const { user, userWithRoles } = useAuthContext();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const support = useSupportHelp(user, userWithRoles);
  const escalationQuestion =
    support.state.route?.kind === 'escalate' ? support.state.route.question : '';

  if (!user) return null;

  const submitQuestion = (event: FormEvent) => {
    event.preventDefault();
    void support.askForHelp(question);
  };

  const submitTicket = (event: FormEvent) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const formData = new FormData(form);
    void support.createTicket(String(formData.get('supportRequest') ?? ''));
  };

  const closePanel = () => {
    setOpen(false);
    setQuestion('');
    support.reset();
  };

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 h-12 rounded-full px-4 shadow-lg gap-2"
        aria-label="Get Help"
      >
        <LifeBuoy className="h-5 w-5" />
        <span>Get Help</span>
      </Button>

      <SlideOverPanel
        open={open}
        onClose={closePanel}
        title="Get Help"
        size="sm"
        footer={
          support.state.status === 'escalating' || support.state.status === 'submitting' ? (
            <form onSubmit={submitTicket} className="space-y-3">
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
          ) : support.state.status === 'created' ? (
            <Button type="button" variant="outline" className="w-full" onClick={closePanel}>
              Done
            </Button>
          ) : (
            <form onSubmit={submitQuestion} className="flex gap-2">
              <input
                type="text"
                value={question}
                onChange={event => setQuestion(event.target.value)}
                placeholder="What do you need help with?"
                disabled={support.state.status === 'streaming'}
                className="min-h-11 flex-1 rounded-lg bg-muted px-3 py-2.5 text-sm placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
              />
              <Button
                type="submit"
                size="icon"
                aria-label="Send"
                disabled={support.state.status === 'streaming' || !question.trim()}
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          )
        }
      >
        <div className="space-y-4 p-4">
          {support.state.question && <QuestionBubble question={support.state.question} />}

          {support.state.status === 'streaming' && (
            <div className="rounded-xl rounded-tl-sm bg-muted/50 px-3.5 py-3">
              {support.state.answer ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {support.state.answer}
                </p>
              ) : (
                <div className="space-y-2 animate-pulse">
                  <div className="h-3 w-3/4 rounded bg-muted" />
                  <div className="h-3 w-1/2 rounded bg-muted" />
                </div>
              )}
            </div>
          )}

          {support.state.route?.kind === 'answer' && (
            <div className="space-y-3 rounded-xl rounded-tl-sm bg-muted/50 px-3.5 py-3">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {support.state.route.answer}
              </p>
              {support.state.route.deepLink && (
                <Button asChild variant="outline" size="sm" className="gap-2">
                  <Link to={support.state.route.deepLink.href}>
                    {support.state.route.deepLink.label}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="px-0 text-muted-foreground"
                onClick={support.startEscalation}
              >
                Still need help?
              </Button>
            </div>
          )}

          {support.state.status === 'escalating' && (
            <Alert>
              <AlertDescription>
                {support.state.route?.kind === 'escalate'
                  ? support.state.route.message
                  : 'A person can help with that.'}
              </AlertDescription>
            </Alert>
          )}

          {support.state.status === 'created' && (
            <>
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-sm font-medium">Ticket created</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  We will reply in the app. Ticket {support.state.ticket?.id.slice(0, 8)}
                </p>
              </div>
              {support.state.ticket && (
                <SupportTicketThread ticketId={support.state.ticket.id} currentUserId={user.id} />
              )}
            </>
          )}

          {support.state.error && (
            <Alert variant="destructive">
              <AlertDescription>{support.state.error}</AlertDescription>
            </Alert>
          )}
        </div>
      </SlideOverPanel>
    </>
  );
}

function QuestionBubble({ question }: { question: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-xl rounded-br-sm bg-primary px-3.5 py-2.5 text-sm text-primary-foreground">
        {question}
      </div>
    </div>
  );
}
