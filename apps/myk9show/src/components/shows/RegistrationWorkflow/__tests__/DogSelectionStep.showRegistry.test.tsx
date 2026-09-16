/**
 * MYK9-569 — the dog card must say which registration this show will use, and
 * must not let an exhibitor walk into `trg_entries_require_dog_registration`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { DogSelectionStep } from '@/components/shows/RegistrationWorkflow/DogSelectionStep';
import type { Dog, Registration } from '@/types/dog-types';
import { fromPartial } from '@total-typescript/shoehorn';

vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: vi.fn(),
}));

import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';

// Live shape: `dog_registrations.organization` holds the LONG form on every row
// (271 each of AKC/UKC/ASCA, zero bare). The card must not render it raw
// (LESSONS label-rule-vs-real-columns).
const registration = (overrides: Partial<Registration>): Registration => ({
  id: 'reg',
  organization: 'AKC (American Kennel Club)',
  registeredName: 'Champion Maple',
  breed: 'Golden Retriever',
  registrationNumber: 'SR12345601',
  status: 'Active',
  ...overrides,
});

const AKC = registration({ id: 'reg-akc' });
const UKC = registration({
  id: 'reg-ukc',
  organization: 'UKC (United Kennel Club)',
  registrationNumber: 'P987-654',
});
const ASCA = registration({
  id: 'reg-asca',
  organization: 'ASCA (Australian Shepherd Club of America)',
  registrationNumber: 'E123456',
});

const mockDog = (registrations: Registration[], registrationsReadComplete = true): Dog =>
  fromPartial<Dog>({
    id: 'dog-1',
    name: 'Champion Maple',
    callName: 'Maple',
    breed: 'Golden Retriever',
    gender: 'Female',
    ownerId: 'owner-1',
    dateOfBirth: '2020-01-01',
    status: 'active',
    registrations,
    registrationsReadComplete,
  });

const mountWith = (
  registrations: Registration[],
  showRegistryId?: string,
  registrationsReadComplete = true
) => {
  vi.mocked(useDogStoreCompat).mockReturnValue(
    fromPartial({ dogs: [mockDog(registrations, registrationsReadComplete)], isLoading: false })
  );
  const onSelectionChange = vi.fn();
  return {
    onSelectionChange,
    ...render(
      <DogSelectionStep
        selectedDogs={[]}
        onSelectionChange={onSelectionChange}
        {...(showRegistryId ? { showRegistryId } : {})}
      />
    ),
  };
};

/**
 * Queried by ROLE, not by styling. A reviewer turned `opacity-60` into
 * `opacity-0` — hiding every badge — and the whole suite stayed green, because
 * nothing asserted what the de-emphasis was allowed to be.
 */
const usedBadge = () => document.querySelector('[data-registration-role="used"]');
const otherBadges = () => Array.from(document.querySelectorAll('[data-registration-role="other"]'));

/**
 * Opacity on text is banned here: `text-muted-foreground` at 60% opacity
 * composites to roughly 2.5:1 at 12px, under the 4.5:1 AA floor. The token
 * colour alone carries the de-emphasis.
 */
const expectNoOpacityOnAnyBadge = () => {
  const badges = Array.from(document.querySelectorAll('[data-registration-role]'));
  expect(badges.length).toBeGreaterThan(0);
  for (const badge of badges) {
    expect(badge.className).not.toMatch(/\bopacity-/);
  }
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DogSelectionStep — the registration this show will use', () => {
  it('marks the matching registration and de-emphasizes the others', () => {
    mountWith([AKC, UKC, ASCA], 'AKC');

    // The whole point of the label rule: the long form is normalized for
    // display, and the accessible name reads as a sentence, not a run-on.
    expect(usedBadge()!.textContent).toBe('AKC: SR12345601, Used for this show');

    const others = otherBadges();
    expect(others).toHaveLength(2);
    expect(others.map(node => node.textContent)).toEqual(['UKC: P987-654', 'ASCA: E123456']);
    // Shown, not hidden — she still needs to see her dog's other numbers exist.
    for (const other of others) {
      expect(other).toBeVisible();
    }
    expectNoOpacityOnAnyBadge();
    expect(screen.queryByText(/registration to enter this show/)).not.toBeInTheDocument();
  });

  it.each([
    ['UKC', 'P987-654'],
    ['ASCA', 'E123456'],
  ])('marks the %s registration for that show', (registry, expectedNumber) => {
    mountWith([AKC, UKC, ASCA], registry);

    expect(usedBadge()!.textContent).toBe(`${registry}: ${expectedNumber}, Used for this show`);
    expect(otherBadges()).toHaveLength(2);
    expectNoOpacityOnAnyBadge();
  });

  it('names the fix when no registration matches, and still lets her select the dog', async () => {
    const { onSelectionChange, user } = mountWith([UKC, ASCA], 'AKC');

    // Announced when the registry resolves mid-view, not merely rendered.
    // (`status` is not a name-from-content role, so assert the element itself.)
    const message = screen.getByText(/Add an AKC registration to enter this show/);
    expect(message).toHaveAttribute('role', 'status');
    expect(usedBadge()).toBeNull();
    // The fix is one tap away, not a dead end.
    expect(screen.getByRole('button', { name: /Add registration/ })).toBeInTheDocument();

    // Selection is deliberately NOT blocked here. The per-trial registry — and
    // the conformation-puppy carve-out the DB trigger honours — are known at
    // class selection, which already refuses the class. Blocking show-wide at
    // step 1 stranded a dog selected before the registry resolved.
    expect(screen.getByRole('checkbox', { name: /Select Maple/ })).not.toHaveAttribute(
      'aria-disabled',
      'true'
    );
    await user.click(screen.getByText(/Golden Retriever/));
    expect(onSelectionChange).toHaveBeenCalledWith(['dog-1']);
  });

  it('renders a blank-numbered registration as the label alone, with no dangling colon', () => {
    const blank = registration({
      id: 'reg-blank',
      organization: 'ASCA (Australian Shepherd Club of America)',
      registrationNumber: '  ',
    });
    mountWith([AKC, blank], 'AKC');

    const other = otherBadges()[0];
    expect(other!.textContent).toBe('ASCA');
  });

  it('says nothing about this show when the registration read did not complete', () => {
    mountWith([], 'AKC', false);

    expect(usedBadge()).toBeNull();
    expect(screen.queryByText(/registration to enter this show/)).not.toBeInTheDocument();
    expect(screen.queryByText(/No registration on file/)).not.toBeInTheDocument();
  });

  it("leaves an incomplete read's surviving registrations unmuted and unmarked", () => {
    mountWith([AKC, UKC], 'AKC', false);

    expect(usedBadge()).toBeNull();
    expect(otherBadges()).toHaveLength(2);
    expectNoOpacityOnAnyBadge();
  });

  it('marks nothing and says nothing when the show registry is not known yet', async () => {
    const { onSelectionChange, user } = mountWith([AKC, UKC], undefined);

    expect(usedBadge()).toBeNull();
    expect(screen.queryByText(/registration to enter this show/)).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Select Maple/ })).not.toHaveAttribute(
      'aria-disabled',
      'true'
    );
    await user.click(screen.getByText(/Golden Retriever/));
    expect(onSelectionChange).toHaveBeenCalledWith(['dog-1']);
  });
});
