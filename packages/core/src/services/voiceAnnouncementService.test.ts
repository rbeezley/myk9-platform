import { describe, it, expect } from 'vitest';
import voiceAnnouncementService from './voiceAnnouncementService';

describe('voiceAnnouncementService default implementation', () => {
  it('speakTimeRemaining does not throw', () => {
    expect(() => voiceAnnouncementService.speakTimeRemaining(30)).not.toThrow();
  });

  it('speak does not throw', () => {
    expect(() => voiceAnnouncementService.speak('Next dog up')).not.toThrow();
  });

  it('cancel does not throw', () => {
    expect(() => voiceAnnouncementService.cancel()).not.toThrow();
  });

  it('announceTimeRemaining does not throw', () => {
    expect(() => voiceAnnouncementService.announceTimeRemaining(60)).not.toThrow();
  });

  it('setScoringActive does not throw', () => {
    expect(() => voiceAnnouncementService.setScoringActive(true)).not.toThrow();
    expect(() => voiceAnnouncementService.setScoringActive(false)).not.toThrow();
  });
});
