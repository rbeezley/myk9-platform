/**
 * The Event Committee as an ordered list: add, remove, and move up or down. Shared by the club's
 * list (Club admin > Officers) and one show's own list (Edit show > Personnel).
 */

import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CommitteeMemberDialog } from './CommitteeMemberDialog';
import type { User } from '@/types/user-types';
import type { CommitteeMember, CommitteeTarget } from '@/types/committee-types';

interface CommitteeListProps {
  members: readonly CommitteeMember[];
  people: User[];
  onAdd: (target: CommitteeTarget) => void;
  onRemove: (memberId: string) => void;
  onMove: (memberId: string, direction: 'up' | 'down') => void;
  busy: boolean;
  emptyText: string;
}

export function CommitteeList({
  members,
  people,
  onAdd,
  onRemove,
  onMove,
  busy,
  emptyText,
}: CommitteeListProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="space-y-3">
      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ol className="divide-y divide-border rounded-lg border border-border">
          {members.map((member, index) => (
            <li key={member.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="text-sm text-foreground">{member.name}</span>
              <span className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Move ${member.name} up`}
                  disabled={busy || index === 0}
                  onClick={() => onMove(member.id, 'up')}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Move ${member.name} down`}
                  disabled={busy || index === members.length - 1}
                  onClick={() => onMove(member.id, 'down')}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${member.name}`}
                  disabled={busy}
                  onClick={() => onRemove(member.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </span>
            </li>
          ))}
        </ol>
      )}
      <Button type="button" variant="outline" onClick={() => setDialogOpen(true)}>
        <Plus className="h-4 w-4 mr-2" />
        Add committee member
      </Button>
      <CommitteeMemberDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={target => {
          onAdd(target);
          setDialogOpen(false);
        }}
        people={people}
        isSaving={busy}
      />
    </div>
  );
}
