import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { DeleteDogDialog } from './DeleteDogDialog';
import type { Dog } from '@/types/dog-types';
import { buildBlockedText, buildImpactSuffix, buildWarningText } from './deleteDogDialogCopy';

describe('DeleteDogDialog buildImpactSuffix', () => {
  it('is empty when the dog has no active entries', () => {
    expect(buildImpactSuffix(0)).toBe('');
  });

  it('is empty while the count is still loading (undefined)', () => {
    expect(buildImpactSuffix(undefined)).toBe('');
  });

  it('uses the singular noun for exactly one entry', () => {
    expect(buildImpactSuffix(1)).toBe(' and 1 entry');
  });

  it('uses the plural noun for multiple entries', () => {
    expect(buildImpactSuffix(2)).toBe(' and 2 entries');
  });
});

describe('DeleteDogDialog buildWarningText', () => {
  it('tells a non-admin the action cannot be undone (restore UI is admin-only)', () => {
    expect(buildWarningText(2, false)).toBe('This action cannot be undone.');
    expect(buildWarningText(0, false)).toBe('This action cannot be undone.');
  });

  it('gives an admin the restore note, dog-only when there are no entries', () => {
    expect(buildWarningText(0, true)).toBe(
      'The dog can be restored by an administrator from Admin → Deleted Items.'
    );
  });

  it('gives an admin the restore note naming entries when they cascade', () => {
    expect(buildWarningText(3, true)).toBe(
      'The dog and its entries can be restored by an administrator from Admin → Deleted Items.'
    );
  });

  it('admin restore note never claims the action cannot be undone', () => {
    expect(buildWarningText(3, true)).not.toMatch(/cannot be undone/i);
  });
});

describe('DeleteDogDialog buildBlockedText', () => {
  it('is null when nothing blocks the delete', () => {
    expect(buildBlockedText(0)).toBeNull();
    expect(buildBlockedText(undefined)).toBeNull();
  });

  it('names the count and agrees the pronoun', () => {
    expect(buildBlockedText(1)).toBe(
      'This dog has 1 paid or scored entry. Scratch or refund it before deleting.'
    );
    expect(buildBlockedText(2)).toBe(
      'This dog has 2 paid or scored entries. Scratch or refund them before deleting.'
    );
  });

  it('outranks the admin restore note — the refusal is the operative fact', () => {
    // An admin seeing "can be restored" on a delete the server will REFUSE is
    // the worst of both: it reads as reassurance about an action that will not
    // happen at all.
    expect(buildWarningText(3, true, 1)).toBe(
      'This dog has 1 paid or scored entry. Scratch or refund it before deleting.'
    );
  });
});

const dog = { id: 'dog-1', callName: 'Rex', name: 'Rex', breed: 'Border Collie' } as Dog;

// Rendered, not asserted off the copy builders: the whole point is that the
// button the user can press is unpressable. A test on buildBlockedText alone
// would pass with `confirmDisabled` never wired to anything.
describe('DeleteDogDialog blocked state', () => {
  it('disables Delete when the dog has blocking entries', () => {
    render(
      <DeleteDogDialog
        open
        onClose={() => {}}
        onDelete={() => {}}
        dog={dog}
        blockingEntryCount={1}
      />
    );

    expect(screen.getByRole('button', { name: /delete/i })).toBeDisabled();
    expect(screen.getByText(/scratch or refund it before deleting/i)).toBeInTheDocument();
  });

  it('leaves Delete enabled when nothing blocks it', () => {
    render(<DeleteDogDialog open onClose={() => {}} onDelete={() => {}} dog={dog} />);

    expect(screen.getByRole('button', { name: /delete/i })).toBeEnabled();
  });

  it('leaves Delete enabled while the blocking count is still loading', () => {
    // undefined is "unknown", not "zero" — but blocking on unknown would make a
    // slow count look like a permanent refusal. The server guard is the backstop.
    render(
      <DeleteDogDialog
        open
        onClose={() => {}}
        onDelete={() => {}}
        dog={dog}
        blockingEntryCount={undefined}
      />
    );

    expect(screen.getByRole('button', { name: /delete/i })).toBeEnabled();
  });
});
