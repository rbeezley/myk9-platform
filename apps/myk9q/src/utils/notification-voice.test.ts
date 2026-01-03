/**
 * Tests for Notification Voice Text Generation Utilities
 */

import {
  generateYourTurnText,
  generateResultsText,
  generateClassStartingText,
  sanitizeAnnouncementText,
  generateVoiceText,
  supportsVoiceAnnouncement,
  type NotificationPayload,
} from './notification-voice';

describe('notification-voice', () => {
  describe('generateYourTurnText', () => {
    it('should generate text for next dog with name and armband', () => {
      const text = generateYourTurnText('Max', '42', 1);
      expect(text).toBe("Max, number 42, you're up next");
    });

    it('should generate text for next dog without name', () => {
      const text = generateYourTurnText('', '', 1);
      expect(text).toBe("You're up next");
    });

    it('should generate text for dog multiple positions away', () => {
      const text = generateYourTurnText('Bella', '15', 3);
      expect(text).toBe("Bella, number 15, you're 3 dogs away");
    });

    it('should generate text for 2 dogs away', () => {
      const text = generateYourTurnText('Luna', '7', 2);
      expect(text).toBe("Luna, number 7, you're 2 dogs away");
    });

    it('should handle missing name for multiple dogs away', () => {
      const text = generateYourTurnText('', '', 5);
      expect(text).toBe("You're 5 dogs away");
    });
  });

  describe('generateResultsText', () => {
    it('should generate text for first place with qualification', () => {
      const text = generateResultsText('Max', 1, true);
      expect(text).toBe('Max, first place, qualified');
    });

    it('should generate text for first place without qualification', () => {
      const text = generateResultsText('Max', 1, false);
      expect(text).toBe('Max, first place');
    });

    it('should generate text for second place', () => {
      const text = generateResultsText('Bella', 2, true);
      expect(text).toBe('Bella, second place, qualified');
    });

    it('should generate text for third place', () => {
      const text = generateResultsText('Luna', 3, false);
      expect(text).toBe('Luna, third place');
    });

    it('should generate text for fourth place', () => {
      const text = generateResultsText('Charlie', 4, true);
      expect(text).toBe('Charlie, fourth place, qualified');
    });

    it('should generate generic text for placement beyond 4th', () => {
      const text = generateResultsText('Buddy', 5, false);
      expect(text).toBe('Results posted for Buddy');
    });

    it('should generate generic text when no placement provided', () => {
      const text = generateResultsText('Max', undefined, true);
      expect(text).toBe('Results posted for Max');
    });

    it('should generate generic text when no dog name provided', () => {
      const text = generateResultsText('', undefined, false);
      expect(text).toBe('Results posted');
    });

    it('should handle placement 0 as no placement', () => {
      const text = generateResultsText('Max', 0, true);
      expect(text).toBe('Results posted for Max');
    });

    it('should handle negative placement as no placement', () => {
      const text = generateResultsText('Bella', -1, false);
      expect(text).toBe('Results posted for Bella');
    });
  });

  describe('generateClassStartingText', () => {
    it('should generate text with class name', () => {
      const text = generateClassStartingText('Novice A');
      expect(text).toBe('Novice A starting soon');
    });

    it('should generate generic text without class name', () => {
      const text = generateClassStartingText('');
      expect(text).toBe('Class starting soon');
    });

    it('should handle complex class names', () => {
      const text = generateClassStartingText('Master Standard - 20 inch');
      expect(text).toBe('Master Standard - 20 inch starting soon');
    });
  });

  describe('sanitizeAnnouncementText', () => {
    it('should remove alarm emoji', () => {
      const text = sanitizeAnnouncementText('🚨 Ring change');
      expect(text).toBe('Ring change');
    });

    it('should replace URGENT: with friendly text', () => {
      const text = sanitizeAnnouncementText('URGENT: Ring change');
      expect(text).toBe('Urgent announcement, Ring change');
    });

    it('should handle both emoji and URGENT:', () => {
      const text = sanitizeAnnouncementText('🚨 URGENT: Ring change');
      expect(text).toBe('Urgent announcement, Ring change');
    });

    it('should trim whitespace', () => {
      const text = sanitizeAnnouncementText('  Message  ');
      expect(text).toBe('Message');
    });

    it('should handle text without special characters', () => {
      const text = sanitizeAnnouncementText('Normal announcement');
      expect(text).toBe('Normal announcement');
    });

    it('should remove multiple alarm emojis', () => {
      const text = sanitizeAnnouncementText('🚨🚨 Important message');
      expect(text).toBe('Important message');
    });
  });

  describe('generateVoiceText', () => {
    it('should generate voice text for your_turn notification', () => {
      const payload: NotificationPayload = {
        type: 'your_turn',
        title: 'Your turn',
        data: {
          callName: 'Max',
          armbandNumber: '42',
          dogsAhead: 1,
        },
      };

      const result = generateVoiceText(payload);

      expect(result).toEqual({
        text: "Max, number 42, you're up next",
        priority: 'normal',
      });
    });

    it('should generate voice text for results_posted notification', () => {
      const payload: NotificationPayload = {
        type: 'results_posted',
        title: 'Results posted',
        data: {
          callName: 'Bella',
          placement: 2,
          qualified: true,
        },
      };

      const result = generateVoiceText(payload);

      expect(result).toEqual({
        text: 'Bella, second place, qualified',
        priority: 'normal',
      });
    });

    it('should generate voice text for class_starting notification', () => {
      const payload: NotificationPayload = {
        type: 'class_starting',
        title: 'Class starting',
        data: {
          className: 'Novice A',
        },
      };

      const result = generateVoiceText(payload);

      expect(result).toEqual({
        text: 'Novice A starting soon',
        priority: 'normal',
      });
    });

    it('should generate voice text for announcement notification', () => {
      const payload: NotificationPayload = {
        type: 'announcement',
        title: 'Please check in',
        priority: 'normal',
      };

      const result = generateVoiceText(payload);

      expect(result).toEqual({
        text: 'Please check in',
        priority: 'normal',
      });
    });

    it('should generate voice text for urgent_announcement notification', () => {
      const payload: NotificationPayload = {
        type: 'urgent_announcement',
        title: '🚨 URGENT: Ring change',
        priority: 'urgent',
      };

      const result = generateVoiceText(payload);

      expect(result).toEqual({
        text: 'Urgent announcement, Ring change',
        priority: 'high',
      });
    });

    it('should generate voice text for system_update notification', () => {
      const payload: NotificationPayload = {
        type: 'system_update',
        title: 'Update available',
      };

      const result = generateVoiceText(payload);

      expect(result).toEqual({
        text: 'App update available',
        priority: 'normal',
      });
    });

    it('should generate voice text for sync_error notification', () => {
      const payload: NotificationPayload = {
        type: 'sync_error',
        title: 'Sync failed',
      };

      const result = generateVoiceText(payload);

      expect(result).toEqual({
        text: 'Sync error occurred',
        priority: 'normal',
      });
    });

    it('should use title for unknown notification type', () => {
      const payload: NotificationPayload = {
        type: 'unknown_type',
        title: 'Unknown message',
      };

      const result = generateVoiceText(payload);

      expect(result).toEqual({
        text: 'Unknown message',
        priority: 'normal',
      });
    });

    it('should return null when no text is generated', () => {
      const payload: NotificationPayload = {
        type: 'your_turn',
        title: '',
        data: {},
      };

      const result = generateVoiceText(payload);

      // Empty text should still generate "You're up next"
      expect(result).toEqual({
        text: "You're up next",
        priority: 'normal',
      });
    });

    it('should map urgent priority to high voice priority', () => {
      const payload: NotificationPayload = {
        type: 'announcement',
        title: 'Important message',
        priority: 'urgent',
      };

      const result = generateVoiceText(payload);

      expect(result?.priority).toBe('high');
    });

    it('should map non-urgent priority to normal voice priority', () => {
      const payload: NotificationPayload = {
        type: 'announcement',
        title: 'Regular message',
        priority: 'low',
      };

      const result = generateVoiceText(payload);

      expect(result?.priority).toBe('normal');
    });

    it('should default to normal priority when not specified', () => {
      const payload: NotificationPayload = {
        type: 'announcement',
        title: 'Message',
      };

      const result = generateVoiceText(payload);

      expect(result?.priority).toBe('normal');
    });
  });

  describe('supportsVoiceAnnouncement', () => {
    it('should return true for your_turn', () => {
      expect(supportsVoiceAnnouncement('your_turn')).toBe(true);
    });

    it('should return true for results_posted', () => {
      expect(supportsVoiceAnnouncement('results_posted')).toBe(true);
    });

    it('should return true for class_starting', () => {
      expect(supportsVoiceAnnouncement('class_starting')).toBe(true);
    });

    it('should return true for announcement', () => {
      expect(supportsVoiceAnnouncement('announcement')).toBe(true);
    });

    it('should return true for urgent_announcement', () => {
      expect(supportsVoiceAnnouncement('urgent_announcement')).toBe(true);
    });

    it('should return true for system_update', () => {
      expect(supportsVoiceAnnouncement('system_update')).toBe(true);
    });

    it('should return true for sync_error', () => {
      expect(supportsVoiceAnnouncement('sync_error')).toBe(true);
    });

    it('should return false for unsupported type', () => {
      expect(supportsVoiceAnnouncement('silent_update')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(supportsVoiceAnnouncement('')).toBe(false);
    });

    it('should return false for random string', () => {
      expect(supportsVoiceAnnouncement('unknown_type')).toBe(false);
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle complete your_turn flow', () => {
      const payload: NotificationPayload = {
        type: 'your_turn',
        title: "Max's turn",
        body: 'Please proceed to Ring 1',
        priority: 'high',
        data: {
          callName: 'Max',
          armbandNumber: '42',
          dogsAhead: 1,
          ringNumber: 1,
        },
      };

      const result = generateVoiceText(payload);

      expect(result).toBeDefined();
      expect(result?.text).toBe("Max, number 42, you're up next");
      expect(result?.priority).toBe('normal');
    });

    it('should handle placement announcement with qualification', () => {
      const payload: NotificationPayload = {
        type: 'results_posted',
        title: 'Results ready',
        priority: 'normal',
        data: {
          callName: 'Bella',
          armbandNumber: '15',
          placement: 1,
          qualified: true,
          score: 195,
        },
      };

      const result = generateVoiceText(payload);

      expect(result?.text).toBe('Bella, first place, qualified');
    });

    it('should handle urgent class change announcement', () => {
      const payload: NotificationPayload = {
        type: 'urgent_announcement',
        title: '🚨 URGENT: Ring 2 moved to outdoor field',
        priority: 'urgent',
      };

      const result = generateVoiceText(payload);

      expect(result?.text).toBe(
        'Urgent announcement, Ring 2 moved to outdoor field'
      );
      expect(result?.priority).toBe('high');
    });

    it('should handle missing optional data gracefully', () => {
      const payload: NotificationPayload = {
        type: 'your_turn',
        title: 'Your turn',
        data: {
          dogsAhead: 3,
          // Missing callName and armbandNumber
        },
      };

      const result = generateVoiceText(payload);

      expect(result?.text).toBe("You're 3 dogs away");
    });
  });
});
