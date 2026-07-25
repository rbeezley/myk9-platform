import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@/context/ThemeContext';
import { ThemeSelector } from './ThemeSelector';
import type { ThemePreferences } from '@/types/user-preferences';

const basePreferences: ThemePreferences = {
  mode: 'light',
  colorScheme: 'clay',
  layoutDensity: 'comfortable',
  fontSize: 'medium',
  reduceMotion: false,
  highContrast: false,
};

// Mirrors how AccountPage wires ThemeSelector: `preferences` is
// parent-controlled state that gets patched by `onUpdate`. A static prop
// would leave the RadioGroup's controlled `value` unchanged across clicks,
// so Radix would only ever fire the first selection.
function Harness({ onUpdate }: { onUpdate: (p: Partial<ThemePreferences>) => void }) {
  const [preferences, setPreferences] = React.useState<ThemePreferences>(basePreferences);
  return (
    <ThemeSelector
      preferences={preferences}
      onUpdate={p => {
        setPreferences(prev => ({ ...prev, ...p }));
        onUpdate(p);
      }}
      onReset={vi.fn()}
    />
  );
}

function renderSelector(onUpdate = vi.fn()) {
  render(
    <ThemeProvider>
      <Harness onUpdate={onUpdate} />
    </ThemeProvider>
  );
  return { onUpdate };
}

describe('ThemeSelector mode wiring', () => {
  const root = document.documentElement;

  beforeEach(() => {
    localStorage.clear();
    root.classList.remove('theme-light', 'theme-dark', 'dark', 'reduce-motion', 'high-contrast');
    document.body.className = '';
  });

  it('selecting Dark calls onUpdate AND drives the shared ThemeContext (trio applied)', async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderSelector();

    await user.click(screen.getByRole('radio', { name: /^Dark/ }));

    // Preferences-system dual write (existing contract).
    expect(onUpdate).toHaveBeenCalledWith({ mode: 'dark' });

    // ThemeContext dual write (new): the header toggle reads this same
    // context, so the html trio must reflect the selector's choice too.
    expect(root.classList.contains('theme-dark')).toBe(true);
    expect(root.classList.contains('dark')).toBe(true);
  });

  it('selecting Light after Dark clears the dark trio via the shared context', async () => {
    const user = userEvent.setup();
    renderSelector();

    await user.click(screen.getByRole('radio', { name: /^Dark/ }));
    expect(root.classList.contains('dark')).toBe(true);

    await user.click(screen.getByRole('radio', { name: /^Light/ }));

    expect(root.classList.contains('theme-light')).toBe(true);
    expect(root.classList.contains('dark')).toBe(false);
  });

  it('selecting Font Size applies and persists the --font-scale variable', async () => {
    const user = userEvent.setup();
    renderSelector();

    await user.click(screen.getByRole('radio', { name: /^Large/ }));

    expect(root.style.getPropertyValue('--font-scale')).toBe('1.2');
    expect(localStorage.getItem('fontScale')).toBe('1.2');
  });

  it('does not offer a Small option (14px text-xs floor)', () => {
    renderSelector();
    expect(screen.queryByRole('radio', { name: /^Small/ })).toBeNull();
  });

  it('exposes accessible names for the Reduce Motion and High Contrast switches', () => {
    renderSelector();

    expect(screen.getByRole('switch', { name: 'Reduce Motion' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'High Contrast' })).toBeInTheDocument();
  });

  it('applies and persists reduce-motion / high-contrast when toggled', async () => {
    const user = userEvent.setup();
    renderSelector();

    await user.click(screen.getByRole('switch', { name: 'Reduce Motion' }));
    expect(root.classList.contains('reduce-motion')).toBe(true);
    expect(localStorage.getItem('reduceMotion')).toBe('true');

    await user.click(screen.getByRole('switch', { name: 'High Contrast' }));
    expect(root.classList.contains('high-contrast')).toBe(true);
    expect(localStorage.getItem('highContrast')).toBe('true');
  });

  it('applies and persists layout density when a density option is selected', async () => {
    const user = userEvent.setup();
    renderSelector();

    await user.click(screen.getByRole('radio', { name: /^Compact/ }));

    // Density lives on <html>, not <body> — applyLayoutDensity scrubs the body copy.
    expect(root.className).toContain('density-compact');
    expect(document.body.className).not.toContain('density-compact');
    expect(localStorage.getItem('layoutDensity')).toBe('compact');
  });

  it('syncs the legacy settingsStore theme so its OS-change listener agrees', async () => {
    const user = userEvent.setup();
    const { useSettingsStore } = await import('@/store/settingsStore');
    renderSelector();

    await user.click(screen.getByRole('radio', { name: /^Dark/ }));
    expect(useSettingsStore.getState().settings.theme).toBe('dark');

    await user.click(screen.getByRole('radio', { name: /^System/ }));
    expect(useSettingsStore.getState().settings.theme).toBe('auto');
  });
});
