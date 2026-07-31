import { describe, expect, it } from 'vitest';
import { CANNED_ANSWERS, answerCatalogue, findAutoSendableAnswer } from './answers';

describe('canned answer registry', () => {
  it('starts empty — phase 0 auto-sends nothing', () => {
    expect(CANNED_ANSWERS.filter(answer => answer.autoSend)).toHaveLength(0);
  });

  it('has unique ids', () => {
    const ids = CANNED_ANSWERS.map(answer => answer.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns null for an unknown id', () => {
    expect(findAutoSendableAnswer('not-a-real-answer')).toBeNull();
  });

  it('returns null for an id that exists but is not promoted', () => {
    const answers = [{ id: 'draft-only', label: 'x', whenToUse: 'x', reply: 'x', autoSend: false }];
    expect(findAutoSendableAnswer('draft-only', answers)).toBeNull();
  });

  it('returns a promoted answer', () => {
    const answers = [
      { id: 'promoted', label: 'x', whenToUse: 'x', reply: 'Here is the guide.', autoSend: true },
    ];
    expect(findAutoSendableAnswer('promoted', answers)?.reply).toBe('Here is the guide.');
  });

  it('renders a catalogue naming every answer id', () => {
    const answers = [
      {
        id: 'armband-lookup',
        label: 'Armband',
        whenToUse: 'Asks where to find armband',
        reply: 'x',
        autoSend: false,
      },
    ];
    const catalogue = answerCatalogue(answers);
    expect(catalogue).toContain('armband-lookup');
    expect(catalogue).toContain('Asks where to find armband');
  });

  it('renders a usable catalogue when there are no answers yet', () => {
    expect(answerCatalogue([])).toContain('No canned answers');
  });

  it('does not leak reply text into the catalogue shown to the model', () => {
    const answers = [
      {
        id: 'armband-lookup',
        label: 'Armband',
        whenToUse: 'Asks where to find armband',
        reply: 'SECRET-REPLY-TEXT',
        autoSend: true,
      },
    ];
    expect(answerCatalogue(answers)).not.toContain('SECRET-REPLY-TEXT');
  });
});
