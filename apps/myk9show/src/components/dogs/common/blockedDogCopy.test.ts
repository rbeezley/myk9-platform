/**
 * MYK9-632: "Pull or refund" is written in FOUR places, and a dog-delete refusal
 * can arrive through any of them.
 *
 *  - `buildBlockedText` — the delete dialog's own sentence, built client-side.
 *  - `blockedDogDeleteHint` — the bulk/blocked dialog's line (lifted out of the
 *    JSX by this issue precisely so it can be asserted here).
 *  - `errorMessages` MK002 — the generic SQLSTATE table.
 *  - `translateDogDbError` — the client-side translator for the same SQLSTATE.
 *
 * They were all worded "Scratch or refund" and two of them had no test, so a
 * sweep could reword half the app and leave an exhibitor-facing "scratch" behind
 * with nothing red. Asserting them TOGETHER is the point: the contract is that
 * they agree, not that any one of them holds a particular string.
 */
import { describe, expect, it } from 'vitest';
import { buildBlockedText, blockedDogDeleteHint } from './deleteDogDialogCopy';
import { ERROR_CODE_MESSAGES } from '@/utils/errorMessages';
import { translateDogDbError } from '@/hooks/translateDogDbError';

const sources: Array<[string, string]> = [
  ['buildBlockedText (dialog sentence)', buildBlockedText(1, true) ?? ''],
  ['blockedDogDeleteHint (bulk dialog)', blockedDogDeleteHint(false)],
  // Read from the map, not through `getUserFriendlyError`: that function returns
  // the RAW message in DEV builds, so calling it here would assert the fixture
  // rather than the mapping.
  ['errorMessages MK002', ERROR_CODE_MESSAGES.MK002 ?? ''],
  [
    'translateDogDbError MK002',
    translateDogDbError({ code: 'MK002', message: 'raw pg text' }).message,
  ],
];

describe('blocked-dog delete copy — all four sources agree', () => {
  it.each(sources)('%s says Pull, never Scratch', (_name, text) => {
    expect(text).toMatch(/pull or refund/i);
    expect(text).not.toMatch(/scratch/i);
  });

  it('names the same next step in every source', () => {
    for (const [, text] of sources) {
      expect(text.toLowerCase()).toContain('pull or refund');
    }
  });
});
