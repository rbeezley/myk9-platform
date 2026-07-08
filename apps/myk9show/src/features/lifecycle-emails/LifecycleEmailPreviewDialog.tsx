import { useMemo, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  buildLifecycleEmailDraft,
  buildLifecycleEmailPreview,
  type LifecycleEmailEntryContext,
  type LifecycleEmailShowContext,
} from './render';
import type { LifecycleEmailStepType } from './types';

interface LifecycleEmailPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stepType: Extract<LifecycleEmailStepType, 'accepted' | 'waitlisted'>;
  show: LifecycleEmailShowContext;
  recipient: { name?: string | null; email?: string | null };
  entry: LifecycleEmailEntryContext;
  title?: string | undefined;
  initialSubject?: string | null | undefined;
  initialBody?: string | null | undefined;
  initialSecretaryNote?: string | null | undefined;
  notNowLabel?: string | undefined;
  isSending?: boolean | undefined;
  onSend: (values: {
    subject: string;
    body: string;
    secretaryNote: string;
  }) => void | Promise<void>;
  onNotNow: (values: { subject: string; body: string; secretaryNote: string }) => void;
}

const TITLE_BY_STEP: Record<LifecycleEmailPreviewDialogProps['stepType'], string> = {
  accepted: 'Review acceptance email',
  waitlisted: 'Review waitlist email',
};

export function LifecycleEmailPreviewDialog({
  open,
  onOpenChange,
  stepType,
  show,
  recipient,
  entry,
  title,
  initialSubject,
  initialBody,
  initialSecretaryNote,
  notNowLabel = 'Not now',
  isSending = false,
  onSend,
  onNotNow,
}: LifecycleEmailPreviewDialogProps) {
  const initialDraft = useMemo(
    () => buildLifecycleEmailDraft({ stepType, show, recipient, entry }),
    [entry, recipient, show, stepType]
  );
  const [subject, setSubject] = useState(initialSubject?.trim() || initialDraft.subject);
  const [body, setBody] = useState(initialBody?.trim() || initialDraft.body);
  const [secretaryNote, setSecretaryNote] = useState(initialSecretaryNote?.trim() || '');
  const preview = buildLifecycleEmailPreview({
    stepType,
    show,
    recipient,
    entry,
    subject,
    body,
    secretaryNote,
  });
  const values = { subject, body, secretaryNote };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title ?? TITLE_BY_STEP[stepType]}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <p className="font-medium">{recipient.name || 'Exhibitor'}</p>
            <p className="text-muted-foreground">{recipient.email || 'No email on file'}</p>
            <p className="mt-1 text-muted-foreground">
              {[entry.dogName, entry.className].filter(Boolean).join(' - ') || 'Entry decision'}
            </p>
          </div>

          {preview.warnings.length > 0 ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {preview.warnings.join(' ')}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="lifecycle-email-subject">Subject</Label>
            <Input
              id="lifecycle-email-subject"
              value={subject}
              onChange={event => setSubject(event.target.value)}
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="lifecycle-email-body">Message</Label>
            <Textarea
              id="lifecycle-email-body"
              value={body}
              onChange={event => setBody(event.target.value)}
              rows={7}
              maxLength={5000}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="lifecycle-email-note">
              Secretary note <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="lifecycle-email-note"
              value={secretaryNote}
              onChange={event => setSecretaryNote(event.target.value)}
              rows={3}
              maxLength={2000}
            />
          </div>

          <div className="rounded-md border bg-background p-3">
            <p className="mb-2 text-sm font-medium">Preview</p>
            <p className="text-sm font-semibold">{preview.subject}</p>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-muted-foreground">
              {preview.bodyText}
            </pre>
            {preview.secretaryNote ? (
              <div className="mt-3 rounded-md bg-blue-50 p-3 text-sm text-blue-950">
                <p className="font-medium">From the show secretary</p>
                <p className="mt-1 whitespace-pre-wrap">{preview.secretaryNote}</p>
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="outline" onClick={() => onNotNow(values)}>
            {notNowLabel}
          </Button>
          <Button type="button" onClick={() => onSend(values)} disabled={isSending}>
            {isSending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Sending...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" aria-hidden="true" />
                Send now
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
