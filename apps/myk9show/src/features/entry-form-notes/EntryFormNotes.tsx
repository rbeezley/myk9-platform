// MYK9-1601: private secretary notes on one entry form. Standalone section; the host
// panel decides where it sits. Online-only: offline it shows a "needs connection" state
// instead of an empty list, because an empty list would read as "no notes".

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useIsOnline } from '@/hooks/useNetworkStatus';
import { UserRole } from '@/types/auth-types';
import type { EntryFormNote } from '@/services/database/entry-form-notes';
import { useEntryFormNoteMutations, useEntryFormNotes } from './useEntryFormNotes';

export const ENTRY_FORM_NOTES_PRIVATE_LABEL = 'Private: only show officials can see notes.';
export const ENTRY_FORM_NOTES_OFFLINE_MESSAGE =
  'Notes need a connection. Reconnect to read or add notes.';

const TARGET = 'min-h-11 min-w-11';

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

interface NoteItemProps {
  note: EntryFormNote;
  canChange: boolean;
  busy: boolean;
  onSave: (id: string, body: string) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
}

function NoteItem({ note, canChange, busy, onSave, onDelete }: NoteItemProps) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState(note.body);
  const [failed, setFailed] = useState(false);

  const run = async (action: () => Promise<unknown>, done: () => void) => {
    setFailed(false);
    try {
      await action();
      done();
    } catch {
      setFailed(true);
    }
  };

  return (
    <li className="rounded-md border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">
        {note.authorName ?? 'Show official'} · {formatWhen(note.createdAt)}
      </p>
      {editing ? (
        <div className="mt-2 space-y-2">
          <Textarea
            aria-label="Edit note"
            value={draft}
            maxLength={4000}
            onChange={event => setDraft(event.target.value)}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className={TARGET}
              disabled={busy || draft.trim() === ''}
              onClick={() =>
                run(
                  () => onSave(note.id, draft),
                  () => setEditing(false)
                )
              }
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={TARGET}
              onClick={() => {
                setDraft(note.body);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-1 whitespace-pre-wrap break-words text-sm">{note.body}</p>
      )}
      {canChange && !editing && (
        <div className="mt-2 flex flex-wrap gap-2">
          {confirming ? (
            <>
              <Button
                size="sm"
                variant="destructive"
                className={TARGET}
                disabled={busy}
                onClick={() =>
                  run(
                    () => onDelete(note.id),
                    () => setConfirming(false)
                  )
                }
              >
                Confirm delete
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={TARGET}
                onClick={() => setConfirming(false)}
              >
                Keep note
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                className={TARGET}
                onClick={() => {
                  setDraft(note.body);
                  setEditing(true);
                }}
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={TARGET}
                onClick={() => setConfirming(true)}
              >
                Delete
              </Button>
            </>
          )}
        </div>
      )}
      {failed && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          Couldn&apos;t save that change. Please try again.
        </p>
      )}
    </li>
  );
}

export const ENTRY_FORM_NOTES_IDENTITY_MESSAGE =
  'Still confirming who you are. You can add notes once your account is ready.';

export const ENTRY_FORM_NOTES_NO_PROFILE_MESSAGE =
  'Your account has no profile yet, so notes cannot be added.';

interface EntryFormNotesProps {
  enrollmentId: string;
  showId: string;
  /** Bump to focus the add-note input (the form menu's "Add private note"). */
  focusRequest?: number;
}

export function EntryFormNotes({ enrollmentId, showId, focusRequest = 0 }: EntryFormNotesProps) {
  const online = useIsOnline();
  // personId is the canonical, offline-durable people.id (cached identity), not
  // userWithRoles.databaseUserId (which is userProfile?.id and so is empty on a cold boot).
  const { personId: resolvedPersonId, personIdentityState, hasRole } = useAuthContext();
  const personId = resolvedPersonId ?? undefined;
  const isSiteAdmin = hasRole(UserRole.SITE_ADMIN);
  const notes = useEntryFormNotes(enrollmentId);
  const { add, update, remove } = useEntryFormNoteMutations(enrollmentId, showId, personId);
  const [body, setBody] = useState('');
  const addRef = useRef<HTMLTextAreaElement>(null);

  // Act only when the request increases past the last one handled, so an offline->online
  // flip never re-focuses. Focus runs in a frame because Base UI's menu returns focus to its
  // trigger as it closes, which can land after this effect.
  const handledFocusRequest = useRef(0);
  useEffect(() => {
    if (!online || focusRequest <= handledFocusRequest.current) return;
    handledFocusRequest.current = focusRequest;
    const frame = requestAnimationFrame(() => {
      addRef.current?.scrollIntoView?.({ block: 'center' });
      addRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [focusRequest, online]);

  const submit = async () => {
    if (body.trim() === '') return;
    try {
      await add.mutateAsync(body);
      setBody('');
    } catch {
      // add.isError renders the message below; keep the draft so nothing typed is lost.
    }
  };

  return (
    <section aria-labelledby={`entry-form-notes-${enrollmentId}`} className="space-y-3">
      <h3 id={`entry-form-notes-${enrollmentId}`} className="text-sm font-semibold">
        Notes
      </h3>
      {/* "Show officials" is official_show_ids(): site admins, the club's secretary, chairman
          and steward, and a show-scoped steward. A steward who is also an exhibitor at their
          own club's show can read notes on their own form; that is accepted. */}
      <p className="text-xs text-muted-foreground">{ENTRY_FORM_NOTES_PRIVATE_LABEL}</p>

      {!online ? (
        <p role="status" className="text-sm text-muted-foreground">
          {ENTRY_FORM_NOTES_OFFLINE_MESSAGE}
        </p>
      ) : (
        <>
          <div className="space-y-2">
            <Textarea
              ref={addRef}
              aria-label="New note"
              placeholder="Add a note"
              value={body}
              maxLength={4000}
              onChange={event => setBody(event.target.value)}
            />
            <Button
              className={TARGET}
              disabled={add.isPending || body.trim() === '' || !personId}
              onClick={submit}
            >
              Add note
            </Button>
            {!personId && (
              <p role="status" className="text-sm text-muted-foreground">
                {personIdentityState === 'missing'
                  ? ENTRY_FORM_NOTES_NO_PROFILE_MESSAGE
                  : ENTRY_FORM_NOTES_IDENTITY_MESSAGE}
              </p>
            )}
            {add.isError && (
              <p role="alert" className="text-sm text-destructive">
                Couldn&apos;t add the note. Please try again.
              </p>
            )}
          </div>

          {notes.isPending ? (
            <p role="status" className="text-sm text-muted-foreground">
              Loading notes...
            </p>
          ) : notes.isError ? (
            <p role="alert" className="text-sm text-destructive">
              Couldn&apos;t load notes. Please try again.
            </p>
          ) : notes.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notes yet.</p>
          ) : (
            <ul className="space-y-2">
              {notes.data.map(note => (
                <NoteItem
                  key={note.id}
                  note={note}
                  canChange={isSiteAdmin || (personId !== undefined && note.createdBy === personId)}
                  busy={update.isPending || remove.isPending}
                  onSave={(id, text) => update.mutateAsync({ id, body: text })}
                  onDelete={id => remove.mutateAsync(id)}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
