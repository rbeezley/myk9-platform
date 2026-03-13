import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';
import { ConfirmEmail } from '../templates/ConfirmEmail';
import { ResetPassword } from '../templates/ResetPassword';
import { RegistrationConfirmation } from '../templates/RegistrationConfirmation';

describe('Email Templates', () => {
  describe('ConfirmEmail', () => {
    it('renders with confirm URL and name', async () => {
      const html = await render(
        ConfirmEmail({ confirmUrl: 'https://example.com/confirm', firstName: 'Jane' })
      );
      expect(html).toContain('Jane');
      expect(html).toContain('https://example.com/confirm');
      expect(html).toContain('Confirm');
    });
  });

  describe('ResetPassword', () => {
    it('renders with reset URL and name', async () => {
      const html = await render(
        ResetPassword({ resetUrl: 'https://example.com/reset', firstName: 'Jane' })
      );
      expect(html).toContain('Jane');
      expect(html).toContain('https://example.com/reset');
      expect(html).toContain('Reset');
    });
  });

  describe('RegistrationConfirmation', () => {
    it('renders with full registration data', async () => {
      const html = await render(
        RegistrationConfirmation({
          firstName: 'Jane',
          confirmationNumber: 'MK9-001234',
          show: {
            name: 'Spring Classic',
            startDate: '2026-04-15',
            endDate: '2026-04-16',
            location: 'Portland, OR',
            venue: 'Expo Center',
          },
          entries: [{ dogName: 'Max', className: 'Novice Agility', armband: '42' }],
          payment: { subtotal: 3500, total: 3500, method: 'Visa ending in 4242' },
        })
      );
      expect(html).toContain('MK9-001234');
      expect(html).toContain('Spring Classic');
      expect(html).toContain('Max');
      expect(html).toContain('Novice Agility');
      expect(html).toContain('$35.00');
    });

    it('renders secretary custom message when provided', async () => {
      const html = await render(
        RegistrationConfirmation({
          firstName: 'Jane',
          confirmationNumber: 'MK9-001234',
          show: {
            name: 'Spring Classic',
            startDate: '2026-04-15',
            endDate: '2026-04-16',
            location: 'Portland, OR',
            confirmationMessage: 'Parking is on the north side. Bring your own crates.',
          },
          entries: [{ dogName: 'Max', className: 'Novice Agility' }],
          payment: { subtotal: 3500, total: 3500, method: 'Visa ending in 4242' },
        })
      );
      expect(html).toContain('Parking is on the north side');
    });

    it('omits custom message section when not provided', async () => {
      const html = await render(
        RegistrationConfirmation({
          firstName: 'Jane',
          confirmationNumber: 'MK9-001234',
          show: {
            name: 'Spring Classic',
            startDate: '2026-04-15',
            endDate: '2026-04-16',
            location: 'Portland, OR',
          },
          entries: [{ dogName: 'Max', className: 'Novice Agility' }],
          payment: { subtotal: 3500, total: 3500, method: 'Visa ending in 4242' },
        })
      );
      expect(html).not.toContain('From the show secretary');
    });
  });
});
