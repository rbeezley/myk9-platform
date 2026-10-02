import { describe, expect, it } from 'vitest';
import {
  blockedActionLabel,
  blockedReason,
  bulkBlockedReason,
  bulkNameList,
  cascadeSentence,
  deleteButtonLabel,
  deleteTitle,
  KEEP_LABEL,
  paidScoredPhrase,
  undoSentence,
  unknownReason,
} from './deleteObjectCopy';
import {
  classDeleteDetail,
  clubDeleteDetail,
  dogDeleteDetail,
  entryDeleteDetail,
  personDeleteDetail,
  showDeleteDetail,
  trialDeleteDetail,
} from './deleteDetail';
import { EMPTY_PREVIEW } from './deletePreview';
import type { DeleteObjectKind, DeletePreview } from './deleteTypes';

const KINDS: DeleteObjectKind[] = ['club', 'show', 'trial', 'class', 'entry', 'dog', 'person'];
const preview = (over: Partial<DeletePreview>): DeletePreview => ({ ...EMPTY_PREVIEW, ...over });
const target = (name: string) => ({ id: name, name });

describe('delete dialog copy', () => {
  it('titles name the type and the item', () => {
    expect(deleteTitle('show', [target('Heartland Scent Work Classic')])).toBe(
      'Delete the show Heartland Scent Work Classic?'
    );
    expect(deleteTitle('trial', [target('Saturday T1')])).toBe('Delete the trial Saturday T1?');
    expect(deleteTitle('class', [target('Novice Interior A')])).toBe(
      'Delete the class Novice Interior A?'
    );
    expect(deleteTitle('entry', [target('Biscuit')])).toBe('Delete the entry for Biscuit?');
    expect(deleteTitle('dog', [target('Biscuit')])).toBe('Delete the dog Biscuit?');
    expect(deleteTitle('person', [target('Jane Smith')])).toBe('Delete the person Jane Smith?');
    expect(deleteTitle('club', [target('Heartland KC')])).toBe('Delete the club Heartland KC?');
    expect(deleteTitle('person', [target('a'), target('b')])).toBe('Delete 2 people?');
    expect(deleteTitle('class', [target('a'), target('b'), target('c')])).toBe('Delete 3 classes?');
  });

  it('buttons say what they do: "Delete ‹object›" and "Keep it", never OK/Confirm/Yes', () => {
    for (const kind of KINDS) {
      expect(deleteButtonLabel(kind, 1)).toMatch(
        /^Delete (club|show|trial|class|entry|dog|person)$/
      );
    }
    expect(deleteButtonLabel('entry', 4)).toBe('Delete 4 entries');
    expect(KEEP_LABEL).toBe('Keep it');
    for (const label of [KEEP_LABEL, deleteButtonLabel('show', 1)]) {
      expect(label).not.toMatch(/^(OK|Confirm|Yes)/);
    }
  });

  it('says what goes with the item as counts in words', () => {
    expect(cascadeSentence('show', preview({ trials: 2, classes: 10, entries: 14 }), 1)).toBe(
      'This also removes its 2 trials, 10 classes and 14 entries.'
    );
    expect(cascadeSentence('trial', preview({ classes: 1, entries: 1 }), 1)).toBe(
      'This also removes its 1 class and 1 entry.'
    );
    expect(cascadeSentence('class', preview({ entries: 3 }), 2)).toBe(
      'This also removes their 3 entries.'
    );
    expect(cascadeSentence('dog', preview({ entries: 2 }), 1)).toBe(
      'This also removes its 2 entries.'
    );
    expect(cascadeSentence('show', EMPTY_PREVIEW, 1)).toBe('Nothing else goes with it.');
    expect(cascadeSentence('person', EMPTY_PREVIEW, 1)).toBe(
      'Their myK9 roles are switched off too.'
    );
    expect(cascadeSentence('entry', EMPTY_PREVIEW, 1)).toBeNull();
    expect(cascadeSentence('club', EMPTY_PREVIEW, 1)).toBeNull();
  });

  it('is honest about Undo and never claims a permanent delete', () => {
    expect(undoSentence(1)).toBe(
      'You can undo this for 10 minutes. After that, ask a myK9 administrator to restore it.'
    );
    expect(undoSentence(3)).toMatch(/restore them\.$/);
    const everything = [
      undoSentence(1),
      ...KINDS.map(kind => cascadeSentence(kind, preview({ entries: 1 }), 1) ?? ''),
      ...KINDS.map(kind =>
        blockedReason(kind, preview({ paid: 1, blocking: 1, shows: 1, dogs: 1 }))
      ),
    ].join(' ');
    expect(everything).not.toMatch(/permanent|cannot be undone/i);
  });

  it('names the paid or scored work and the path that is allowed', () => {
    expect(paidScoredPhrase(3, 0)).toBe('3 entries are paid');
    expect(paidScoredPhrase(0, 1)).toBe('1 entry is scored');
    expect(paidScoredPhrase(3, 2)).toBe('3 entries are paid and 2 are scored');
    expect(blockedReason('show', preview({ paid: 3, blocking: 3 }))).toBe(
      '3 entries are paid. Cancel the show instead of deleting it.'
    );
    expect(blockedReason('trial', preview({ scored: 2, blocking: 2 }))).toBe(
      '2 entries are scored. Withdraw or Pull those entries first.'
    );
    expect(blockedReason('entry', preview({ paid: 1, blocking: 1 }))).toBe(
      'This entry is paid. Use Withdraw or Pull instead of deleting it.'
    );
    expect(blockedReason('club', preview({ shows: 2, blocking: 2 }))).toBe(
      'This club still has 2 shows. Delete or move its shows first.'
    );
    expect(blockedReason('person', preview({ dogs: 1, blocking: 1 }))).toBe(
      'This person still owns 1 dog. Delete those dogs or give them a new owner first.'
    );
    // Pull and Withdraw are two paths, never synonyms.
    expect(blockedActionLabel('show')).toBe('Cancel show');
    for (const kind of ['trial', 'class', 'entry'] as const) {
      expect(blockedActionLabel(kind)).toBe('Withdraw / Pull entries');
    }
    expect(blockedActionLabel('dog')).toBeNull();
  });

  it('a bulk dialog lists up to five names, then "and N more"', () => {
    const many = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(target);
    expect(bulkNameList(many.slice(0, 2))).toBe('A and B');
    expect(bulkNameList(many.slice(0, 5))).toBe('A, B, C, D and E');
    expect(bulkNameList(many)).toBe('A, B, C, D, E and 2 more');
    expect(bulkBlockedReason('show', [target('Spring Show')])).toBe(
      'Spring Show has paid or scored entries. Cancel that show instead. Leave it out of the selection to delete the rest.'
    );
  });

  it('says why Delete is off when the counts are unknown', () => {
    expect(unknownReason('show', 'pending', 1)).toBe('Checking what goes with this show…');
    expect(unknownReason('dog', 'offline', 1)).toMatch(/^You're offline\./);
    expect(unknownReason('trial', 'forbidden', 1)).toBe(
      "You don't have permission to delete this trial."
    );
    expect(unknownReason('class', 'failed', 2)).toBe(
      "We couldn't check what goes with these classes, so Delete is off. Try again."
    );
  });

  it('gives each object one identifying detail', () => {
    expect(
      showDeleteDetail({ startDate: '2026-10-10', endDate: '2026-10-11', clubName: 'Heartland KC' })
    ).toBe('Oct 10–11, 2026 · Heartland KC');
    expect(trialDeleteDetail({ name: 'Saturday T1', date: '2026-10-10' })).toMatch(
      /^Saturday T1 · Oct 10, 2026$/
    );
    expect(
      classDeleteDetail({ level: 'Novice', element: 'Interior', trialLabel: 'Saturday T1' })
    ).toBe('Novice Interior · Saturday T1');
    expect(
      entryDeleteDetail({ callName: 'Biscuit', handlerName: 'Jane', className: 'Novice A' })
    ).toBe('Biscuit · handled by Jane · Novice A');
    expect(dogDeleteDetail({ callName: 'Biscuit', ownerName: 'Jane Smith' })).toBe(
      'Biscuit · owned by Jane Smith'
    );
    expect(personDeleteDetail({ email: 'jane@example.test', town: 'Ames' })).toBe(
      'jane@example.test'
    );
    expect(personDeleteDetail({ town: 'Ames' })).toBe('Ames');
    expect(clubDeleteDetail({ name: 'Heartland KC', city: 'Omaha' })).toBe('Heartland KC · Omaha');
  });
});
