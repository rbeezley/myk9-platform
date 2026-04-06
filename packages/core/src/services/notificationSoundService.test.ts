import { describe, it, expect } from 'vitest';
import notificationSoundService from './notificationSoundService';

describe('notificationSoundService default implementation', () => {
  it('playWarningSound does not throw', () => {
    expect(() => notificationSoundService.playWarningSound()).not.toThrow();
  });

  it('playSuccessSound does not throw', () => {
    expect(() => notificationSoundService.playSuccessSound()).not.toThrow();
  });

  it('playErrorSound does not throw', () => {
    expect(() => notificationSoundService.playErrorSound()).not.toThrow();
  });

  it('playTimerWarningChime does not throw', () => {
    expect(() => notificationSoundService.playTimerWarningChime()).not.toThrow();
  });
});
