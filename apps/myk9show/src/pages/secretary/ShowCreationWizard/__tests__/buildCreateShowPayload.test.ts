import { describe, it, expect } from 'vitest';
import { buildCreateShowPayload } from '../buildCreateShowPayload';
import type { WizardShowData, WizardTrial } from '../showCreationWizardTransformers';
import type { SportClassRuleRow } from '@/types/sport-template-types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const baseShow: WizardShowData = {
  name: 'Spring Scent Work',
  organization: 'AKC',
  startDate: '2026-06-01',
  endDate: '2026-06-02',
  location: 'Roseville, CA',
  clubId: 'aaaaaaaa-0000-4000-8000-000000000001',
  entryOpenDate: '2026-04-01',
  entryCloseDate: '2026-05-15',
  preEntryFee: 30,
  dayOfShowFee: 35,
  startingArmbandNumber: 100,
  officials: { secretary: ['sec-uuid'], chairman: [], steward: [] },
  judgeIds: ['judge-uuid-a', 'judge-uuid-b'],
  acceptCheckPayments: true,
  acceptCashPayments: false,
  style: 'monogram',
};

const baseTrial: WizardTrial = {
  id: 'wizard-trial-1',
  name: 'Saturday Trial',
  dateTime: '2026-06-01T09:00:00',
  eventNumber: 'EVT-001',
  trialType: 'Scent Work',
  classes: [],
};

function makeRuleMap(
  key: string,
  rule: Partial<SportClassRuleRow>
): Map<string, SportClassRuleRow> {
  return new Map([[key, rule as SportClassRuleRow]]);
}

describe('buildCreateShowPayload', () => {
  it('generates a unique show UUID on each call', () => {
    const r1 = buildCreateShowPayload(baseShow, [], {}, new Map(), 'unpublished');
    const r2 = buildCreateShowPayload(baseShow, [], {}, new Map(), 'unpublished');
    expect(r1.showId).not.toBe(r2.showId);
    expect(r1.showId).toMatch(UUID_PATTERN);
  });

  it('maps "unpublished" status to "draft" in rpcInput', () => {
    const { rpcInput } = buildCreateShowPayload(baseShow, [], {}, new Map(), 'unpublished');
    expect(rpcInput.p_show.status).toBe('draft');
  });

  it('maps "draft" status to "draft" in rpcInput', () => {
    const { rpcInput } = buildCreateShowPayload(baseShow, [], {}, new Map(), 'draft');
    expect(rpcInput.p_show.status).toBe('draft');
  });

  it('maps "published" status to "published" in rpcInput', () => {
    const { rpcInput } = buildCreateShowPayload(baseShow, [], {}, new Map(), 'published');
    expect(rpcInput.p_show.status).toBe('published');
  });

  it('passes judgeIds straight through to p_judge_ids', () => {
    const { rpcInput } = buildCreateShowPayload(baseShow, [], {}, new Map(), 'unpublished');
    expect(rpcInput.p_judge_ids).toEqual(['judge-uuid-a', 'judge-uuid-b']);
  });

  it('passes selected premium list style to the show RPC payload and local show', () => {
    const { rpcInput, localEntities } = buildCreateShowPayload(
      { ...baseShow, style: 'heritage' },
      [],
      {},
      new Map(),
      'unpublished'
    );
    expect(rpcInput.p_show.style).toBe('heritage');
    expect(localEntities.show.style).toBe('heritage');
  });

  it('defaults premium list style to monogram when the wizard value is unset', () => {
    const { style: _style, ...showWithoutStyle } = baseShow;
    const { rpcInput, localEntities } = buildCreateShowPayload(
      showWithoutStyle,
      [],
      {},
      new Map(),
      'unpublished'
    );
    expect(rpcInput.p_show.style).toBe('monogram');
    expect(localEntities.show.style).toBe('monogram');
  });

  it('generates a UUID for each trial and maps wizard IDs in trialIdMap', () => {
    const { rpcInput, trialIdMap } = buildCreateShowPayload(
      baseShow,
      [baseTrial],
      {},
      new Map(),
      'unpublished'
    );
    expect(rpcInput.p_trials).toHaveLength(1);
    const trialId = rpcInput.p_trials[0]!.id;
    expect(trialId).toMatch(UUID_PATTERN);
    expect(trialIdMap['wizard-trial-1']).toBe(trialId);
  });

  it('sets trial status to "upcoming"', () => {
    const { rpcInput } = buildCreateShowPayload(
      baseShow,
      [baseTrial],
      {},
      new Map(),
      'unpublished'
    );
    expect(rpcInput.p_trials[0]!.status).toBe('upcoming');
  });

  it('localEntities.show has _syncStatus synced and _localOnly false', () => {
    const { localEntities } = buildCreateShowPayload(baseShow, [], {}, new Map(), 'unpublished');
    expect(localEntities.show._syncStatus).toBe('synced');
    expect(localEntities.show._localOnly).toBe(false);
  });

  it('localEntities.trials have _syncStatus synced and _localOnly false', () => {
    const { localEntities } = buildCreateShowPayload(
      baseShow,
      [baseTrial],
      {},
      new Map(),
      'unpublished'
    );
    expect(localEntities.trials[0]!._syncStatus).toBe('synced');
    expect(localEntities.trials[0]!._localOnly).toBe(false);
  });

  it('class trial_id matches the real UUID from trialIdMap', () => {
    const trialWithClass: WizardTrial = {
      ...baseTrial,
      classes: [
        {
          templateId: 'tmpl-1',
          customizations: {
            element: 'Container',
            level: 'Novice',
            className: 'NW1 Containers',
          },
          judgeId: 'judge-uuid-a',
        },
      ],
    };
    const { rpcInput, trialIdMap } = buildCreateShowPayload(
      baseShow,
      [trialWithClass],
      { 'judge-uuid-a': { name: 'Jane Smith', email: '', phone: '' } },
      new Map(),
      'unpublished'
    );
    expect(rpcInput.p_classes).toHaveLength(1);
    expect(rpcInput.p_classes[0]!.trial_id).toBe(trialIdMap['wizard-trial-1']);
  });

  it('bakes timer_mode, hides_known, distraction_count, num_areas, time_limit_seconds from ruleMap', () => {
    const trialWithClass: WizardTrial = {
      ...baseTrial,
      classes: [
        {
          templateId: 'tmpl-1',
          customizations: {
            element: 'Container',
            level: 'Novice',
            className: 'NW1 Containers',
          },
        },
      ],
    };
    const ruleMap = makeRuleMap('tmpl-1|Container|Novice', {
      timer_mode: 'single',
      hides_known: true,
      distraction_count_min: 2,
      area_count: 1,
      max_time_seconds_fixed: 180,
    });
    const { rpcInput } = buildCreateShowPayload(
      baseShow,
      [trialWithClass],
      {},
      ruleMap,
      'unpublished'
    );
    const cls = rpcInput.p_classes[0]!;
    expect(cls.timer_mode).toBe('single');
    expect(cls.hides_known).toBe(true);
    expect(cls.distraction_count).toBe(2);
    expect(cls.num_areas).toBe(1);
    expect(cls.time_limit_seconds).toBe(180);
  });

  it('uses null for rule fields when ruleMap has no matching entry', () => {
    const trialWithClass: WizardTrial = {
      ...baseTrial,
      classes: [
        {
          templateId: 'tmpl-unknown',
          customizations: { element: 'Container', level: 'Novice', className: 'NW1' },
        },
      ],
    };
    const { rpcInput } = buildCreateShowPayload(
      baseShow,
      [trialWithClass],
      {},
      new Map(),
      'unpublished'
    );
    const cls = rpcInput.p_classes[0]!;
    expect(cls.timer_mode).toBeNull();
    expect(cls.hides_known).toBeNull();
    expect(cls.distraction_count).toBeNull();
  });

  it('produces an empty p_trials and p_classes array when no trials are passed', () => {
    const { rpcInput } = buildCreateShowPayload(baseShow, [], {}, new Map(), 'unpublished');
    expect(rpcInput.p_trials).toHaveLength(0);
    expect(rpcInput.p_classes).toHaveLength(0);
  });

  describe('date handling', () => {
    it('sends local-date strings (YYYY-MM-DD) for the show date columns', () => {
      // Late-evening local time whose UTC date is the next day — would land
      // as May 15 if cast in UTC.
      const lateNight = new Date(2026, 4, 14, 23, 59, 0).toISOString();
      const morning = new Date(2026, 4, 22, 8, 0, 0).toISOString();

      const { rpcInput } = buildCreateShowPayload(
        {
          ...baseShow,
          startDate: morning,
          endDate: morning,
          entryOpenDate: morning,
          entryCloseDate: lateNight,
        },
        [],
        {},
        new Map(),
        'unpublished'
      );
      expect(rpcInput.p_show.start_date).toBe('2026-05-22');
      expect(rpcInput.p_show.end_date).toBe('2026-05-22');
      expect(rpcInput.p_show.entry_open_date).toBe('2026-05-22');
      expect(rpcInput.p_show.entry_close_date).toBe('2026-05-14');
    });

    it('sends local-date strings for trial date', () => {
      const lateNight = new Date(2026, 4, 14, 23, 59, 0).toISOString();
      const { rpcInput } = buildCreateShowPayload(
        baseShow,
        [{ ...baseTrial, dateTime: lateNight }],
        {},
        new Map(),
        'unpublished'
      );
      expect(rpcInput.p_trials[0]!.date).toBe('2026-05-14');
    });

    it('passes through date-only inputs without modification', () => {
      const { rpcInput } = buildCreateShowPayload(
        { ...baseShow, startDate: '2026-06-01', endDate: '2026-06-02' },
        [],
        {},
        new Map(),
        'unpublished'
      );
      expect(rpcInput.p_show.start_date).toBe('2026-06-01');
      expect(rpcInput.p_show.end_date).toBe('2026-06-02');
    });
  });

  it('localEntities.classes have _syncStatus synced', () => {
    const trialWithClass: WizardTrial = {
      ...baseTrial,
      classes: [
        {
          templateId: 'tmpl-1',
          customizations: { element: 'Container', level: 'Novice', className: 'NW1' },
        },
      ],
    };
    const { localEntities } = buildCreateShowPayload(
      baseShow,
      [trialWithClass],
      {},
      new Map(),
      'unpublished'
    );
    expect(localEntities.classes[0]!._syncStatus).toBe('synced');
  });
});
