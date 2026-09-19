/**
 * MYK9-639 round 3: the refusals have to REACH the secretary.
 *
 * `getUserFriendlyError` returns `error.message` only under
 * `import.meta.env.DEV`; in production it looks for a PostgREST `code`, finds
 * none on a thrown `MoveUpRpcError`, and returns "Something went wrong. Please
 * try again." So every sentence this module and the two RPCs write — including
 * the deploy-window notice, which is a PRODUCTION-ONLY condition and the whole
 * reason that branch exists — was invisible to the only person who needed it.
 */
import { describe, expect, it } from 'vitest';
import { classifyMoveUpRpcError, getMoveUpErrorMessage, MoveUpRpcError } from './moveUpEntryRpc';

describe('classifyMoveUpRpcError', () => {
  it('names the deploy window rather than blaming the data', () => {
    const error = classifyMoveUpRpcError({ code: 'PGRST202' }, 'fallback');
    expect(error.kind).toBe('not-deployed');
    expect(error.message).toMatch(/not available on this server yet/i);
    expect(error.message).toMatch(/nothing was changed/i);
  });

  it('passes the server sentence through for a refusal', () => {
    const error = classifyMoveUpRpcError(
      { code: '22023', message: 'This entry is not in a state that can be moved.' },
      'fallback'
    );
    expect(error.kind).toBe('refused');
    expect(error.message).toBe('This entry is not in a state that can be moved.');
  });

  it('turns a duplicate-key race into words, never raw constraint text', () => {
    // The RPC pre-checks this, so 23505 means a race between the check and the
    // INSERT — still a refusal, and still not
    // 'duplicate key value violates unique constraint "entries_dog_class_unique_idx"'
    // in a toast on show morning.
    const error = classifyMoveUpRpcError(
      {
        code: '23505',
        message: 'duplicate key value violates unique constraint "entries_dog_class_unique_idx"',
      },
      'fallback'
    );
    expect(error.kind).toBe('refused');
    expect(error.message).toBe('This dog is already entered in that class.');
    expect(error.message).not.toMatch(/constraint/i);
  });

  it('classifies an authorization refusal', () => {
    expect(classifyMoveUpRpcError({ code: '42501' }, 'fallback').kind).toBe('not-authorized');
  });

  it('falls back for anything it does not recognise', () => {
    expect(classifyMoveUpRpcError({ code: 'XX000' }, 'That entry could not be moved.').kind).toBe(
      'unavailable'
    );
  });
});

describe('getMoveUpErrorMessage', () => {
  it('shows the refusal, not a generic apology', () => {
    expect(
      getMoveUpErrorMessage(
        new MoveUpRpcError(
          'refused',
          'This run has already started, so the move-up can no longer be reversed.'
        ),
        'fallback'
      )
    ).toBe('This run has already started, so the move-up can no longer be reversed.');
  });

  it('shows the deploy-window notice, which only ever happens in production', () => {
    expect(getMoveUpErrorMessage(classifyMoveUpRpcError({ code: 'PGRST202' }, 'x'), 'y')).toMatch(
      /not available on this server yet/i
    );
  });

  it('hands anything else to the ordinary handler', () => {
    // A raw database error keeps its existing treatment — this helper widens
    // nothing, it only stops OUR authored sentences being thrown away.
    expect(getMoveUpErrorMessage({ weird: true }, 'That entry could not be moved.')).toBe(
      'That entry could not be moved.'
    );
  });
});
