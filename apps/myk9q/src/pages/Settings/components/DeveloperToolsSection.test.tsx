/**
 * Tests for DeveloperToolsSection Component
 *
 * Tests the simplified developer tools section which includes:
 * - Developer Mode toggle (enables subscription monitor)
 * - Console Logging dropdown (shown when developer mode is on)
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeveloperToolsSection } from './DeveloperToolsSection';
import { useSettingsStore } from '@/stores/settingsStore';

// Mock the settings store
vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: vi.fn()
}));

describe('DeveloperToolsSection', () => {
  const mockUpdateSettings = vi.fn();

  const defaultSettings = {
    developerMode: false,
    consoleLogging: 'none' as 'none' | 'errors' | 'all'
  };

  beforeEach(() => {
    vi.clearAllMocks();

    (useSettingsStore as any).mockReturnValue({
      settings: defaultSettings,
      updateSettings: mockUpdateSettings
    });
  });

  describe('Developer mode toggle', () => {
    it('should render developer mode toggle', () => {
      render(<DeveloperToolsSection />);

      expect(screen.getByText('Developer Mode')).toBeInTheDocument();
      expect(screen.getByText('Enable subscription monitor')).toBeInTheDocument();
    });

    it('should show developer mode as off by default', () => {
      render(<DeveloperToolsSection />);

      const toggle = screen.getByRole('checkbox');
      expect(toggle).not.toBeChecked();
    });

    it('should call updateSettings when toggled on', () => {
      render(<DeveloperToolsSection />);

      const toggle = screen.getByRole('checkbox');
      fireEvent.click(toggle);

      expect(mockUpdateSettings).toHaveBeenCalledWith({ developerMode: true });
    });

    it('should call updateSettings when toggled off', () => {
      (useSettingsStore as any).mockReturnValue({
        settings: { ...defaultSettings, developerMode: true },
        updateSettings: mockUpdateSettings
      });

      render(<DeveloperToolsSection />);

      // When developer mode is on, first checkbox is developer mode toggle
      const toggle = screen.getAllByRole('checkbox')[0];
      fireEvent.click(toggle);

      expect(mockUpdateSettings).toHaveBeenCalledWith({ developerMode: false });
    });

    it('should render Terminal icon', () => {
      const { container } = render(<DeveloperToolsSection />);

      const terminalIcon = container.querySelector('svg');
      expect(terminalIcon).toBeInTheDocument();
    });
  });

  describe('Conditional developer tools display', () => {
    it('should not show console logging when developer mode is off', () => {
      render(<DeveloperToolsSection />);

      expect(screen.queryByText('Console Logging')).not.toBeInTheDocument();
    });

    it('should show console logging when developer mode is on', () => {
      (useSettingsStore as any).mockReturnValue({
        settings: { ...defaultSettings, developerMode: true },
        updateSettings: mockUpdateSettings
      });

      render(<DeveloperToolsSection />);

      expect(screen.getByText('Console Logging')).toBeInTheDocument();
    });
  });

  describe('Console Logging', () => {
    beforeEach(() => {
      (useSettingsStore as any).mockReturnValue({
        settings: { ...defaultSettings, developerMode: true },
        updateSettings: mockUpdateSettings
      });
    });

    it('should render console logging dropdown', () => {
      render(<DeveloperToolsSection />);

      expect(screen.getByText('Console Logging')).toBeInTheDocument();
      expect(screen.getByText('Verbosity level')).toBeInTheDocument();
    });

    it('should render all logging options', () => {
      render(<DeveloperToolsSection />);

      expect(screen.getByRole('option', { name: 'None' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Errors' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'All' })).toBeInTheDocument();
    });

    it('should have "None" selected by default', () => {
      render(<DeveloperToolsSection />);

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('none');
    });

    it('should call updateSettings when logging level is changed to "errors"', () => {
      render(<DeveloperToolsSection />);

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'errors' } });

      expect(mockUpdateSettings).toHaveBeenCalledWith({ consoleLogging: 'errors' });
    });

    it('should call updateSettings when logging level is changed to "all"', () => {
      render(<DeveloperToolsSection />);

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'all' } });

      expect(mockUpdateSettings).toHaveBeenCalledWith({ consoleLogging: 'all' });
    });

    it('should show current logging level from settings', () => {
      (useSettingsStore as any).mockReturnValue({
        settings: { ...defaultSettings, developerMode: true, consoleLogging: 'errors' },
        updateSettings: mockUpdateSettings
      });

      render(<DeveloperToolsSection />);

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('errors');
    });
  });

  describe('Icon rendering', () => {
    it('should render Terminal icon when developer mode is off', () => {
      const { container } = render(<DeveloperToolsSection />);

      const icons = container.querySelectorAll('svg');
      expect(icons.length).toBe(1); // Only Terminal icon
    });

    it('should render only Terminal icon when developer mode is on', () => {
      (useSettingsStore as any).mockReturnValue({
        settings: { ...defaultSettings, developerMode: true },
        updateSettings: mockUpdateSettings
      });

      const { container } = render(<DeveloperToolsSection />);

      const icons = container.querySelectorAll('svg');
      // Only Terminal icon (Console Logging has no icon)
      expect(icons.length).toBe(1);
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle enabling developer mode workflow', () => {
      const { rerender } = render(<DeveloperToolsSection />);

      // Initially console logging hidden
      expect(screen.queryByText('Console Logging')).not.toBeInTheDocument();

      // User enables developer mode
      const toggle = screen.getByRole('checkbox');
      fireEvent.click(toggle);
      expect(mockUpdateSettings).toHaveBeenCalledWith({ developerMode: true });

      // Simulate settings update
      (useSettingsStore as any).mockReturnValue({
        settings: { ...defaultSettings, developerMode: true },
        updateSettings: mockUpdateSettings
      });
      rerender(<DeveloperToolsSection />);

      // Console logging now visible
      expect(screen.getByText('Console Logging')).toBeInTheDocument();
    });

    it('should handle debugging workflow', () => {
      (useSettingsStore as any).mockReturnValue({
        settings: { ...defaultSettings, developerMode: true },
        updateSettings: mockUpdateSettings
      });

      render(<DeveloperToolsSection />);

      // Set console logging to "all"
      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'all' } });
      expect(mockUpdateSettings).toHaveBeenCalledWith({ consoleLogging: 'all' });
    });

    it('should handle disabling developer mode', () => {
      (useSettingsStore as any).mockReturnValue({
        settings: {
          developerMode: true,
          consoleLogging: 'all'
        },
        updateSettings: mockUpdateSettings
      });

      const { rerender } = render(<DeveloperToolsSection />);

      // Console logging visible
      expect(screen.getByText('Console Logging')).toBeInTheDocument();

      // Disable developer mode
      const toggle = screen.getAllByRole('checkbox')[0];
      fireEvent.click(toggle);
      expect(mockUpdateSettings).toHaveBeenCalledWith({ developerMode: false });

      // Simulate settings update
      (useSettingsStore as any).mockReturnValue({
        settings: {
          developerMode: false,
          consoleLogging: 'all' // Still set but hidden
        },
        updateSettings: mockUpdateSettings
      });
      rerender(<DeveloperToolsSection />);

      // Console logging hidden
      expect(screen.queryByText('Console Logging')).not.toBeInTheDocument();
    });
  });
});
