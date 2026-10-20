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
  it('does not pin when the cockpit disables pinning below its viewport floor', () => {
    render(
      <FocusedClassHeader eyebrow="Focused Class" title="Buried Novice A" facts="" pinMode="none" />
    );
    expect(screen.getByTestId('focused-class-header').className).not.toMatch(/sticky|top-\[/);
  });
  it('pins from lg up, under the show header and tabs, and not below lg', () => {
    render(
      <FocusedClassHeader
        eyebrow="Focused Class"
        title="Buried Novice A"
        facts="1 entry"
        pinMode="page"
      />
    );
    const header = screen.getByTestId('focused-class-header');
    expect(header).toHaveClass(...FOCUSED_CLASS_HEADER_CLASS.split(' '));
    expect(header).toHaveClass('sticky');
    expect(header.className).not.toContain('lg:');
  });

  it('in the split panel pins to the panel top, and the panel scrolls itself from lg up', () => {
    render(
      <FocusedClassHeader
        eyebrow="Focused Class"
        title="Buried Novice A"
        facts=""
        pinMode="panel"
      />
    );
    const header = screen.getByTestId('focused-class-header');
    expect(header).toHaveClass(...FOCUSED_CLASS_HEADER_CLASS_IN_PANEL.split(' '));
    expect(header).toHaveClass('top-0');
    expect(header.className).not.toContain('show-header-h');
    const panel = FOCUSED_CLASS_PANEL_CLASS.split(' ');
    expect(panel).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^sticky$/),
        expect.stringMatching(/^top-.*show-header-h/),
        expect.stringMatching(/^max-h-.*100dvh/),
        'overflow-y-auto',
      ])
    );
    panel.forEach(c => expect(c.startsWith('lg:')).toBe(false));
  });

  it('sits below the show header and the tab strip, not on top of them', () => {
    const z = (cls: string) => Number(/(?:^|\s)(?:lg:)?z-(\d+)/.exec(cls)?.[1]);
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
