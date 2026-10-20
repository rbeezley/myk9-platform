import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import {
  FOCUSED_CLASS_HEADER_CLASS,
  FOCUSED_CLASS_HEADER_CLASS_IN_PANEL,
  FOCUSED_CLASS_PANEL_CLASS,
  FOCUSED_CLASS_HEADER_HEIGHT_VAR,
  SHOW_HEADER_CLASS,
  SHOW_TAB_STRIP_CLASS,
} from '@/components/shows/ShowDetails/showStickyLayout';
import { FocusedClassHeader } from './FocusedClassHeader';

describe('FocusedClassHeader', () => {
  it('pins from lg up, under the show header and tabs, and not below lg', () => {
    render(<FocusedClassHeader eyebrow="Focused Class" title="Buried Novice A" facts="1 entry" />);
    const header = screen.getByTestId('focused-class-header');
    expect(header).toHaveClass(...FOCUSED_CLASS_HEADER_CLASS.split(' '));
    // Every pinning class is lg-prefixed, so nothing sticks on a phone.
    const pinning = FOCUSED_CLASS_HEADER_CLASS.split(' ').filter(c => /sticky|top-|z-/.test(c));
    expect(pinning.length).toBeGreaterThan(0);
    pinning.forEach(c => expect(c.startsWith('lg:')).toBe(true));
    expect(header.className).not.toMatch(/(^|\s)sticky/);
  });

  it('in the split panel pins to the panel top, and the panel scrolls itself from lg up', () => {
    render(<FocusedClassHeader eyebrow="Focused Class" title="Buried Novice A" facts="" inPanel />);
    const header = screen.getByTestId('focused-class-header');
    expect(header).toHaveClass(...FOCUSED_CLASS_HEADER_CLASS_IN_PANEL.split(' '));
    expect(header).toHaveClass('top-0');
    expect(header.className).not.toContain('show-header-h');
    const panel = FOCUSED_CLASS_PANEL_CLASS.split(' ');
    expect(panel).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^lg:sticky$/),
        expect.stringMatching(/^lg:top-.*show-header-h/),
        expect.stringMatching(/^lg:max-h-.*100dvh/),
        'lg:overflow-y-auto',
      ])
    );
    panel.forEach(c => expect(c.startsWith('lg:')).toBe(true));
  });

  it('sits below the show header and the tab strip, not on top of them', () => {
    const z = (cls: string) => Number(/lg:z-(\d+)/.exec(cls)?.[1]);
    expect(z(FOCUSED_CLASS_HEADER_CLASS)).toBeLessThan(z(SHOW_HEADER_CLASS));
    expect(z(FOCUSED_CLASS_HEADER_CLASS)).toBeLessThan(z(SHOW_TAB_STRIP_CLASS));
    // Offset = app header + the show header's measured height + the 3rem tab strip.
    expect(FOCUSED_CLASS_HEADER_CLASS).toContain('var(--show-header-h,4.25rem)+3rem');
  });

  it('publishes its height for scroll margins and removes it on unmount', () => {
    const { unmount } = render(
      <FocusedClassHeader eyebrow="Focused Class" title="Buried Novice A" facts="" />
    );
    expect(document.documentElement.style.getPropertyValue(FOCUSED_CLASS_HEADER_HEIGHT_VAR)).toBe(
      '0px'
    );
    unmount();
    expect(document.documentElement.style.getPropertyValue(FOCUSED_CLASS_HEADER_HEIGHT_VAR)).toBe(
      ''
    );
  });
});
