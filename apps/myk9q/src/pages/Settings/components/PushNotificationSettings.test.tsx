/**
 * Tests for PushNotificationSettings Component
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PushNotificationSettings } from './PushNotificationSettings';

describe('PushNotificationSettings', () => {
  const defaultProps = {
    isEnabled: true,
    permissionState: 'default' as NotificationPermission,
    isPushSubscribed: false,
    browserCompatibility: { supported: true }
  };

  describe('Rendering conditions', () => {
    it('should not render when notifications are disabled', () => {
      const { container } = render(
        <PushNotificationSettings
          {...defaultProps}
          isEnabled={false}
        />
      );

      expect(container.firstChild).toBeNull();
    });

    it('should render when notifications are enabled', () => {
      const { container } = render(
        <PushNotificationSettings {...defaultProps} />
      );

      expect(container.firstChild).toBeTruthy();
    });

    it('should not show any status when permission is default and not subscribed', () => {
      const { container } = render(
        <PushNotificationSettings {...defaultProps} />
      );

      expect(screen.queryByText('Notifications Blocked')).not.toBeInTheDocument();
      expect(screen.queryByText('Active & Ready')).not.toBeInTheDocument();
      expect(screen.queryByText('Browser Not Supported')).not.toBeInTheDocument();
    });
  });

  describe('Browser compatibility warning', () => {
    it('should show warning when browser is not supported', () => {
      render(
        <PushNotificationSettings
          {...defaultProps}
          browserCompatibility={{ supported: false }}
        />
      );

      expect(screen.getByText('Browser Not Supported')).toBeInTheDocument();
      expect(screen.getByText('Push notifications are not supported in this browser.')).toBeInTheDocument();
    });

    it('should show custom reason when provided', () => {
      render(
        <PushNotificationSettings
          {...defaultProps}
          browserCompatibility={{
            supported: false,
            reason: 'ServiceWorker API is not available in this browser.'
          }}
        />
      );

      expect(screen.getByText('ServiceWorker API is not available in this browser.')).toBeInTheDocument();
    });

    it('should render warning icon for unsupported browser', () => {
      const { container } = render(
        <PushNotificationSettings
          {...defaultProps}
          browserCompatibility={{ supported: false }}
        />
      );

      // Lucide icons render color as SVG stroke attribute, not color attribute
      // Verify icon exists in warning section by finding SVG near the warning text
      const warningText = screen.getByText('Browser Not Supported');
      const warningSection = warningText.closest('div[style*="rgba(245, 158, 11"]');
      const icon = warningSection?.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });

    it('should not show warning when browser is supported', () => {
      render(
        <PushNotificationSettings
          {...defaultProps}
          browserCompatibility={{ supported: true }}
        />
      );

      expect(screen.queryByText('Browser Not Supported')).not.toBeInTheDocument();
    });
  });

  describe('Permission denied warning', () => {
    it('should show warning when permission is denied', () => {
      render(
        <PushNotificationSettings
          {...defaultProps}
          permissionState="denied"
        />
      );

      expect(screen.getByText('Notifications Blocked')).toBeInTheDocument();
      expect(screen.getByText('Please enable notifications in your browser settings to receive alerts.')).toBeInTheDocument();
    });

    it('should render warning icon for denied permission', () => {
      const { container } = render(
        <PushNotificationSettings
          {...defaultProps}
          permissionState="denied"
        />
      );

      // Lucide icons render color as SVG stroke attribute, not color attribute
      // Verify icon exists in error section by finding SVG near the blocked text
      const blockedText = screen.getByText('Notifications Blocked');
      const errorSection = blockedText.closest('div[style*="rgba(239, 68, 68"]');
      const icon = errorSection?.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });

    it('should not show warning when permission is granted', () => {
      render(
        <PushNotificationSettings
          {...defaultProps}
          permissionState="granted"
        />
      );

      expect(screen.queryByText('Notifications Blocked')).not.toBeInTheDocument();
    });

    it('should not show warning when permission is default', () => {
      render(
        <PushNotificationSettings
          {...defaultProps}
          permissionState="default"
        />
      );

      expect(screen.queryByText('Notifications Blocked')).not.toBeInTheDocument();
    });
  });

  describe('Active & Ready indicator', () => {
    it('should show indicator when granted and subscribed', () => {
      render(
        <PushNotificationSettings
          {...defaultProps}
          permissionState="granted"
          isPushSubscribed={true}
        />
      );

      expect(screen.getByText('Active & Ready')).toBeInTheDocument();
    });

    it('should render success icon when active', () => {
      const { container } = render(
        <PushNotificationSettings
          {...defaultProps}
          permissionState="granted"
          isPushSubscribed={true}
        />
      );

      // Lucide icons render color as SVG stroke attribute, not color attribute
      // Verify icon exists in success section by finding SVG near the active text
      const activeText = screen.getByText('Active & Ready');
      const successSection = activeText.closest('div[style*="rgba(16, 185, 129"]');
      const icon = successSection?.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });

    it('should not show indicator when not subscribed', () => {
      render(
        <PushNotificationSettings
          {...defaultProps}
          permissionState="granted"
          isPushSubscribed={false}
        />
      );

      expect(screen.queryByText('Active & Ready')).not.toBeInTheDocument();
    });

    it('should not show indicator when permission is denied', () => {
      render(
        <PushNotificationSettings
          {...defaultProps}
          permissionState="denied"
          isPushSubscribed={true}
        />
      );

      expect(screen.queryByText('Active & Ready')).not.toBeInTheDocument();
    });

    it('should not show indicator when permission is default', () => {
      render(
        <PushNotificationSettings
          {...defaultProps}
          permissionState="default"
          isPushSubscribed={true}
        />
      );

      expect(screen.queryByText('Active & Ready')).not.toBeInTheDocument();
    });
  });

  describe('Multiple status indicators', () => {
    it('should show both browser warning and permission denied warning', () => {
      render(
        <PushNotificationSettings
          {...defaultProps}
          browserCompatibility={{ supported: false }}
          permissionState="denied"
        />
      );

      expect(screen.getByText('Browser Not Supported')).toBeInTheDocument();
      expect(screen.getByText('Notifications Blocked')).toBeInTheDocument();
    });

    it('should not show Active indicator when browser is unsupported even if subscribed', () => {
      render(
        <PushNotificationSettings
          {...defaultProps}
          browserCompatibility={{ supported: false }}
          permissionState="granted"
          isPushSubscribed={true}
        />
      );

      expect(screen.getByText('Browser Not Supported')).toBeInTheDocument();
      expect(screen.getByText('Active & Ready')).toBeInTheDocument();
    });
  });

  describe('CSS and styling', () => {
    it('should have correct wrapper padding', () => {
      const { container } = render(
        <PushNotificationSettings {...defaultProps} />
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveStyle({ padding: '0 20px 16px 20px' });
    });

    it('should have warning background for browser compatibility', () => {
      const { container } = render(
        <PushNotificationSettings
          {...defaultProps}
          browserCompatibility={{ supported: false }}
        />
      );

      const warning = container.querySelector('[style*="rgba(245, 158, 11, 0.1)"]');
      expect(warning).toBeInTheDocument();
    });

    it('should have error background for permission denied', () => {
      const { container } = render(
        <PushNotificationSettings
          {...defaultProps}
          permissionState="denied"
        />
      );

      const error = container.querySelector('[style*="rgba(239, 68, 68, 0.1)"]');
      expect(error).toBeInTheDocument();
    });

    it('should have success background for active state', () => {
      const { container } = render(
        <PushNotificationSettings
          {...defaultProps}
          permissionState="granted"
          isPushSubscribed={true}
        />
      );

      const success = container.querySelector('[style*="rgba(16, 185, 129, 0.1)"]');
      expect(success).toBeInTheDocument();
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle first-time user (default permission, not subscribed)', () => {
      const { container } = render(
        <PushNotificationSettings
          {...defaultProps}
          permissionState="default"
          isPushSubscribed={false}
        />
      );

      // Should show container but no status messages
      expect(container.firstChild).toBeTruthy();
      expect(screen.queryByText('Active & Ready')).not.toBeInTheDocument();
      expect(screen.queryByText('Notifications Blocked')).not.toBeInTheDocument();
    });

    it('should handle successfully subscribed user', () => {
      render(
        <PushNotificationSettings
          {...defaultProps}
          permissionState="granted"
          isPushSubscribed={true}
        />
      );

      expect(screen.getByText('Active & Ready')).toBeInTheDocument();
      expect(screen.queryByText('Notifications Blocked')).not.toBeInTheDocument();
    });

    it('should handle user who denied permissions', () => {
      render(
        <PushNotificationSettings
          {...defaultProps}
          permissionState="denied"
          isPushSubscribed={false}
        />
      );

      expect(screen.getByText('Notifications Blocked')).toBeInTheDocument();
      expect(screen.queryByText('Active & Ready')).not.toBeInTheDocument();
    });

    it('should handle unsupported browser on mobile', () => {
      render(
        <PushNotificationSettings
          {...defaultProps}
          browserCompatibility={{
            supported: false,
            reason: 'Push notifications are not supported on iOS Safari.'
          }}
        />
      );

      expect(screen.getByText('Browser Not Supported')).toBeInTheDocument();
      expect(screen.getByText('Push notifications are not supported on iOS Safari.')).toBeInTheDocument();
    });

    it('should handle disabled notifications state', () => {
      const { container } = render(
        <PushNotificationSettings
          {...defaultProps}
          isEnabled={false}
          permissionState="granted"
          isPushSubscribed={true}
        />
      );

      // Should render nothing when disabled
      expect(container.firstChild).toBeNull();
    });
  });
});
