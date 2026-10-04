import { describe, it, expect } from 'vitest';
import { buildCreateShowPayload } from '../buildCreateShowPayload';
import {
  showToShowInput,
  transformWizardDataToShow,
  type WizardShowData,
} from '../showCreationWizardTransformers';
import { seedJuniorHandlerFee, wizardJuniorHandlerFee } from '../wizardJuniorHandlerFee';
import { createWizardTrialView } from '@/utils/wizardTrialNames';

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
  officials: { secretary: [], chairman: [], steward: [] },
  judgeIds: [],
  acceptCheckPayments: true,
  acceptCashPayments: false,
  onlineEntriesEnabled: false,
  style: 'monogram',
};

const build = (show: WizardShowData) =>
  buildCreateShowPayload(show, [], {}, new Map(), 'unpublished', createWizardTrialView([], []));

describe('wizardJuniorHandlerFee', () => {
  it.each([
    ['a positive fee', { organization: 'AKC', juniorHandlerFee: 15 }, 15],
    ['a cents fee', { organization: 'UKC', juniorHandlerFee: 12.5 }, 12.5],
    ['zero (no junior tier)', { organization: 'AKC', juniorHandlerFee: 0 }, undefined],
    ['unset', { organization: 'AKC' }, undefined],
    ['NaN', { organization: 'AKC', juniorHandlerFee: Number.NaN }, undefined],
    ['a negative', { organization: 'AKC', juniorHandlerFee: -5 }, undefined],
    [
      'an ASCA show that kept a typed fee',
      { organization: 'ASCA', juniorHandlerFee: 15 },
      undefined,
    ],
  ])('%s', (_label, show, expected) => {
    expect(wizardJuniorHandlerFee(show)).toBe(expected);
  });

  it('seeds a positive stored fee and nothing else', () => {
    expect(seedJuniorHandlerFee('15')).toEqual({ juniorHandlerFee: 15 });
    expect(seedJuniorHandlerFee('0')).toEqual({});
    expect(seedJuniorHandlerFee('')).toEqual({});
    expect(seedJuniorHandlerFee(undefined)).toEqual({});
  });
});

describe('an over-limit fee cannot reach a save (step-rail bypass)', () => {
  // The Details step blocks it on Next, but the step rail can jump back to Review and save
  // without revalidating Details. Every write path must refuse it by itself.
  const over = { ...baseShow, juniorHandlerFee: 100000 };

  it('refuses in buildCreateShowPayload, before any RPC is built', () => {
    expect(() => build(over)).toThrow('Junior handler fee must be less than $100,000');
  });

  it('refuses in transformWizardDataToShow, which the edit and offline saves use', () => {
    expect(() =>
      transformWizardDataToShow(
        over,
        [],
        {},
        [],
        'unpublished',
        undefined,
        createWizardTrialView([], [])
      )
    ).toThrow('Junior handler fee must be less than $100,000');
  });

  it('does not refuse an ASCA draft holding a stale over-limit fee', () => {
    expect(() => build({ ...over, organization: 'ASCA' })).not.toThrow();
  });
});

describe('junior handler fee through show creation', () => {
  it('sends the fee to create_show_with_children and the local show', () => {
    const { rpcInput, localEntities } = build({ ...baseShow, juniorHandlerFee: 15 });
    expect(rpcInput.p_show.junior_handler_fee).toBe(15);
    expect(localEntities.show.juniorHandlerFee).toBe(15);
  });

  it.each([
    ['unset', { ...baseShow }],
    ['zero', { ...baseShow, juniorHandlerFee: 0 }],
    ['ASCA', { ...baseShow, organization: 'ASCA', juniorHandlerFee: 15 }],
  ])('names no junior_handler_fee key when the fee is %s', (_label, show) => {
    const { rpcInput, localEntities } = build(show);
    // An absent key keeps creation working against a database without the column
    // and an un-updated create_show_with_children.
    expect('junior_handler_fee' in rpcInput.p_show).toBe(false);
    expect('juniorHandlerFee' in localEntities.show).toBe(false);
  });

  it('carries the fee as a string through transformWizardDataToShow and showToShowInput', () => {
    const view = createWizardTrialView([], []);
    const withFee = transformWizardDataToShow(
      { ...baseShow, juniorHandlerFee: 15 },
      [],
      {},
      [],
      'unpublished',
      undefined,
      view
    );
    expect(withFee.juniorHandlerFee).toBe('15');
    expect(showToShowInput(withFee).juniorHandlerFee).toBe('15');

    const without = transformWizardDataToShow(baseShow, [], {}, [], 'unpublished', undefined, view);
    expect('juniorHandlerFee' in without).toBe(false);
    expect('juniorHandlerFee' in showToShowInput(without)).toBe(false);
  });
});
