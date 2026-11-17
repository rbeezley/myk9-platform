/**
 * MYK9-2149: the desk reads what a form owes (negative = money held) from the server, and
 * says what is still owed after submit in plain words.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/lib/supabase';
import {
  deskFormOutcomeLabel,
  fetchDeskFormDueCents,
  formHoldsBannerLabel,
  heldCentsFromDue,
} from './deskFormDue';

vi.mock('@/lib/supabase', () => ({ supabase: { rpc: vi.fn() } }));

describe('deskFormDue (MYK9-2149)', () => {
  beforeEach(() => {
    vi.mocked(supabase.rpc).mockReset();
  });

  it('asks desk_form_due_cents for the show and the exhibitor', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: -4000, error: null } as never);

    await expect(fetchDeskFormDueCents('show-1', 'owner-1')).resolves.toBe(-4000);
    expect(supabase.rpc).toHaveBeenCalledWith('desk_form_due_cents', {
      p_show_id: 'show-1',
      p_handler_id: 'owner-1',
    });
  });

  it('throws on an error, so the desk fails closed', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: 'no' } } as never);

    await expect(fetchDeskFormDueCents('show-1', 'owner-1')).rejects.toBeTruthy();
  });

  it('reads held money only from a negative due', () => {
    expect(heldCentsFromDue(-4000)).toBe(4000);
    expect(heldCentsFromDue(0)).toBe(0);
    expect(heldCentsFromDue(2000)).toBe(0);
  });

  it('words what the form holds and what is still owed, without dashes', () => {
    expect(formHoldsBannerLabel(4000)).toBe(
      "This form already holds $40.00. To use it, choose 'Use the money already on this form'. Record anything still owed on the entry form after submitting."
    );
    expect(deskFormOutcomeLabel(2000)).toBe(
      'Still owed on this form: $20.00. Record it on the entry form when you take it.'
    );
    expect(deskFormOutcomeLabel(0)).toBe('Nothing is owed on this form now.');
    expect(deskFormOutcomeLabel(-1000)).toBe('Nothing is owed on this form now.');
    expect(deskFormOutcomeLabel(null)).toBe(
      'Could not check what is owed on this form. Open the entry form to check.'
    );
  });
});
