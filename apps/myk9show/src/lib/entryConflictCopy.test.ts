import { describe, expect, it } from 'vitest';
import { entryConflictCopy } from './entryConflictCopy';

const dog = { armband_number: '12', dog_call_name: 'Rex' };

describe('entryConflictCopy (MYK9-2010)', () => {
  it('names the dog and shows both scores on the notice and on both buttons', () => {
    const copy = entryConflictCopy(
      { ...dog, is_scored: true, result_status: 'qualified', search_time_seconds: 61.23 },
      { ...dog, is_scored: true, result_status: 'nq', total_faults: 1 }
    );
    expect(copy.title).toBe('#12 Rex was scored two ways');
    expect(copy.description).toContain('This device: Qualified, 1:01.23.');
    expect(copy.description).toContain('Saved in myK9Show: NQ, 1 fault.');
    expect(copy.takeRemoteLabel).toBe('Keep the saved score: NQ, 1 fault');
    expect(copy.keepLocalLabel).toBe('Keep my score: Qualified, 1:01.23');
  });

  it('says so when one side has no score, and falls back when the dog is unknown', () => {
    const copy = entryConflictCopy({ is_scored: true, result_status: 'qualified' }, {});
    expect(copy.title).toBe('A dog was scored two ways');
    expect(copy.takeRemoteLabel).toBe('Keep the saved score: no score yet');
  });

  it('names the dog on a conflict that involves no score', () => {
    const copy = entryConflictCopy({ ...dog }, { ...dog });
    expect(copy.title).toBe('#12 Rex has conflicting changes');
  });

  it('shows both statuses when two staff changed an unscored dog', () => {
    const copy = entryConflictCopy(
      { ...dog, check_in_status: 'at-gate' },
      { ...dog, check_in_status: 'pulled' }
    );
    expect(copy.title).toBe('#12 Rex was checked in two ways');
    expect(copy.takeRemoteLabel).toMatch(/^Keep the saved status: .*[Pp]ulled/);
    expect(copy.keepLocalLabel).toMatch(/^Keep my status: /);
    expect(copy.description).toContain('Keeping the saved status also drops anything else');
  });

  it('shows both values when two changes collide on the entry status', () => {
    const copy = entryConflictCopy(
      { ...dog, entry_status: 'scratched' },
      { ...dog, entry_status: 'withdrawn' },
      ['entry_status']
    );
    expect(copy.title).toBe('#12 Rex was checked in two ways');
    // Entry statuses use the shared entry-status words Show Desk already shows.
    expect(copy.keepLocalLabel).toBe('Keep my status: Pulled');
    expect(copy.takeRemoteLabel).toBe('Keep the saved status: Withdrawn');
  });

  it('names the field that collided on an already scored dog, not the score', () => {
    const same = { ...dog, is_scored: true, result_status: 'qualified', handler_notes: 'a' };
    const copy = entryConflictCopy(same, { ...same, handler_notes: 'b' }, ['handler_notes']);
    expect(copy.title).toBe('#12 Rex has conflicting changes');
    expect(copy.description).toContain('handler notes: this device a, saved in myK9Show b');
    expect(copy.description).not.toMatch(/other device|another device/);
    expect(copy.description).toContain('Keeping the other change also drops');
    expect(copy.description).not.toContain('Qualified');
  });

  it('adds the other collided fields when a score collision comes with them', () => {
    const copy = entryConflictCopy(
      { ...dog, is_scored: true, result_status: 'qualified', handler_notes: 'a' },
      { ...dog, is_scored: true, result_status: 'nq', handler_notes: 'b' },
      ['result_status', 'handler_notes']
    );
    expect(copy.title).toBe('#12 Rex was scored two ways');
    expect(copy.description).toContain(
      'Also changed on both: handler notes: this device a, saved in myK9Show b.'
    );
    expect(copy.description).not.toMatch(/other device|another device/);
    expect(copy.description).toContain('Keeping the saved score also drops');
  });

  it('never reformats an unknown status value into words of its own', () => {
    const copy = entryConflictCopy(
      { ...dog, check_in_status: 'at-gate' },
      { ...dog, check_in_status: 'not-a-real-status' },
      ['check_in_status']
    );
    expect(copy.takeRemoteLabel).toBe('Keep the saved status: another status');
    expect(copy.description).not.toContain('not a real status');
  });

  it('shows both entry-status words in the buttons and the description for confirmed vs withdrawn', () => {
    const copy = entryConflictCopy(
      { ...dog, entry_status: 'confirmed' },
      { ...dog, entry_status: 'withdrawn' },
      ['entry_status']
    );
    expect(copy.keepLocalLabel).toBe('Keep my status: Accepted');
    expect(copy.takeRemoteLabel).toBe('Keep the saved status: Withdrawn');
    expect(copy.description).toContain('This device: Accepted. Saved in myK9Show: Withdrawn.');
  });

  it('keeps another status only for an entry-status value no source knows', () => {
    const copy = entryConflictCopy(
      { ...dog, entry_status: 'confirmed' },
      { ...dog, entry_status: 'not-a-real-status' },
      ['entry_status']
    );
    expect(copy.takeRemoteLabel).toBe('Keep the saved status: another status');
  });
});
