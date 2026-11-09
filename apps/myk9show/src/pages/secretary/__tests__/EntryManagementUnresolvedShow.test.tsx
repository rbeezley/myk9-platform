import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TRIAL_SECRETARY_ONLY_REASON } from '@/features/actions/trialSecretaryAccess';
import { EntryManagementUnresolvedShow } from '@/pages/secretary/EntryManagementUnresolvedShow';

describe('EntryManagementUnresolvedShow tells the transient state from the refusal', () => {
  const base = { didResolveShow: true, showError: null, onRetry: () => {} };

  function renderUnresolved(secretaryOnlyReason: string | undefined) {
    return render(
      <MemoryRouter>
        <EntryManagementUnresolvedShow
          {...base}
          {...(secretaryOnlyReason === undefined ? {} : { secretaryOnlyReason })}
        />
      </MemoryRouter>
    );
  }

  it('sends a refused club admin to /shows', () => {
    renderUnresolved(TRIAL_SECRETARY_ONLY_REASON);
    expect(screen.getByRole('link', { name: /go to your shows/i })).toHaveAttribute(
      'href',
      '/shows'
    );
  });

  it('sends a secretary to /secretary/dashboard', () => {
    renderUnresolved(undefined);
    expect(screen.getByRole('link', { name: /go to your shows/i })).toHaveAttribute(
      'href',
      '/secretary/dashboard'
    );
  });

  it('keeps /secretary/dashboard while access is still being checked (REV-2341 U-3)', () => {
    // "Checking your access to this show…" is not a refusal. Reading any
    // non-undefined string as one sent a REAL trial secretary to the public
    // browse page for the length of a cold load.
    renderUnresolved('Checking your access to this show…');
    expect(screen.getByRole('link', { name: /go to your shows/i })).toHaveAttribute(
      'href',
      '/secretary/dashboard'
    );
  });
});
