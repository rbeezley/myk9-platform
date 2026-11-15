import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@/test/utils/testUtils';
import {
  FOCUSED_CLASS_HEADER_CLASS,
  FOCUSED_CLASS_HEADER_CLASS_IN_PANEL,
  FOCUSED_CLASS_PANEL_CLASS,
  FOCUSED_CLASS_HEADER_HEIGHT_VAR,
  FOCUSED_CLASS_PIN_QUERY,
  SHOW_HEADER_CLASS,
  SHOW_TAB_STRIP_CLASS,
} from '@/components/shows/ShowDetails/showStickyLayout';
import { FocusedClassHeader } from './FocusedClassHeader';

describe('FocusedClassHeader', () => {
  it('keeps the owner-approved 1024px pin floor', () => {
    expect(FOCUSED_CLASS_PIN_QUERY).toBe('(min-width: 1024px)');
  });

  it('does not pin when the cockpit disables pinning below its viewport floor', () => {
    render(
      <FocusedClassHeader
        eyebrow="Selected class"
        title="Buried Novice A"
        facts=""
        pinMode="none"
      />
    );
    expect(screen.getByTestId('focused-class-header').className).not.toMatch(/sticky|top-\[/);
  });
  it('pins from lg up, under the show header and tabs, and not below lg', () => {
    render(
      <FocusedClassHeader
        eyebrow="Selected class"
        title="Buried Novice A"
        facts="1 entry"
        pinMode="page"
      />
    );
    const header = screen.getByTestId('focused-class-header');
    expect(header).toHaveClass(...FOCUSED_CLASS_HEADER_CLASS.split(' '));
    expect(header).toHaveClass('sticky');
    expect(header.className).not.toContain('lg:');
    // Page mode offsets by the measured show header; the panel variant must not.
    expect(header.className).toContain('--show-header-h');
    expect(header).not.toHaveClass('top-0');
  });

  it('in the split panel pins to the panel top, and the panel scrolls itself from lg up', () => {
    render(
      <FocusedClassHeader
        eyebrow="Selected class"
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
      <FocusedClassHeader eyebrow="Selected class" title="Buried Novice A" facts="" />
    );
    expect(document.documentElement.style.getPropertyValue(FOCUSED_CLASS_HEADER_HEIGHT_VAR)).toBe(
      '0px'
    );
    unmount();
    expect(document.documentElement.style.getPropertyValue(FOCUSED_CLASS_HEADER_HEIGHT_VAR)).toBe(
      ''
    );
  });

  it('puts the menu in the top-right corner beside the title, with the fields under it', () => {
    render(
      <FocusedClassHeader
        eyebrow="Selected class"
        title="Buried Novice A"
        facts="1 entry"
        menu={<button type="button">Menu</button>}
      >
        <span>Field</span>
      </FocusedClassHeader>
    );
    const title = screen.getByRole('heading', { name: 'Buried Novice A' });
    const menu = screen.getByRole('button', { name: 'Menu' });
    expect(title.parentElement?.parentElement).toBe(menu.parentElement?.parentElement);
    expect(menu.parentElement?.previousElementSibling).toBe(title.parentElement);
    expect(screen.getByText('Field')).toBeInTheDocument();
  });

  it('pins only the name line; the settings follow it, unpinned, with the scroll margin they are given (MYK9-1989)', () => {
    render(
      <FocusedClassHeader
        eyebrow="Selected class · Trial 1"
        title="Buried Novice A"
        facts="5 entered"
        pinMode="panel"
        settingsClassName="scroll-mt-test"
      >
        <span>Expected start</span>
      </FocusedClassHeader>
    );
    const pinned = screen.getByTestId('focused-class-header');
    const settings = screen.getByTestId('focused-class-settings');
    // The name, which class and trial, and the facts stay on the pinned line.
    expect(pinned).toHaveTextContent('Selected class · Trial 1');
    expect(within(pinned).getByRole('heading', { name: 'Buried Novice A' })).toBeInTheDocument();
    expect(pinned).toHaveTextContent('5 entered');
    // The settings are the next sibling, not inside the pinned line, and do not pin themselves.
    expect(pinned).not.toContainElement(screen.getByText('Expected start'));
    expect(pinned.nextElementSibling).toBe(settings);
    expect(settings.className).not.toMatch(/(^|\s)sticky(\s|$)/);
    expect(settings).toHaveClass('scroll-mt-test');
  });

  it('renders no settings block without settings', () => {
    render(<FocusedClassHeader eyebrow="Selected class" title="Buried Novice A" facts="" />);
    expect(screen.queryByTestId('focused-class-settings')).not.toBeInTheDocument();
  });
});
