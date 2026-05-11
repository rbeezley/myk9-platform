import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { TrainingGoal } from '@/types/training';

interface TrainingGoalsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goals: TrainingGoal[];
  onCreateGoal: (goal: {
    title: string;
    target_date: string | null;
    sport_tag: string | null;
  }) => Promise<void> | void;
  onToggleGoal: (goal: TrainingGoal) => void;
}

export function TrainingGoalsDialog({
  open,
  onOpenChange,
  goals,
  onCreateGoal,
  onToggleGoal,
}: TrainingGoalsDialogProps) {
  const [title, setTitle] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [sportTag, setSportTag] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const activeGoals = goals.filter(goal => !goal.completed_at);
  const completedGoals = goals.filter(goal => goal.completed_at);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setIsCreating(true);
    try {
      await onCreateGoal({
        title: title.trim(),
        target_date: targetDate || null,
        sport_tag: sportTag.trim() || null,
      });
    } finally {
      setIsCreating(false);
    }
    setTitle('');
    setTargetDate('');
    setSportTag('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Training Goals</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-[1fr_10rem_9rem_auto]">
            <Input
              value={title}
              onChange={event => setTitle(event.target.value)}
              placeholder="Earn NW1 by September"
            />
            <Input
              type="date"
              value={targetDate}
              onChange={event => setTargetDate(event.target.value)}
            />
            <Input
              value={sportTag}
              onChange={event => setSportTag(event.target.value)}
              placeholder="Scent Work"
            />
            <Button onClick={handleCreate} disabled={!title.trim() || isCreating}>
              {isCreating ? 'Adding...' : 'Add'}
            </Button>
          </div>

          <section className="space-y-2">
            <h3 className="font-semibold">Active Goals</h3>
            {activeGoals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active goals yet.</p>
            ) : (
              activeGoals.map(goal => (
                <div
                  key={goal.id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div>
                    <p className="font-medium">{goal.title}</p>
                    <div className="mt-1 flex gap-2">
                      {goal.sport_tag && <Badge variant="outline">{goal.sport_tag}</Badge>}
                      {goal.target_date && (
                        <Badge variant="secondary">Due {goal.target_date}</Badge>
                      )}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => onToggleGoal(goal)}>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Complete
                  </Button>
                </div>
              ))
            )}
          </section>

          {completedGoals.length > 0 && (
            <section className="space-y-2">
              <h3 className="font-semibold">Completed</h3>
              {completedGoals.map(goal => (
                <div
                  key={goal.id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <p className="font-medium">{goal.title}</p>
                  <Button variant="ghost" size="sm" onClick={() => onToggleGoal(goal)}>
                    Reopen
                  </Button>
                </div>
              ))}
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
