import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppearanceSettings } from './AppearanceSettings';
import { useSettingsStore } from '@/stores/settingsStore';

describe('AppearanceSettings — v2 accent picker + Display Mode', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    useSettingsStore.setState({
      settings: {
        ...useSettingsStore.getState().settings,
        accentColor: 'teal',
        displayMode: 'default',
        theme: 'light',
      },
    });
  });

  it('renders four accent swatches — Teal, Terracotta, Ocean, Royal', () => {
    render(<AppearanceSettings />);
    expect(screen.getByLabelText('Set accent color to Teal')).toBeInTheDocument();
    expect(screen.getByLabelText('Set accent color to Terracotta')).toBeInTheDocument();
    expect(screen.getByLabelText('Set accent color to Ocean')).toBeInTheDocument();
    expect(screen.getByLabelText('Set accent color to Royal')).toBeInTheDocument();
  });

  it('persists accent selection to the store and applies the class', () => {
    render(<AppearanceSettings />);
    fireEvent.click(screen.getByLabelText('Set accent color to Terracotta'));
    expect(useSettingsStore.getState().settings.accentColor).toBe('terracotta');
    expect(document.documentElement.classList.contains('accent-terracotta')).toBe(true);
  });

  it('shows the Display Mode select and toggles outdoor mode', () => {
    render(<AppearanceSettings />);
    const select = screen.getByLabelText('Display Mode') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'outdoor' } });
    expect(useSettingsStore.getState().settings.displayMode).toBe('outdoor');
    expect(document.documentElement.classList.contains('mode-outdoor')).toBe(true);
  });

  it('shows prefers-contrast hint when media query matches and mode is default', () => {
    const mq = {
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.spyOn(window, 'matchMedia').mockImplementation(() => mq as unknown as MediaQueryList);
    render(<AppearanceSettings />);
    expect(screen.getByText(/your device prefers high contrast/i)).toBeInTheDocument();
  });

  it('hides prefers-contrast hint when already in outdoor mode', () => {
    useSettingsStore.setState({
      settings: { ...useSettingsStore.getState().settings, displayMode: 'outdoor' },
    });
    const mq = {
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.spyOn(window, 'matchMedia').mockImplementation(() => mq as unknown as MediaQueryList);
    render(<AppearanceSettings />);
    expect(screen.queryByText(/your device prefers high contrast/i)).toBeNull();
  });
});
