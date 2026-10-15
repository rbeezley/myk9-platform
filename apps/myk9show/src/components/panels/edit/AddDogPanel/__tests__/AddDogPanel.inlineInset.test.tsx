/**
 * MYK9-1081 (PR B): inside Quick Create's slide-out, the dog form's fields sit
 * the same distance from the panel edge as the Person form's. The production
 * walk at 375px found Call Name inset ~73px a side (the inline `p-6`, then the
 * Essential card's border and padding, then the call-name box's border and
 * padding), against the Person form's 24px.
 *
 * jsdom has no layout, so this sums the mobile (unprefixed) horizontal padding
 * and border widths of every rendered ancestor between a field and the form's
 * root, from the classes on the real DOM.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import { useUserStore } from '@/store/userStore';
import { resetQuickCreateMocks } from '@/test/quickCreate/quickCreateFlowMocks';
import { CreatePersonForm } from '@/components/shows/RegistrationWorkflow/CreatePersonForm';
import { AddDogPanel } from '../index';

vi.mock('@/hooks/useRBAC', () => ({ useRBAC: () => ({ hasPermission: () => false }) }));
vi.mock('@/hooks/usePeopleQuery', () => ({
  usePeopleQuery: () => ({ data: [], isLoading: false }),
}));
vi.mock(
  '@/hooks/useDogStoreCompat',
  async () => (await import('@/test/quickCreate/quickCreateFlowMocks')).dogStoreModule
);

beforeEach(() => {
  resetQuickCreateMocks();
  useUserStore.setState({ people: [], users: [] });
});

const SPACING_PX = (token: string) => (token === 'px' ? 1 : Number(token) * 4);

/** Left inset, in px, that one element's unprefixed classes add at mobile width. */
function leftInsetOf(el: Element): number {
  let padding = 0;
  let border = 0;
  for (const cls of el.classList) {
    const pad = /^p([xl])?-(\d+(?:\.\d+)?|px)$/.exec(cls);
    if (pad) padding = SPACING_PX(pad[2] as string);
    const edge = /^border(?:-([xl]))?(?:-(\d+))?$/.exec(cls);
    if (edge) border = edge[2] === undefined ? 1 : Number(edge[2]);
  }
  return padding + border;
}

/** Sum of the left insets from `field` up to and including `root`. */
function insetWithin(field: HTMLElement, root: HTMLElement): number {
  let total = 0;
  for (let el: HTMLElement | null = field.parentElement; el; el = el.parentElement) {
    total += leftInsetOf(el);
    if (el === root) return total;
  }
  throw new Error('field is not inside root');
}

describe('inline Add Dog field inset matches inline Add Person (MYK9-1081)', () => {
  it('reads the classes the way the browser lays them out (known answers)', () => {
    const el = document.createElement('div');
    el.className = 'p-6 pt-0 px-0 border border-border/30';
    expect(leftInsetOf(el)).toBe(1);
    el.className = 'rounded-xl border-0 p-4 sm:p-8';
    expect(leftInsetOf(el)).toBe(16);
  });

  it('insets Call Name and Sex by the same 24px as First Name', async () => {
    const person = render(
      <div data-testid="host">
        <CreatePersonForm
          open
          onOpenChange={vi.fn()}
          onExhibitorCreated={vi.fn()}
          variant="inline"
        />
      </div>
    );
    const personInset = insetWithin(
      await screen.findByLabelText(/First Name/i),
      screen.getByTestId('host')
    );
    person.unmount();

    const dog = render(
      <div data-testid="host">
        <AddDogPanel
          open
          onClose={vi.fn()}
          onDogCreated={vi.fn()}
          userRole={UserRole.SECRETARY}
          currentUserPersonId="person-1"
          variant="inline"
        />
      </div>
    );
    const host = screen.getByTestId('host');
    // Add Dog opens on the Registration step; a secretary may skip it to reach the fields.
    await dog.user.click(await screen.findByRole('button', { name: /No registration number yet/ }));
    const callNameInset = insetWithin(await screen.findByLabelText(/Call Name/i), host);
    const sexInset = insetWithin(document.getElementById('gender') as HTMLElement, host);

    expect(personInset).toBe(24);
    expect({ callName: callNameInset, sex: sexInset }).toEqual({ callName: 24, sex: 24 });

    // With no padding between them, a clipping ancestor would crop the fields'
    // focus rings (ring-2 is a box-shadow drawn outside the field).
    for (
      let el = screen.getByLabelText(/Call Name/i).parentElement;
      el && el !== host;
      el = el.parentElement
    ) {
      expect(el).not.toHaveClass('overflow-hidden');
    }
  });
});
