import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { HandlerSelectionDialog } from '@/components/shows/RegistrationWorkflow/HandlerSelectionDialog';

/**
 * SA-008: HandlerSelectionDialog is exhibitor-reachable (registration "Change
 * Handler"). It must NOT load the bulk people directory for a plain-exhibitor
 * session — only for management sessions doing on-behalf registration. Exhibitors
 * still get freeform handler entry (default = the dog's owner), just no directory
 * typeahead. This guards the on-demand fetch path the App-level login gate misses.
 */

const h = vi.hoisted(() => ({
  loadPeople: vi.fn(),
  roles: [] as string[],
}));

vi.mock('@/store/userStore', () => ({
  useUserStore: (selector: (s: unknown) => unknown) =>
    selector({ people: [], loadPeople: h.loadPeople, isLoading: false }),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ userWithRoles: { roles: h.roles } }),
}));

const baseProps = {
  open: true,
  onOpenChange: () => {},
  selectedDogs: [] as string[],
  dogs: [],
  onHandlerAssignment: () => {},
};

describe('HandlerSelectionDialog — SA-008 directory gate', () => {
  beforeEach(() => {
    h.loadPeople.mockClear();
    cleanup();
  });

  it('does NOT load the people directory for a plain exhibitor', () => {
    h.roles = ['exhibitor'];
    render(<HandlerSelectionDialog {...baseProps} />);
    expect(h.loadPeople).not.toHaveBeenCalled();
  });

  it('loads the people directory for a secretary (on-behalf registration)', () => {
    h.roles = ['secretary'];
    render(<HandlerSelectionDialog {...baseProps} />);
    expect(h.loadPeople).toHaveBeenCalledTimes(1);
  });
});
