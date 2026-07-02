import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { PaymentStep } from '../index';
import type { ClassSelectionData } from '@/types/show-registration-types';

const removeItemMock = vi.hoisted(() => vi.fn().mockResolvedValue(true));

vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({
    dogs: [{ id: 'dog-1', name: 'Rover', callName: 'Rover' }],
  }),
}));

vi.mock('@/hooks/useClassStoreCompat', () => ({
  useClassStoreCompat: () => ({
    classes: [{ id: 'class-1', className: 'Novice Interior', entryFee: 25 }],
  }),
}));

vi.mock('@/store/showStore', () => ({
  useShowStore: () => ({
    shows: [
      {
        id: 'show-1',
        organization: null,
        preEntryFee: '25',
        startDate: '2026-08-01',
        acceptCheckPayments: true,
        acceptCashPayments: true,
      },
    ],
  }),
}));

vi.mock('@/store/cartStore', () => ({
  useCartItems: () => [
    {
      id: 'item-1',
      dog_id: 'dog-1',
      class_id: 'class-1',
    },
  ],
  useCartStore: (selector: (state: { removeItem: typeof removeItemMock }) => unknown) =>
    selector({ removeItem: removeItemMock }),
}));

vi.mock('@/hooks/useRegistrationPermissions', () => ({
  useRegistrationPermissions: () => ({
    isSecretary: false,
    isClubAdmin: false,
    isSiteAdmin: false,
  }),
  REGISTRATION_PERMISSIONS: {
    MARK_PAYMENT: 'registration:mark_payment',
    MANAGE_PAYMENTS: 'registration:manage_payments',
    BULK_OPERATIONS: 'registration:bulk_operations',
  },
}));

vi.mock('@/components/auth/PermissionGuard', () => ({
  PermissionGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));

describe('PaymentStep summary line removal', () => {
  it('removes the cart line and matching class selection', async () => {
    const classSelections: ClassSelectionData[] = [
      {
        dogId: 'dog-1',
        trialId: 'trial-1',
        selectedClasses: [{ classId: 'class-1' }],
      },
    ];
    const onClassSelectionChange = vi.fn();

    const { user } = render(
      <PaymentStep
        selectedDogs={['dog-1']}
        classSelections={classSelections}
        paymentMethod="check"
        onPaymentMethodChange={vi.fn()}
        showId="show-1"
        onClassSelectionChange={onClassSelectionChange}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Remove Novice Interior' }));

    expect(removeItemMock).toHaveBeenCalledWith('item-1');
    expect(onClassSelectionChange).toHaveBeenCalledWith([]);
  });
});
