import { renderHook, act } from '@testing-library/react';
import { useLabelPreferences } from '../useLabelPreferences';

beforeEach(() => {
  localStorage.clear();
});

describe('useLabelPreferences', () => {
  it('returns default preferences when localStorage is empty', () => {
    const { result } = renderHook(() => useLabelPreferences());
    const [prefs] = result.current;
    expect(prefs.templateId).toBe('18262');
    expect(prefs.pitchAdjustment).toBe(0);
  });

  it('persists preferences to localStorage on update', () => {
    const { result } = renderHook(() => useLabelPreferences());
    act(() => {
      result.current[1](p => ({ ...p, templateId: '18163' }));
    });
    const stored = JSON.parse(localStorage.getItem('myk9show-label-prefs') ?? '{}');
    expect(stored.templateId).toBe('18163');
  });

  it('restores preferences from localStorage', () => {
    localStorage.setItem(
      'myk9show-label-prefs',
      JSON.stringify({ templateId: '8387', skip: 3, pitchAdjustment: 5 })
    );
    const { result } = renderHook(() => useLabelPreferences());
    const [prefs] = result.current;
    expect(prefs.templateId).toBe('8387');
    expect(prefs.skip).toBe(3);
    expect(prefs.pitchAdjustment).toBe(5);
  });

  it('migrates legacy show-code label preferences', () => {
    localStorage.setItem(
      'myk9show-label-prefs',
      JSON.stringify({ contentConfig: { myk9qCode: false } })
    );
    const { result } = renderHook(() => useLabelPreferences());
    const [prefs] = result.current;
    expect(prefs.contentConfig.showAccessCode).toBe(false);
  });

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem('myk9show-label-prefs', 'not json');
    const { result } = renderHook(() => useLabelPreferences());
    const [prefs] = result.current;
    expect(prefs.templateId).toBe('18262');
  });
});
