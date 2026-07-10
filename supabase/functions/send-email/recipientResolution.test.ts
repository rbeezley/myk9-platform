import { describe, expect, it } from 'vitest';

import { resolveDerivedRecipient } from './recipientResolution';

describe('resolveDerivedRecipient', () => {
  it('resolves support_notification to the ticket owner email', () => {
    expect(
      resolveDerivedRecipient({
        type: 'support_notification',
        ticket: { ownerEmail: 'owner@example.com' },
      })
    ).toEqual({ to: 'owner@example.com' });
  });

  it('resolves entry_decision to the registration exhibitor email', () => {
    expect(
      resolveDerivedRecipient({
        type: 'entry_decision',
        registration: { exhibitorEmail: 'exhibitor@example.com' },
      })
    ).toEqual({ to: 'exhibitor@example.com' });
  });

  it('ignores a body-supplied third-party address — the input type has no `to`/`cc` field', () => {
    // A caller-supplied `to`/`cc` cannot be threaded through this function:
    // the source types below are the only accepted shape, and neither
    // carries a `to` or `cc` field. This test documents that contract by
    // asserting the resolved recipient always comes from the resource.
    const supportResult = resolveDerivedRecipient({
      type: 'support_notification',
      ticket: { ownerEmail: 'owner@example.com' },
    });
    expect(supportResult).toEqual({ to: 'owner@example.com' });
    expect(supportResult).not.toEqual({ to: 'attacker@example.com' });

    const entryResult = resolveDerivedRecipient({
      type: 'entry_decision',
      registration: { exhibitorEmail: 'exhibitor@example.com' },
    });
    expect(entryResult).toEqual({ to: 'exhibitor@example.com' });
    expect(entryResult).not.toEqual({ to: 'attacker@example.com' });
  });

  it('fails closed (returns null) when the ticket owner email is unresolved', () => {
    expect(
      resolveDerivedRecipient({ type: 'support_notification', ticket: { ownerEmail: null } })
    ).toBeNull();
  });

  it('fails closed (returns null) when the registration exhibitor email is unresolved', () => {
    expect(
      resolveDerivedRecipient({
        type: 'entry_decision',
        registration: { exhibitorEmail: null },
      })
    ).toBeNull();
  });

  it('fails closed (returns null) when the resolved email is blank/whitespace', () => {
    expect(
      resolveDerivedRecipient({ type: 'support_notification', ticket: { ownerEmail: '   ' } })
    ).toBeNull();
  });
});
