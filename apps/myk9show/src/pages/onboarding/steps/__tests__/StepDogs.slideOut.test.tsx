/**
 * MYK9-1081 (PR B): onboarding's Add Dog is the right slide-out, not a centred
 * dialog. SlideOverPanel is not portaled, so its fixed overlay must not sit
 * inside a `space-y-*` stack, which would give it a top margin and shift the
 * whole overlay down the screen. The real AddDogPanel renders here; the sibling
 * StepDogs.test.tsx stubs it for the step's own behaviour.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { resetQuickCreateMocks } from '@/test/quickCreate/quickCreateFlowMocks';
import { dialogs, panel } from '@/test/quickCreate/quickCreateFlowKit';
import { StepDogs } from '../StepDogs';

vi.mock('@/hooks/usePeopleQuery', () => ({
  usePeopleQuery: () => ({ data: [], isLoading: false }),
}));
vi.mock(
  '@/hooks/useDogStoreCompat',
  async () => (await import('@/test/quickCreate/quickCreateFlowMocks')).dogStoreModule
);

beforeEach(() => {
  resetQuickCreateMocks();
});

const SPACE_STACK = /(^|\s)(\S+:)?space-[xy]-/;

describe('StepDogs Add Dog', () => {
  it('opens a slide-out whose fixed overlay is outside the step’s space-y stack', async () => {
    const { user } = render(
      <StepDogs personId="person-1" onNext={vi.fn()} onBack={vi.fn()} onSkip={vi.fn()} />
    );

    await user.click(await screen.findByRole('button', { name: /add a dog/i }));
    await screen.findByLabelText(/Call Name/i);

    expect(dialogs()).toHaveLength(1);
    const slideOut = panel() as HTMLElement;
    expect(slideOut).not.toBeNull();
    expect(within(slideOut).getByLabelText(/Call Name/i)).toBeInTheDocument();

    // The overlay root (the fixed backdrop holding the panel) is the dialog.
    const overlay = dialogs()[0] as HTMLElement;
    expect(overlay).toContainElement(slideOut);
    expect(screen.getByTestId('step-dogs')).not.toContainElement(overlay);
    for (let el = overlay.parentElement; el && el !== document.body; el = el.parentElement) {
      expect(el.className).not.toMatch(SPACE_STACK);
    }
  });
});
