/**
 * F4/F12 — the deep link that lets a class surface hand the secretary to the one place
 * that owns the show's judge roster.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SHOW_EDIT_TAB,
  SHOW_EDIT_TABS,
  SHOW_EDIT_TAB_PARAM,
  getShowEditHref,
  getShowJudgesHref,
  normalizeShowEditTab,
} from '../showEditRoutes';

describe('getShowJudgesHref', () => {
  it('opens the Edit panel on the Judges tab', () => {
    const href = getShowJudgesHref('show-1');

    // `edit=true` is the existing convention ShowManagementShell already reads.
    expect(href).toContain('/shows/show-1');
    expect(href).toContain('edit=true');
    expect(href).toContain(`${SHOW_EDIT_TAB_PARAM}=judges`);
  });

  it('omits the tab param for the default tab, keeping existing links byte-identical', () => {
    expect(getShowEditHref('show-1')).toBe('/shows/show-1?edit=true');
    expect(getShowEditHref('show-1', DEFAULT_SHOW_EDIT_TAB)).toBe('/shows/show-1?edit=true');
  });
});

describe('normalizeShowEditTab', () => {
  it.each([...SHOW_EDIT_TABS])('accepts the real tab %s', tab => {
    expect(normalizeShowEditTab(tab)).toBe(tab);
  });

  it.each([null, undefined, '', 'nope', 'JUDGES', '../etc'])(
    'falls back to the default for %s',
    raw => {
      // The value comes from a URL anyone can edit, and Tabs given a value with no
      // matching TabsContent renders an empty panel — which reads as a broken editor,
      // not as a bad link.
      expect(normalizeShowEditTab(raw)).toBe(DEFAULT_SHOW_EDIT_TAB);
    }
  );

  it('names a tab that ShowEditForm actually renders', () => {
    // A typo here would produce a link that opens the panel on nothing at all.
    expect(SHOW_EDIT_TABS).toContain('judges');
  });
});
