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
