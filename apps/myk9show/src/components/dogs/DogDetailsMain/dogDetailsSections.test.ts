import { describe, it, expect } from 'vitest';
import {
  parseDogDetailsState,
  applyDogDetailsState,
  LEGACY_TAB_TO_SECTION_VIEW,
  isCareerView,
  isRecordsView,
} from './dogDetailsSections';

function params(query: string) {
  return new URLSearchParams(query);
}

describe('parseDogDetailsState', () => {
  it('defaults to Overview with no view when there is no state', () => {
    expect(parseDogDetailsState(params(''))).toEqual({ section: 'overview', view: null });
  });

  it('reads a valid section/view pair', () => {
    expect(parseDogDetailsState(params('section=career&view=titles'))).toEqual({
      section: 'career',
      view: 'titles',
    });
  });

  it('falls back to the section default view when view is missing', () => {
    expect(parseDogDetailsState(params('section=records'))).toEqual({
      section: 'records',
      view: 'health',
    });
  });

  it('falls back to the section default view when view does not belong to the section', () => {
    expect(parseDogDetailsState(params('section=career&view=health'))).toEqual({
      section: 'career',
      view: 'competitions',
    });
  });

  it('ignores an unrecognized section and falls back to Overview', () => {
    expect(parseDogDetailsState(params('section=bogus'))).toEqual({
      section: 'overview',
      view: null,
    });
  });

  it.each(Object.entries(LEGACY_TAB_TO_SECTION_VIEW))(
    'maps legacy tab=%s to %j',
    (legacyTab, expected) => {
      expect(parseDogDetailsState(params(`tab=${legacyTab}`))).toEqual(expected);
    }
  );

  it('ignores an unrecognized legacy tab and falls back to Overview', () => {
    expect(parseDogDetailsState(params('tab=nonsense'))).toEqual({
      section: 'overview',
      view: null,
    });
  });

  it('prefers section/view over a stale legacy tab param', () => {
    expect(parseDogDetailsState(params('tab=pedigree&section=career&view=statistics'))).toEqual({
      section: 'career',
      view: 'statistics',
    });
  });
});

describe('applyDogDetailsState', () => {
  it('clears section/view/tab params for Overview', () => {
    const result = applyDogDetailsState(params('section=career&view=titles&tab=old&foo=bar'), {
      section: 'overview',
      view: null,
    });
    expect(result.get('section')).toBeNull();
    expect(result.get('view')).toBeNull();
    expect(result.get('tab')).toBeNull();
    expect(result.get('foo')).toBe('bar');
  });

  it('sets section only when the view is the section default', () => {
    const result = applyDogDetailsState(params(''), { section: 'career', view: 'competitions' });
    expect(result.get('section')).toBe('career');
    expect(result.get('view')).toBeNull();
  });

  it('sets section and view when the view is non-default', () => {
    const result = applyDogDetailsState(params(''), { section: 'career', view: 'titles' });
    expect(result.get('section')).toBe('career');
    expect(result.get('view')).toBe('titles');
  });

  it('strips a legacy tab param when applying new state', () => {
    const result = applyDogDetailsState(params('tab=health-records'), {
      section: 'records',
      view: 'training',
    });
    expect(result.get('tab')).toBeNull();
    expect(result.get('section')).toBe('records');
    expect(result.get('view')).toBe('training');
  });

  it('round-trips through parse', () => {
    const applied = applyDogDetailsState(params(''), { section: 'records', view: 'pedigree' });
    expect(parseDogDetailsState(applied)).toEqual({ section: 'records', view: 'pedigree' });
  });
});

describe('isCareerView / isRecordsView', () => {
  it('classifies career views', () => {
    expect(isCareerView('titles')).toBe(true);
    expect(isCareerView('health')).toBe(false);
    expect(isCareerView(null)).toBe(false);
  });

  it('classifies records views', () => {
    expect(isRecordsView('health')).toBe(true);
    expect(isRecordsView('titles')).toBe(false);
    expect(isRecordsView(null)).toBe(false);
  });
});
