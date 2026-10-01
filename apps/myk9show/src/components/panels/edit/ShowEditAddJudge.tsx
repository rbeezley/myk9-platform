import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NewJudgeForm, type CreateJudgeData } from '@/components/shows/wizard/steps/NewJudgeForm';

interface ShowEditAddJudgeProps {
  /** The show's organization when inline create is offered (AKC or UKC); else undefined. */
  organization: string | undefined;
  /** Panel-owned create-and-assign (MYK9-908). Rejects on failure. */
  onCreate: (input: CreateJudgeData) => Promise<void>;
  /** A create is in flight at panel level, possibly started before a tab switch. */
  pending: boolean;
  /** The last create failed while this form was not on screen. */
  error: string | null;
}

/**
 * "Add a new judge" on the Show Edit Judges tab. Purely presentational: the
 * create-then-assign operation belongs to the panel, because this component
 * unmounts when the user leaves the tab. Back on the tab, `pending` and `error`
 * say what happened meanwhile.
 */
export const ShowEditAddJudge: React.FC<ShowEditAddJudgeProps> = ({
  organization,
  onCreate,
  pending,
  error,
}) => {
  const [open, setOpen] = useState(false);

  if (!organization) return null;

  if (!open) {
    return (
      <div className="space-y-2">
        <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add a new judge
        </Button>
        {pending && (
          <p role="status" className="text-sm text-muted-foreground">
            Creating judge…
          </p>
        )}
        {error && !pending && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <NewJudgeForm
      lockedOrg={organization}
      defaultOrg={organization}
      onSubmit={async data => {
        await onCreate(data);
        setOpen(false);
      }}
      onCancel={() => setOpen(false)}
    />
  );
};
