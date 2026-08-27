import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFrom, mockRpc } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: mockFrom,
    rpc: mockRpc,
  },
}));

vi.mock('@/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
  },
}));

import { resolveHideCountsForClassRows } from './resolveClassHideCounts';

interface TrialFixture {
  id: string;
  show_id: string;
  registry_id: string;
}

interface RuleFixture {
  element: string;
  level: string | null;
  section: string | null;
  hide_count_fixed: number | null;
  hides_known: boolean;
  sport_templates: { organization: string };
}

const classRows = [
  {
    id: 'akc-excellent',
    trial_id: 'akc-trial',
    element: 'Interior',
    level: 'Excellent',
    section: null,
  },
  {
    id: 'akc-master',
    trial_id: 'akc-trial',
    element: 'Buried',
    level: 'Master',
    section: null,
  },
  {
    id: 'akc-detective',
    trial_id: 'akc-trial',
    element: 'Detective',
    level: null,
    section: null,
  },
  {
    id: 'akc-hd-master',
    trial_id: 'akc-trial',
    element: 'Handler Discrimination',
    level: 'Master',
    section: null,
  },
  {
    id: 'ukc-hd-master',
    trial_id: 'ukc-trial',
    element: 'Handler Discrimination',
    level: 'Master',
    section: 'A',
  },
  {
    id: 'asca-excellent',
    trial_id: 'asca-trial',
    element: 'Interior',
    level: 'Excellent',
    section: null,
  },
] as const;

const trials: TrialFixture[] = [
  { id: 'akc-trial', show_id: 'show-1', registry_id: 'AKC' },
  { id: 'ukc-trial', show_id: 'show-1', registry_id: 'UKC' },
  { id: 'asca-trial', show_id: 'show-1', registry_id: 'ASCA' },
];

const publicRules: RuleFixture[] = [
  {
    element: 'Interior',
    level: 'Excellent',
    section: null,
    hide_count_fixed: 3,
    hides_known: true,
    sport_templates: { organization: 'AKC' },
  },
  {
    element: 'Handler Discrimination',
    level: 'Master',
    section: null,
    hide_count_fixed: 3,
    hides_known: true,
    sport_templates: { organization: 'AKC' },
  },
  {
    element: 'Handler Discrimination',
    level: 'Master',
    section: 'A',
    hide_count_fixed: 1,
    hides_known: true,
    sport_templates: { organization: 'UKC' },
  },
];

function mockReferenceQueries(options?: { ruleError?: { message: string } }) {
  const trialIn = vi.fn().mockResolvedValue({ data: trials, error: null });
  const trialSelect = vi.fn().mockReturnValue({ in: trialIn });

  const ruleNot = vi.fn().mockResolvedValue({
    data: options?.ruleError ? null : publicRules,
    error: options?.ruleError ?? null,
  });
  const ruleEq = vi.fn().mockReturnValue({ not: ruleNot });
  const ruleIn = vi.fn().mockReturnValue({ eq: ruleEq });
  const ruleSelect = vi.fn().mockReturnValue({ in: ruleIn });

  mockFrom.mockImplementation((table: string) => {
    if (table === 'trials') return { select: trialSelect };
    if (table === 'sport_class_rules') return { select: ruleSelect };
    throw new Error(`Unexpected table: ${table}`);
  });

  return { trialSelect, ruleIn };
}

describe('resolveHideCountsForClassRows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns only registry-matched public fixed counts to a caller without official access', async () => {
    const { trialSelect, ruleIn } = mockReferenceQueries();
    mockRpc.mockResolvedValue({ data: [], error: null });

    await expect(resolveHideCountsForClassRows(classRows)).resolves.toEqual(
      new Map([
        ['akc-excellent', 3],
        ['akc-hd-master', 3],
        ['ukc-hd-master', 1],
      ])
    );

    expect(trialSelect).toHaveBeenCalledWith('id, show_id, registry_id');
    expect(ruleIn).toHaveBeenCalledWith('sport_templates.organization', ['AKC', 'UKC', 'ASCA']);
  });

  it('lets authorized RPC values override public rule-derived values', async () => {
    mockReferenceQueries();
    mockRpc.mockResolvedValue({
      data: [
        { class_id: 'akc-master', num_hides: 4 },
        { class_id: 'akc-excellent', num_hides: 99 },
      ],
      error: null,
    });

    const result = await resolveHideCountsForClassRows(classRows);

    expect(result.get('akc-master')).toBe(4);
    expect(result.get('akc-excellent')).toBe(99);
    expect(result.get('akc-detective')).toBeUndefined();
    expect(mockRpc).toHaveBeenCalledWith('get_show_class_hide_counts', {
      p_show_id: 'show-1',
    });
  });

  it('keeps official counts when public rule lookup fails', async () => {
    mockReferenceQueries({ ruleError: { message: 'rule lookup failed' } });
    mockRpc.mockResolvedValue({
      data: [{ class_id: 'akc-master', num_hides: 4 }],
      error: null,
    });

    await expect(resolveHideCountsForClassRows(classRows)).resolves.toEqual(
      new Map([['akc-master', 4]])
    );
  });

  it('keeps public fixed counts when the official RPC fails', async () => {
    mockReferenceQueries();
    mockRpc.mockResolvedValue({ data: null, error: { message: 'not authorized' } });

    await expect(resolveHideCountsForClassRows(classRows)).resolves.toEqual(
      new Map([
        ['akc-excellent', 3],
        ['akc-hd-master', 3],
        ['ukc-hd-master', 1],
      ])
    );
  });
});
