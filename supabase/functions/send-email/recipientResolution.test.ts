import { describe, expect, it } from 'vitest';

import { resolveDerivedRecipient } from './recipientResolution';

const showCc = (ccSecretaryOnExhibitorEmails: boolean | null, secretaryEmail: string | null) => ({
  ccSecretaryOnExhibitorEmails,
  secretaryEmail,
});

describe('resolveDerivedRecipient', () => {
  it('resolves support_notification to the ticket owner email', () => {
    expect(
      resolveDerivedRecipient({
        type: 'support_notification',
        ticket: { ownerEmail: 'owner@example.com' },
      })
    ).toEqual({ to: 'owner@example.com' });
  });

  it('resolves entry_decision to the exhibitor email + server-derived secretary cc', () => {
    expect(
      resolveDerivedRecipient({
        type: 'entry_decision',
        registration: {
          exhibitorEmail: 'exhibitor@example.com',
          show: showCc(true, 'sec@example.com'),
        },
      })
    ).toEqual({ to: 'exhibitor@example.com', cc: ['sec@example.com'] });
  });

  it('entry_decision omits cc when the secretary-cc toggle is disabled', () => {
    expect(
      resolveDerivedRecipient({
        type: 'entry_decision',
        registration: {
          exhibitorEmail: 'exhibitor@example.com',
          show: showCc(false, 'sec@example.com'),
        },
      })
    ).toEqual({ to: 'exhibitor@example.com' });
  });

  it('entry_decision defaults the secretary-cc toggle to enabled when null', () => {
    expect(
      resolveDerivedRecipient({
        type: 'entry_decision',
        registration: {
          exhibitorEmail: 'exhibitor@example.com',
          show: showCc(null, 'sec@example.com'),
        },
      })
    ).toEqual({ to: 'exhibitor@example.com', cc: ['sec@example.com'] });
  });

  it('entry_decision omits cc when the show has no secretary email', () => {
    expect(
      resolveDerivedRecipient({
        type: 'entry_decision',
        registration: {
          exhibitorEmail: 'exhibitor@example.com',
          show: showCc(true, null),
        },
      })
    ).toEqual({ to: 'exhibitor@example.com' });
  });

  it('ignores a body-supplied third-party address — the input type has no `to`/`cc` field', () => {
    // A caller-supplied `to`/`cc` cannot be threaded through this function:
    // the source types below are the only accepted shape, and neither carries
    // a `to` or body `cc` field. Recipient and cc always come from the resource.
    const supportResult = resolveDerivedRecipient({
      type: 'support_notification',
      ticket: { ownerEmail: 'owner@example.com' },
    });
    expect(supportResult).toEqual({ to: 'owner@example.com' });
    expect(supportResult?.to).not.toEqual('attacker@example.com');

    const entryResult = resolveDerivedRecipient({
      type: 'entry_decision',
      registration: {
        exhibitorEmail: 'exhibitor@example.com',
        show: showCc(true, 'sec@example.com'),
      },
    });
    expect(entryResult?.to).toEqual('exhibitor@example.com');
    expect(entryResult?.cc).toEqual(['sec@example.com']);
    expect(entryResult?.cc).not.toContain('attacker@example.com');
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
        registration: {
          exhibitorEmail: null,
          show: showCc(true, 'sec@example.com'),
        },
      })
    ).toBeNull();
  });

  it('fails closed (returns null) when the resolved email is blank/whitespace', () => {
    expect(
      resolveDerivedRecipient({ type: 'support_notification', ticket: { ownerEmail: '   ' } })
    ).toBeNull();
  });
});
