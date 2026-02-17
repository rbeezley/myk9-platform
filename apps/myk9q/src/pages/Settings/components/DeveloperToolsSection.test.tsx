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
  useSettingsStore: vi.fn(),
}));

/** Type-safe helper to mock useSettingsStore with only the fields the component uses */
function mockSettingsStore(
  overrides: Partial<{ developerMode: boolean; consoleLogging: 'none' | 'errors' | 'all' }> = {}
) {
  const settings = { ...defaultSettings, ...overrides };
  vi.mocked(useSettingsStore).mockReturnValue({
    settings,
    updateSettings: mockUpdateSettings,
  } as unknown as ReturnType<typeof useSettingsStore>);
}

const mockUpdateSettings = vi.fn();

const defaultSettings = {
  developerMode: false,
  consoleLogging: 'none' as 'none' | 'errors' | 'all',
};

describe('DeveloperToolsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSettingsStore();
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
      mockSettingsStore({ developerMode: true });

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
      mockSettingsStore({ developerMode: true });

      render(<DeveloperToolsSection />);

      expect(screen.getByText('Console Logging')).toBeInTheDocument();
    });
  });

  describe('Console Logging', () => {
    beforeEach(() => {
      mockSettingsStore({ developerMode: true });
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
      mockSettingsStore({ developerMode: true, consoleLogging: 'errors' });

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
      mockSettingsStore({ developerMode: true });

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
      mockSettingsStore({ developerMode: true });
      rerender(<DeveloperToolsSection />);

      // Console logging now visible
      expect(screen.getByText('Console Logging')).toBeInTheDocument();
    });

    it('should handle debugging workflow', () => {
      mockSettingsStore({ developerMode: true });

      render(<DeveloperToolsSection />);

      // Set console logging to "all"
      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'all' } });
      expect(mockUpdateSettings).toHaveBeenCalledWith({ consoleLogging: 'all' });
    });

    it('should handle disabling developer mode', () => {
      mockSettingsStore({ developerMode: true, consoleLogging: 'all' });

      const { rerender } = render(<DeveloperToolsSection />);

      // Console logging visible
      expect(screen.getByText('Console Logging')).toBeInTheDocument();

      // Disable developer mode
      const toggle = screen.getAllByRole('checkbox')[0];
      fireEvent.click(toggle);
      expect(mockUpdateSettings).toHaveBeenCalledWith({ developerMode: false });

      // Simulate settings update
      mockSettingsStore({ developerMode: false, consoleLogging: 'all' });
      rerender(<DeveloperToolsSection />);

      // Console logging hidden
      expect(screen.queryByText('Console Logging')).not.toBeInTheDocument();
    });
  });
});
