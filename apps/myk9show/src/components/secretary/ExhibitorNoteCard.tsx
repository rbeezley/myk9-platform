import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { MessageSquareText } from 'lucide-react';
import { EXHIBITOR_NOTE_MAX_LENGTH } from '@/hooks/queries/useShowExhibitorNote';

interface ExhibitorNoteCardProps {
  note: string;
  onSave: (note: string) => void;
  isSaving?: boolean;
}

/**
 * One optional Note to exhibitors per show (MYK9-1999). It is printed in the full confirmation
 * each exhibitor is emailed when her entry is accepted. Nothing is sent from here: the emails
 * send themselves.
 */
export function ExhibitorNoteCard({ note: savedNote, onSave, isSaving }: ExhibitorNoteCardProps) {
  const [note, setNote] = useState(savedNote);
  const hasChanges = note.trim() !== savedNote.trim();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <MessageSquareText className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <div>
            <CardTitle>Note to exhibitors</CardTitle>
            <CardDescription>
              Optional. Printed in the confirmation email each exhibitor gets when her entry is
              accepted. Use it for parking, crating or a late start.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="exhibitor-note">Note</Label>
          <Textarea
            id="exhibitor-note"
            value={note}
            onChange={event => setNote(event.target.value)}
            maxLength={EXHIBITOR_NOTE_MAX_LENGTH}
            rows={4}
            placeholder="e.g. Park in the north lot. Crating is in the barn."
          />
          <p className="text-xs text-muted-foreground">
            {note.length} of {EXHIBITOR_NOTE_MAX_LENGTH} characters. Emails already sent keep the
            note they had.
          </p>
        </div>
        {hasChanges && (
          <Button size="sm" onClick={() => onSave(note)} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save note'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
