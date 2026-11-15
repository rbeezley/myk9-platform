/**
 * INTENT: temporary. The mock show test page exists for the December mock shows
 * (MYK9-2022). Delete this page, `src/features/mockShow/`, its `/account/mock-show-test`
 * route and its account-menu item once the first real show has run.
 */
import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft, MessageSquarePlus } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/common/PageHeader';
import { PageShell } from '@/components/common/PageShell';
import { useAuthContext } from '@/hooks/useAuthContext';
import { MockNoteBox } from '@/features/mockShow/MockNoteBox';
import { MockTaskCard } from '@/features/mockShow/MockTaskCard';
import {
  MOCK_SHOW_CLOSING_QUESTIONS,
  MOCK_SHOW_RULES,
  MOCK_SHOW_TASKS,
} from '@/features/mockShow/mockShowSheet';
import { findMockTestTicket } from '@/features/mockShow/mockShowTickets';
import { useMockShowTestAccess } from '@/features/mockShow/useMockShowTestAccess';
import { useMockShowProgress, useMyMockTestTickets } from '@/features/mockShow/useMockShowTest';

export default function MockShowTestPage() {
  const { user } = useAuthContext();
  const access = useMockShowTestAccess();
  const { query: progressQuery, mutation, progressFor } = useMockShowProgress();
  const tickets = useMyMockTestTickets();
  const [freeNoteOpen, setFreeNoteOpen] = useState(false);

  if (access.isLoading) {
    return (
      <PageShell maxWidth="max-w-4xl">
        <div className="space-y-3 animate-pulse" aria-busy="true">
          <div className="h-10 rounded-md bg-muted" />
          <div className="h-40 rounded-md bg-muted" />
        </div>
      </PageShell>
    );
  }
  if (access.isError) {
    return (
      <PageShell maxWidth="max-w-4xl">
        <Alert variant="destructive" role="alert">
          <AlertDescription className="space-y-3">
            <p>Could not check your access. Check your connection and try again.</p>
            <Button type="button" variant="outline" onClick={access.retry} className="min-h-11">
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      </PageShell>
    );
  }
  if (!access.hasAccess || !user) return <Navigate to="/account" replace />;

  const myTickets = tickets.data ?? [];
  const ticketFor = (target: Parameters<typeof findMockTestTicket>[2]) =>
    findMockTestTicket(myTickets, user.id, target);

  return (
    <PageShell maxWidth="max-w-4xl">
      <PageHeader
        breadcrumbs={[
          { label: 'Account', href: '/account' },
          { label: 'Mock show test', href: '/account/mock-show-test' },
        ]}
        title="Mock show test"
        showTitle
        actions={
          <Button variant="outline" asChild className="min-h-11">
            <Link to="/account">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
        }
      />

      <p className="text-muted-foreground">
        Thank you for testing. Work through the tasks in order. Tick each one, write down how long
        it took, and tell us what happened. Your notes go straight to us.
      </p>

      <Alert className="mt-4">
        <AlertTitle>Two rules for the test</AlertTitle>
        <AlertDescription>
          <ul className="list-disc space-y-1 pl-5">
            {MOCK_SHOW_RULES.map(rule => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </AlertDescription>
      </Alert>

      <section className="mt-6 rounded-md border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Something else on your mind?</h2>
            <p className="text-sm text-muted-foreground">
              Send us a note about anything, any time. It does not need a task.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => setFreeNoteOpen(open => !open)}
            aria-expanded={freeNoteOpen}
            className="min-h-11"
          >
            <MessageSquarePlus className="mr-2 h-4 w-4" />
            Send a note
          </Button>
        </div>
        {freeNoteOpen && (
          <div className="mt-4">
            <MockNoteBox
              id="mock-note-free"
              target={{ part: 'free' }}
              ticket={null}
              label="Your note"
              placeholder="What happened, and where were you in the app?"
            />
          </div>
        )}
      </section>

      <h2 className="mt-8 text-xl font-semibold">The tasks</h2>
      <p className="text-sm text-muted-foreground">
        Use the entries from a show you have already run.
      </p>
      {progressQuery.isError && (
        <Alert variant="destructive" className="mt-3">
          <AlertDescription className="space-y-3">
            <p>
              Could not load your ticks and minutes, so they are locked for now. Check your
              connection and try again.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => void progressQuery.refetch()}
              className="min-h-11"
            >
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {mutation.isError && (
        <Alert variant="destructive" className="mt-3" role="alert">
          <AlertDescription>
            Your last tick or minutes did not save. Check your connection and try again.
          </AlertDescription>
        </Alert>
      )}
      <ol className="mt-3 space-y-4">
        {MOCK_SHOW_TASKS.map(task => (
          <MockTaskCard
            key={task.number}
            task={task}
            progress={progressFor(task.number)}
            ticket={ticketFor({ part: 'task', number: task.number })}
            disabled={!progressQuery.isSuccess}
            onProgress={progress => mutation.mutate({ number: task.number, progress })}
          />
        ))}
      </ol>

      <h2 className="mt-8 text-xl font-semibold">Three questions at the end</h2>
      <ol className="mt-3 space-y-4">
        {MOCK_SHOW_CLOSING_QUESTIONS.map((question, index) => (
          <li key={question} className="rounded-md border border-border bg-card p-4 sm:p-5">
            <MockNoteBox
              id={`mock-closing-${index + 1}`}
              target={{ part: 'closing', number: index + 1 }}
              ticket={ticketFor({ part: 'closing', number: index + 1 })}
              label={`${index + 1}. ${question}`}
            />
          </li>
        ))}
      </ol>
    </PageShell>
  );
}
