import { describe, expect, it } from 'vitest';
import {
  fieldErrorsFromIssues,
  getShowDetailsValidationIssues,
  getValidationIssuesForStep,
  getValidationMessagesForStep,
} from '../showCreationWizardValidation';
import { SHOW_FIELD, trialClassesFieldId, trialFieldId } from '../wizardFieldIds';

// MYK9-1240: each wizard issue names the control it belongs to, so it can sit beside
// that control. Only an issue with no field is left to the top banner.

const blankShow = {
  name: '',
  organization: '',
  location: '',
  clubId: '',
  officials: { chairman: [], secretary: [] },
  startDate: '',
  endDate: '',
  entryOpenDate: '',
  entryCloseDate: '',
} as unknown as Parameters<typeof getShowDetailsValidationIssues>[0];

const emptyView = {
  effectiveNamesByTrialId: new Map<string, string>(),
  persistedTrialCount: 0,
  hasAnyTrials: false,
};

describe('Show Details issues name their control', () => {
  it('maps every required field of a blank show to its own control id', () => {
    const issues = getShowDetailsValidationIssues(blankShow);

    expect(fieldErrorsFromIssues(issues)).toEqual({
      [SHOW_FIELD.name]: 'Please enter a show name',
      [SHOW_FIELD.organization]: 'Please select an organization',
      [SHOW_FIELD.dates]: 'Please select a start date',
      [SHOW_FIELD.location]: 'Please enter a location',
      [SHOW_FIELD.hostClub]: 'Please select a hosting club',
      [SHOW_FIELD.chair]: 'Please select a chair',
      [SHOW_FIELD.secretary]: 'Please select a secretary',
    });
    // Nothing is left for the banner: every one of these belongs to a field.
    expect(issues.filter(issue => issue.field === null)).toEqual([]);
  });

  it('keeps the message list identical to the issue list', () => {
    expect(getValidationMessagesForStep(0, blankShow, [], emptyView)).toEqual(
      getValidationIssuesForStep(0, blankShow, [], emptyView).map(issue => issue.message)
    );
  });
});

describe('Trial and class issues', () => {
  const trial = (id: string, classes: unknown[]) => ({
    id,
    trialDate: '',
    eventNumber: '',
    trialType: undefined,
    classes: classes as never[],
  });

  it('leaves "add at least one trial" to the banner', () => {
    expect(getValidationIssuesForStep(1, blankShow, [], emptyView)).toEqual([
      { field: null, message: 'Please add at least one trial' },
    ]);
  });

  it("puts a trial type, date and AKC event number on that trial's controls", () => {
    const view = { ...emptyView, effectiveNamesByTrialId: new Map([['t1', 'Saturday']]) };
    const errors = fieldErrorsFromIssues(
      getValidationIssuesForStep(1, { ...blankShow, organization: 'AKC' }, [trial('t1', [])], view)
    );

    expect(Object.keys(errors)).toEqual(
      expect.arrayContaining([
        trialFieldId('t1', 'trialType'),
        trialFieldId('t1', 'dateTime'),
        trialFieldId('t1', 'eventNumber'),
      ])
    );
    // The control ids the step renders: the type select has always been `-type`.
    expect(trialFieldId('t1', 'trialType')).toBe('trial-t1-type');
  });

  it('puts a class-less trial on its own tab and leaves registry-rule errors to the banner', () => {
    const view = {
      ...emptyView,
      effectiveNamesByTrialId: new Map([
        ['a', 'Saturday'],
        ['b', 'Sunday'],
      ]),
    };
    const withClass = { ...trial('a', [{ templateId: 't', customizations: {} }]) };
    const issues = getValidationIssuesForStep(
      2,
      { ...blankShow, organization: 'AKC' },
      [withClass, trial('b', [])],
      view
    );

    expect(issues).toContainEqual({
      field: trialClassesFieldId('b'),
      message: 'Sunday needs at least one class',
    });
  });

  it('flags the first trial when no class is picked, and no field in add-classes scope', () => {
    const view = {
      ...emptyView,
      effectiveNamesByTrialId: new Map([['a', 'Saturday']]),
    };
    const show = { ...blankShow, organization: 'AKC' };
    expect(getValidationIssuesForStep(2, show, [trial('a', [])], view)).toEqual([
      { field: trialClassesFieldId('a'), message: 'Please add at least one class to the trials' },
    ]);
    expect(
      getValidationIssuesForStep(2, show, [trial('a', [])], view, [], {}, 'class-selection')
    ).toEqual([{ field: null, message: 'Please add at least one class to the trials' }]);
  });
});
