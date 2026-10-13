import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Tabs } from '@/components/ui/tabs';
import { TabNavigation } from '../TabNavigation';

/**
 * 4.E — the green "complete" check reads as "this section is done". It must only
 * appear where "done" is meaningful: the required Essential tab, and a
 * registration the user has actually started and completed. The Optional tab
 * has no required fields and must never show a check (its old unconditional
 * "complete" check told novices they'd finished something they never touched).
 */
function renderTabs(props: React.ComponentProps<typeof TabNavigation>) {
  return render(
    <Tabs value="basic">
      <TabNavigation {...props} />
    </Tabs>
  );
}

// The green completion check is the only element styled text-emerald-500.
const checkCount = (container: HTMLElement) =>
  container.querySelectorAll('.text-emerald-500').length;

describe('TabNavigation completion indicators (4.E)', () => {
  it('labels the third tab "Optional details" and never checks it', () => {
    const { container } = renderTabs({
      isBasicValid: true,
      hasRegistrations: false,
      isRegistrationValid: true,
    });
    expect(screen.getByText('Optional details')).toBeInTheDocument();
    // Only the Essential tab is complete here → exactly one check.
    expect(checkCount(container)).toBe(1);
  });

  it('checks Essential when its required fields are valid', () => {
    const { container } = renderTabs({
      isBasicValid: true,
      hasRegistrations: false,
      isRegistrationValid: true,
    });
    expect(checkCount(container)).toBe(1);
  });

  it('does NOT check Essential when invalid', () => {
    const { container } = renderTabs({
      isBasicValid: false,
      hasRegistrations: false,
      isRegistrationValid: true,
    });
    expect(checkCount(container)).toBe(0);
  });

  it('does NOT check an untouched (empty) Registration tab', () => {
    // isRegistrationValid is true for an empty set, but "untouched" must not read
    // as "complete".
    const { container } = renderTabs({
      isBasicValid: false,
      hasRegistrations: false,
      isRegistrationValid: true,
    });
    expect(checkCount(container)).toBe(0);
  });

  it('checks Registration only once started AND valid', () => {
    const { container } = renderTabs({
      isBasicValid: false,
      hasRegistrations: true,
      isRegistrationValid: true,
    });
    expect(checkCount(container)).toBe(1);
  });

  it('does NOT check a started-but-incomplete Registration', () => {
    const { container } = renderTabs({
      isBasicValid: false,
      hasRegistrations: true,
      isRegistrationValid: false,
    });
    expect(checkCount(container)).toBe(0);
  });
});

/**
 * MYK9-1081: inside Quick Create's 375px slide-out the default strip overflowed
 * "Registration" and "Optional details" into their neighbours (measured in
 * Montserrat with Playwright; see the `compact` prop). Below `sm` the compact
 * strip drops the decorative icons and lets a label wrap; the panel variant
 * keeps its strip as it was.
 */
describe('TabNavigation compact (inline) strip', () => {
  const tabs = () => screen.getAllByRole('tab');
  const leadingIcons = () => tabs().map(tab => tab.querySelector('svg') as SVGElement);
  const props = { isBasicValid: true, hasRegistrations: true, isRegistrationValid: true };

  it('hides the leading icons and lets labels wrap below sm', () => {
    renderTabs({ ...props, compact: true });
    for (const icon of leadingIcons()) expect(icon).toHaveClass('hidden', 'sm:block');
    for (const tab of tabs()) {
      expect(tab).toHaveClass('whitespace-normal', 'px-0', 'text-[11px]', 'sm:px-4', 'sm:text-sm');
      expect(tab).not.toHaveClass('whitespace-nowrap', 'px-4');
    }
    // The completion checks still show: they carry meaning, the icons do not.
    expect(screen.getAllByRole('tab')[0]?.querySelectorAll('.text-emerald-500')).toHaveLength(1);
  });

  it('takes the completion check out of the row below sm so it cannot be squeezed away', () => {
    renderTabs({ ...props, compact: true });
    const check = screen.getAllByRole('tab')[0]?.querySelector('.text-emerald-500');
    expect(check).toHaveClass('absolute', 'sm:static');
    expect(screen.getAllByRole('tab')[0]).toHaveClass('relative');
  });

  it('leaves the default strip unchanged', () => {
    renderTabs(props);
    for (const icon of leadingIcons()) expect(icon).not.toHaveClass('hidden');
    for (const tab of tabs()) expect(tab).toHaveClass('whitespace-nowrap', 'px-4');
  });
});
