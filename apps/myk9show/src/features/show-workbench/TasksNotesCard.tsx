import { ArrowRight, ClipboardList } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useSecretaryTasks } from '@/hooks/queries/useSecretaryTasks';

interface TasksNotesCardProps {
  showId: string;
}

// INTENT: Phase B3 — entry-point card for tasks/notes management. The full
// tasks surface lives on the secretary dashboard (TasksTab); this card is
// a clean handoff that shows the open-task count scoped to this show so
// the secretary can decide whether the tab is worth opening.
export function TasksNotesCard({ showId }: TasksNotesCardProps) {
  const { data: tasks = [] } = useSecretaryTasks(showId);
  const openCount = tasks.filter((t: { status: string }) => t.status === 'todo').length;

  return (
    <section className="rounded-md border bg-card p-4" aria-labelledby="tasks-notes-card-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id="tasks-notes-card-title" className="text-base font-semibold">
            Tasks &amp; Notes
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Per-show reminders, follow-ups, and notes. Cross-show tasks stay on the dashboard.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {openCount > 0 ? (
            <Badge variant="secondary" data-testid="tasks-notes-open-count">
              {openCount} open
            </Badge>
          ) : (
            <Badge variant="outline" data-testid="tasks-notes-open-count">
              None open
            </Badge>
          )}
          <ClipboardList className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        </div>
      </div>
      <div className="mt-3">
        <Button asChild variant="outline" size="sm" className="gap-2">
          <Link to="/secretary/dashboard">
            Open tasks
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
