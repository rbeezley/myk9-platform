import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPremium, fetchPremiumFacts } from '../fetchPremium';
import { applyEditorCopyToPremium } from '../premiumEditorCopy';
import { generatedPremium } from './fixtures/generatedPremium';

const invokeMock = vi.hoisted(() => vi.fn());
const rpcMock = vi.hoisted(() => vi.fn());

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { functions: { invoke: invokeMock }, rpc: rpcMock },
}));
vi.mock('../../../services/database/supabaseClient', () => ({
  supabase: { functions: { invoke: invokeMock }, rpc: rpcMock },
}));

describe('fetchPremiumFacts (MYK9-2244)', () => {
  beforeEach(() => {
    invokeMock.mockReset().mockResolvedValue({ data: generatedPremium(), error: null });
    rpcMock.mockReset().mockResolvedValue({ data: [], error: null });
  });

  it('asks generate-premium for the facts only', async () => {
    await fetchPremiumFacts('show-1');
    expect(invokeMock).toHaveBeenCalledWith('generate-premium', {
      body: { show_id: 'show-1', factsOnly: true },
    });
  });

  it('a normal generation still asks for the narratives', async () => {
    await fetchPremium('show-1', false);
    expect(invokeMock).toHaveBeenCalledWith('generate-premium', { body: { show_id: 'show-1' } });
  });
});

describe('applyEditorCopyToPremium', () => {
  it('overlays only the narratives, supplemental fields and style', () => {
    const facts = generatedPremium();
    facts.show = { ...facts.show, address: '12 Pine Rd', maxTotalEntries: 60 };
    const copy = {
      style: 'poster',
      narratives: { showHours: 'Edited hours', trialInformation: 'Edited info' },
      supplemental: { ...facts.supplemental, hospitalityNotes: 'Coffee' },
    };

    const result = applyEditorCopyToPremium(facts, copy);

    expect(result.show).toEqual(facts.show);
    expect(result.trials).toBe(facts.trials);
    expect(result.secretary).toBe(facts.secretary);
    expect(result.style).toBe('poster');
    expect(result.narratives).toEqual(copy.narratives);
    expect(result.supplemental.hospitalityNotes).toBe('Coffee');
  });
});
