/**
 * MYK9-1978: the two exhibitor RPCs are called with the parameter names the
 * migration defines (20261114201300), and a refusal's hint becomes a sentence.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../supabaseClient', () => ({ supabase: { rpc: mocks.rpc, from: vi.fn() } }));

import {
  cancelClassChange,
  classChangeReasonLabel,
  requestClassChange,
} from './classChangeRequests';
import {
  classChangeErrorMessage,
  CLASS_CHANGE_FALLBACK_MESSAGE,
  CLASS_CHANGE_TAKE_BACK_FALLBACK_MESSAGE,
} from './classChangeErrorMessage';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: 2, error: null });
});

describe('class change RPCs', () => {
  it('requests with the entry, the target class and the reason', async () => {
    await requestClassChange({
      entryId: 'entry-1',
      targetClassId: 'class-2',
      reason: 'wrong_section',
    });
    expect(mocks.rpc).toHaveBeenCalledWith('request_own_entry_class_change', {
      p_entry_id: 'entry-1',
      p_target_class_id: 'class-2',
      p_reason: 'wrong_section',
    });
  });

  it('takes back with the entry id', async () => {
    await cancelClassChange('entry-1');
    expect(mocks.rpc).toHaveBeenCalledWith('cancel_own_entry_class_change', {
      p_entry_id: 'entry-1',
    });
  });

  it('hands the server error back instead of throwing', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '22023', hint: 'class_full' } });
    const { error } = await requestClassChange({
      entryId: 'e',
      targetClassId: 'c',
      reason: 'wrong_level',
    });
    expect(error).toEqual({ code: '22023', hint: 'class_full' });
  });
});

describe('copy', () => {
  it('names the three reasons in plain words and ignores unknown ones', () => {
    expect(classChangeReasonLabel('finished_level')).toBe('Finished this level');
    expect(classChangeReasonLabel('wrong_level')).toBe('Entered the wrong level');
    expect(classChangeReasonLabel('wrong_section')).toBe('Wrong section');
    expect(classChangeReasonLabel('something_else')).toBeNull();
    expect(classChangeReasonLabel(null)).toBeNull();
  });

  it('never shows raw server text', () => {
    expect(classChangeErrorMessage({ message: 'Entry 22eb47a9 blew up' })).toBe(
      CLASS_CHANGE_FALLBACK_MESSAGE
    );
    expect(classChangeErrorMessage(null)).toBe(CLASS_CHANGE_FALLBACK_MESSAGE);
  });

  it('says "take back", not "send", when a take back fails', () => {
    const message = classChangeErrorMessage(null, CLASS_CHANGE_TAKE_BACK_FALLBACK_MESSAGE);
    expect(message).toMatch(/take that request back/);
    expect(message).not.toMatch(/send/);
  });
});
