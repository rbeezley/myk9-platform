import { describe, expect, it } from 'vitest';
import { getSetupClassesHref, resolveSetupClassesView } from './showSetupSections';

describe('getSetupClassesHref', () => {
  it('opens Setup → Classes on the whole show by default', () => {
    expect(getSetupClassesHref('show-1')).toBe('/shows/show-1/setup?section=classes');
  });

  it('carries the view, trial, class and return link', () => {
    expect(
      getSetupClassesHref('show-1', 'in_progress', {
        trialId: 'trial-1',
        focusClassId: 'class/1',
        returnTo: '/shows/show-1/show-day?filter=in-progress',
      })
    ).toBe(
      '/shows/show-1/setup?section=classes&view=in_progress&trialId=trial-1&focus=class%2F1&returnTo=%2Fshows%2Fshow-1%2Fshow-day%3Ffilter%3Din-progress'
    );
  });

  it('keeps the default view out of the URL and refuses a view it does not have', () => {
    expect(getSetupClassesHref('show-1', 'all')).toBe('/shows/show-1/setup?section=classes');
    expect(getSetupClassesHref('show-1', 'nonsense')).toBe('/shows/show-1/setup?section=classes');
  });
});

describe('resolveSetupClassesView', () => {
  it.each(['all', 'pending', 'in_progress', 'completed', 'mine'])('opens %s', view => {
    expect(resolveSetupClassesView(view)).toBe(view);
  });

  it('reads anything else as All', () => {
    expect(resolveSetupClassesView(null)).toBe('all');
    expect(resolveSetupClassesView('in-progress')).toBe('all');
  });
});
