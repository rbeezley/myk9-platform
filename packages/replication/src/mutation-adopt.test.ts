import { describe, expect, it } from 'vitest';
import { isAdoptableHeldMutation, type AdoptHeldMutationsOptions } from './mutation-adopt';
import type { PendingMutation } from './types';

const REGENERATED = 'Passcode has been regenerated; re-enter a new code';
const OPTIONS: AdoptHeldMutationsOptions = {
  showId: 'show-x',
  toAuthUserId: 'anon-2',
  rpcNames: ['ringside_update_entry'],
  failedErrorIncludes: REGENERATED,
  claim: 'judge:pat',
};

function mutation(overrides: Partial<PendingMutation> = {}): PendingMutation {
  return {
    id: 'm1',
    authUserId: 'anon-1',
    ownerIsAnonymous: true,
    showId: 'show-x',
    tableName: 'entries',
    operation: 'UPDATE',
    rowId: 'e1',
    data: {},
    timestamp: 1,
    retries: 0,
    status: 'pending',
    rpc: { name: 'ringside_update_entry', fields: {} },
    ringsideClaim: 'judge:pat',
    ...overrides,
  } as PendingMutation;
}

const deadLetter = (overrides: Partial<PendingMutation> = {}) =>
  mutation({
    status: 'failed',
    failureKind: 'authorization',
    error: `Non-retryable error: ${REGENERATED}`,
    ...overrides,
  });

describe('isAdoptableHeldMutation (MYK9-2009 dead letters)', () => {
  it('adopts a dead letter refused only because the passcode was regenerated', () => {
    expect(isAdoptableHeldMutation(deadLetter(), OPTIONS)).toBe(true);
  });

  it('adopts it even when the new session is the same anonymous user', () => {
    expect(isAdoptableHeldMutation(deadLetter({ authUserId: 'anon-2' }), OPTIONS)).toBe(true);
  });

  it('still never adopts a pending row the new session already owns', () => {
    expect(isAdoptableHeldMutation(mutation({ authUserId: 'anon-2' }), OPTIONS)).toBe(false);
  });

  it('never adopts a dead letter without the option, or refused for any other reason', () => {
    const withoutOption = { ...OPTIONS, failedErrorIncludes: undefined };
    expect(isAdoptableHeldMutation(deadLetter(), withoutOption)).toBe(false);
    expect(
      isAdoptableHeldMutation(deadLetter({ error: 'Non-retryable error: not authorized' }), OPTIONS)
    ).toBe(false);
    expect(isAdoptableHeldMutation(deadLetter({ error: undefined }), OPTIONS)).toBe(false);
  });

  it('never adopts a dead letter from another show, a signed-in owner, or another RPC', () => {
    expect(isAdoptableHeldMutation(deadLetter({ showId: 'show-y' }), OPTIONS)).toBe(false);
    expect(isAdoptableHeldMutation(deadLetter({ ownerIsAnonymous: undefined }), OPTIONS)).toBe(
      false
    );
    expect(
      isAdoptableHeldMutation(deadLetter({ rpc: { name: 'other_rpc', fields: {} } }), OPTIONS)
    ).toBe(false);
  });

  it('never adopts a dead letter from another judge claim, or with no claim stamp', () => {
    expect(isAdoptableHeldMutation(deadLetter({ ringsideClaim: 'judge:sam' }), OPTIONS)).toBe(
      false
    );
    expect(isAdoptableHeldMutation(deadLetter({ ringsideClaim: undefined }), OPTIONS)).toBe(false);
    expect(isAdoptableHeldMutation(deadLetter(), { ...OPTIONS, claim: undefined })).toBe(false);
  });

  it('leaves a pending row queued under another judge claim for that judge, but adopts an unstamped one', () => {
    expect(isAdoptableHeldMutation(mutation({ ringsideClaim: 'judge:sam' }), OPTIONS)).toBe(false);
    expect(isAdoptableHeldMutation(mutation({ ringsideClaim: undefined }), OPTIONS)).toBe(true);
  });
});

describe('isAdoptableHeldMutation (MYK9-2011 relabelled dead letters)', () => {
  const refused = (overrides: Partial<PendingMutation> = {}) =>
    deadLetter({
      failureKind: 'permanent',
      error: 'Non-retryable error: class cancelled',
      ...overrides,
    });

  it('adopts any same-claim dead letter when asked to relabel', () => {
    expect(isAdoptableHeldMutation(refused(), { ...OPTIONS, relabelFailed: true })).toBe(true);
  });

  it('never relabels without the option, under another claim, or one the session already owns', () => {
    expect(isAdoptableHeldMutation(refused(), OPTIONS)).toBe(false);
    expect(
      isAdoptableHeldMutation(refused({ ringsideClaim: 'judge:sam' }), {
        ...OPTIONS,
        relabelFailed: true,
      })
    ).toBe(false);
    expect(
      isAdoptableHeldMutation(refused({ authUserId: 'anon-2' }), {
        ...OPTIONS,
        relabelFailed: true,
      })
    ).toBe(false);
  });
});
