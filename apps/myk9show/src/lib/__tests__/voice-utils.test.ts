import { describe, it, expect } from 'vitest';
import { classifyVoice, detectPlatform, getEnhancedVoiceInstructions } from '../voice-utils';

describe('classifyVoice', () => {
  it('marks Premium voices as recommended', () => {
    expect(classifyVoice('Samantha (Premium)')).toBe('recommended');
  });

  it('marks Enhanced voices as recommended', () => {
    expect(classifyVoice('Alex (Enhanced)')).toBe('recommended');
  });

  it('marks Google voices as recommended', () => {
    expect(classifyVoice('Google US English')).toBe('recommended');
  });

  it('marks plain voices as other', () => {
    expect(classifyVoice('Samantha')).toBe('other');
  });

  it('marks Microsoft Online voices as recommended', () => {
    expect(classifyVoice('Microsoft Aria Online (Natural)')).toBe('recommended');
  });
});

describe('detectPlatform', () => {
  it('detects Mac from user agent', () => {
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('mac');
  });

  it('detects iPhone from user agent', () => {
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('ios');
  });

  it('detects iPad from user agent', () => {
    expect(detectPlatform('Mozilla/5.0 (iPad; CPU OS 17_0)')).toBe('ios');
  });

  it('detects Android from user agent', () => {
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe('android');
  });

  it('detects Windows from user agent', () => {
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows');
  });

  it('returns unknown for unrecognized user agent', () => {
    expect(detectPlatform('SomeBot/1.0')).toBe('unknown');
  });
});

describe('getEnhancedVoiceInstructions', () => {
  it('returns Mac instructions for mac platform', () => {
    const result = getEnhancedVoiceInstructions('mac');
    expect(result).not.toBeNull();
    expect(result!.platform).toBe('Mac');
    expect(result!.steps).toHaveLength(5);
    expect(result!.steps[0]).toContain('System Settings');
  });

  it('returns iOS instructions for ios platform', () => {
    const result = getEnhancedVoiceInstructions('ios');
    expect(result).not.toBeNull();
    expect(result!.platform).toBe('iPhone / iPad');
    expect(result!.steps[0]).toContain('Settings');
  });

  it('returns Android instructions for android platform', () => {
    const result = getEnhancedVoiceInstructions('android');
    expect(result).not.toBeNull();
    expect(result!.platform).toBe('Android');
  });

  it('returns Windows instructions for windows platform', () => {
    const result = getEnhancedVoiceInstructions('windows');
    expect(result).not.toBeNull();
    expect(result!.platform).toBe('Windows');
  });

  it('returns null for unknown platform', () => {
    expect(getEnhancedVoiceInstructions('unknown')).toBeNull();
  });
});
