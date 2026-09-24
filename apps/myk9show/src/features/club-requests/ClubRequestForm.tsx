/**
 * Inline form + status for one club-routed ask (MYK9-685). Renders every
 * ClubRequestState explicitly, so the page can never end up with a club
 * selected and no way forward.
 */
import React, { useState } from 'react';
import { CheckCircle2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ClubRequestController } from './clubRequestState';

export interface ClubRequestCopy {
  /** e.g. "Why are you asking?" */
  noteLabel: string;
  notePlaceholder: string;
  noteRequired: boolean;
  /** What approval will and will not do, shown above the form. */
  explanation: string;
  approvedMessage: string;
  deniedMessage: string;
}

interface ClubRequestFormProps {
  controller: ClubRequestController;
  clubName: string;
  copy: ClubRequestCopy;
  fieldId: string;
}

function StatusBox({
  icon,
  title,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div role="status" className="space-y-2 rounded-lg border border-border bg-muted/40 p-4">
      <p className="flex items-center gap-2 text-base font-semibold text-foreground">
        {icon}
        {title}
      </p>
      {children}
    </div>
  );
}

export const ClubRequestForm: React.FC<ClubRequestFormProps> = ({
  controller,
  clubName,
  copy,
  fieldId,
}) => {
  const [note, setNote] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const { state } = controller;

  switch (state.kind) {
    case 'signed-out':
      return <StatusBox title="Sign in to send a request." />;
    case 'loading':
      return (
        <p role="status" className="text-sm text-muted-foreground">
          Checking your request status…
        </p>
      );
    case 'error':
      return (
        <div role="alert" className="space-y-2">
          <p className="text-sm text-destructive">
            We couldn&apos;t check your request status right now.
          </p>
          <Button variant="outline" className="min-h-11" onClick={controller.retry}>
            Try again
          </Button>
        </div>
      );
    case 'has-access':
      return (
        <StatusBox icon={<CheckCircle2 className="h-5 w-5 text-primary" />} title={state.message} />
      );
    case 'approved':
      return (
        <StatusBox
          icon={<CheckCircle2 className="h-5 w-5 text-primary" />}
          title={copy.approvedMessage}
        />
      );
    case 'denied':
      return (
        <StatusBox title={copy.deniedMessage}>
          {state.reviewerNote && (
            <p className="text-sm italic text-muted-foreground">
              &ldquo;{state.reviewerNote}&rdquo;
            </p>
          )}
        </StatusBox>
      );
    case 'pending':
      return (
        <StatusBox
          icon={
            controller.justSubmitted ? (
              <CheckCircle2 className="h-5 w-5 text-primary" />
            ) : (
              <Clock className="h-5 w-5 text-muted-foreground" />
            )
          }
          title={controller.justSubmitted ? 'Request sent' : 'Your request is under review'}
        >
          <p className="text-sm text-muted-foreground">
            {clubName}&apos;s admins will review it from their Club Members page. Come back to
            this page to see their decision. You do not need to send it again.
          </p>
        </StatusBox>
      );
    case 'available':
      break;
  }

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (copy.noteRequired && !note.trim()) {
      setValidationError('Please tell the club why you are asking.');
      return;
    }
    setValidationError(null);
    controller.submit(note.trim());
  };

  const error = validationError ?? controller.submitError;

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      <p className="text-sm text-muted-foreground">{copy.explanation}</p>
      <div className="space-y-2">
        <Label htmlFor={fieldId}>
          {copy.noteLabel}
          {copy.noteRequired ? ' (required)' : ' (optional)'}
        </Label>
        <Textarea
          id={fieldId}
          value={note}
          onChange={event => setNote(event.target.value)}
          placeholder={copy.notePlaceholder}
          rows={3}
          aria-invalid={validationError ? true : undefined}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="min-h-11" disabled={controller.isSubmitting}>
        {controller.isSubmitting ? 'Sending request…' : 'Send request'}
      </Button>
    </form>
  );
};
