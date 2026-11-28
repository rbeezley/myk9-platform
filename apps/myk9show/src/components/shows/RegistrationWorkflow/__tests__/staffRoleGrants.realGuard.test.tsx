/**
 * MYK9-2440: the one PermissionGuard reads database permissions only, so the
 * mail-in payment choices and the status panel show for a staff role only when
 * that role holds the codes. This runs the REAL guard (only `useRBAC` is faked)
 * against the grants the live database holds, read 2026-11-27 after migration
 * 20261127174700_myk9_2440_admin_registration_grants:
 *
 *   select r.name, p.code from role_permissions rp
 *   join roles r on r.id = rp.role_id join permissions p on p.id = rp.permission_id
 *   where r.name in ('secretary','club_admin','site_admin') and p.code like 'registration:%';
 *
 * An exhibitor with no registration grants is the control: the same render
 * hides every guarded control, so a pass is not the guard rendering children
 * unconditionally.
 */
import React from 'react';
import { render, screen } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makePaymentResolution } from '@/test/utils/paymentResolution';
import { PaymentStep } from '../PaymentStep';
import { PaymentMethodSelector } from '../PaymentStep/PaymentMethodSelector';
import { RegistrationManagementPanel } from '../RegistrationManagementPanel';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';

const LIVE_REGISTRATION_GRANTS: Record<string, string[]> = {
  secretary: [
    'registration:assign_armbands',
    'registration:bulk_operations',
    'registration:create_exhibitor',
    'registration:manage_payments',
    'registration:manage_status',
    'registration:mark_payment',
    'registration:override_fees',
    'registration:register_any',
    'registration:view_all_dogs',
  ],
  club_admin: [
    'registration:manage_status',
    'registration:mark_payment',
    'registration:override_fees',
    'registration:view_all_dogs',
  ],
  site_admin: [
    'registration:manage_status',
    'registration:mark_payment',
    'registration:override_fees',
    'registration:view_all_dogs',
  ],
  exhibitor: [],
};

const rbac = vi.hoisted(() => ({ role: 'secretary' }));

vi.mock('@/hooks/useRBAC', () => ({
  useRBAC: () => ({
    hasPermission: (code: string) => (LIVE_REGISTRATION_GRANTS[rbac.role] ?? []).includes(code),
    userRoles: [{ is_active: true, expires_at: null, role: { name: rbac.role } }],
    isLoading: false,
  }),
}));
vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({ dogs: [{ id: 'dog-1', callName: 'Buddy' }] }),
}));
vi.mock('@/hooks/useEntryWindowTimezone', () => ({
  useEntryWindowTimezone: () => ({
    timeZone: 'America/New_York',
    isReady: true,
    isUnavailable: false,
  }),
}));

function renderStaffChoices() {
  return render(
    <PaymentStep
      staffWorkflow
      paymentResolution={makePaymentResolution({
        paymentMethod: '',
        cardCheckoutAvailable: false,
        isOnBehalf: true,
        canUseDeskPaymentActions: true,
      })}
      selectedDogs={['dog-1']}
      paymentMethod=""
      onPaymentMethodChange={vi.fn()}
      onPaymentDetailsChange={vi.fn()}
      getPaymentDetails={() => ({})}
    />
  );
}

function renderStatusPanel() {
  return render(
    <RegistrationManagementPanel
      registrationNumber="R-1"
      selectedDogs={['dog-1']}
      classSelectionsCount={1}
      totalFees={30}
      entryStatus={EntryStatus.PENDING}
      paymentStatus={PaymentStatus.PENDING}
      paymentMethod="check"
      armbandAssignments={[]}
    />
  );
}

const STAFF = ['secretary', 'club_admin', 'site_admin'];

describe('staff roles keep the mail-in payment and status controls (MYK9-2440)', () => {
  beforeEach(() => {
    rbac.role = 'secretary';
  });

  it.each(STAFF)('%s sees Check received, Cash received and Paid by a club or group', role => {
    rbac.role = role;
    renderStaffChoices();
    expect(screen.getByRole('button', { name: /^Check received/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Cash received/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Paid by a club or group/ })).toBeInTheDocument();
  });

  it.each(STAFF)('%s sees the secretary and group payment options', role => {
    rbac.role = role;
    render(
      <PaymentMethodSelector
        paymentMethod=""
        onPaymentMethodChange={vi.fn()}
        acceptedMethods={{ check: true, cash: true }}
      />
    );
    expect(screen.getByText('Secretary Payment (Already Received)')).toBeInTheDocument();
    expect(screen.getByText('Group/Club Payment')).toBeInTheDocument();
  });

  it.each(STAFF)('%s sees the registration status panel', role => {
    rbac.role = role;
    renderStatusPanel();
    expect(screen.getByText('Registration Management')).toBeInTheDocument();
  });

  it('an exhibitor with no registration grants sees none of them', () => {
    rbac.role = 'exhibitor';
    const choices = renderStaffChoices();
    expect(screen.queryByRole('button', { name: /^Check received/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Cash received/ })).not.toBeInTheDocument();
    choices.unmount();

    const selector = render(
      <PaymentMethodSelector
        paymentMethod=""
        onPaymentMethodChange={vi.fn()}
        acceptedMethods={{ check: true, cash: true }}
      />
    );
    expect(screen.queryByText('Secretary Payment (Already Received)')).not.toBeInTheDocument();
    expect(screen.queryByText('Group/Club Payment')).not.toBeInTheDocument();
    selector.unmount();

    renderStatusPanel();
    expect(screen.queryByText('Registration Management')).not.toBeInTheDocument();
  });
});
