/**
 * Tests for VoiceSettingsSection Component
 *
 * This component provides shared voice configuration (voice selection, speed)
 * for all voice features. The toggles to enable voice are in respective sections.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VoiceSettingsSection } from './VoiceSettingsSection';
import { useSettingsStore } from '@/stores/settingsStore';
import voiceAnnouncementService from '@/services/voiceAnnouncementService';

// Mock the settings store
vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: vi.fn(),
}));

// Mock the voice announcement service
vi.mock('@/services/voiceAnnouncementService', () => ({
  default: {
    testVoice: vi.fn(),
  },
}));

describe('VoiceSettingsSection', () => {
  const mockUpdateSettings = vi.fn();
  const mockGetVoices = vi.fn();

  const defaultSettings = {
    voiceName: '',
    voiceRate: 1.0,
  };

  const mockVoices: SpeechSynthesisVoice[] = [
    {
      name: 'Alex',
      lang: 'en-US',
      voiceURI: 'Alex',
      localService: true,
      default: true,
    } as SpeechSynthesisVoice,
    {
      name: 'Samantha',
      lang: 'en-US',
      voiceURI: 'Samantha',
      localService: true,
      default: false,
    } as SpeechSynthesisVoice,
    {
      name: 'Google UK English Female',
      lang: 'en-GB',
      voiceURI: 'Google UK English Female',
      localService: false,
      default: false,
    } as SpeechSynthesisVoice,
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    (useSettingsStore as any).mockReturnValue({
      settings: defaultSettings,
      updateSettings: mockUpdateSettings,
    });

    // Mock speechSynthesis
    mockGetVoices.mockReturnValue(mockVoices);
    Object.defineProperty(window, 'speechSynthesis', {
      writable: true,
      value: {
        getVoices: mockGetVoices,
        cancel: vi.fn(),
        speak: vi.fn(),
        onvoiceschanged: null,
      },
    });
  });

  describe('Rendering', () => {
    it('should render the section title', () => {
      render(<VoiceSettingsSection />);
      expect(screen.getByText('Voice Settings')).toBeInTheDocument();
    });

    it('should render voice dropdown', () => {
      render(<VoiceSettingsSection />);
      expect(screen.getByText('Voice')).toBeInTheDocument();
    });

    it('should render speed slider', () => {
      render(<VoiceSettingsSection />);
      expect(screen.getByText('Speed: 1.0x')).toBeInTheDocument();
    });

    it('should render test voice option', () => {
      render(<VoiceSettingsSection />);
      expect(screen.getByText('Test Voice')).toBeInTheDocument();
    });
  });

  describe('Voice selection dropdown', () => {
    it('should show "Loading voices..." when no voices available', () => {
      mockGetVoices.mockReturnValue([]);
      render(<VoiceSettingsSection />);
      expect(screen.getByText('Loading voices...')).toBeInTheDocument();
    });

    it('should show "Choose speaker" when voices available', () => {
      render(<VoiceSettingsSection />);
      expect(screen.getByText('Choose speaker')).toBeInTheDocument();
    });

    it('should render Default option', () => {
      render(<VoiceSettingsSection />);
      expect(screen.getByRole('option', { name: 'Default' })).toBeInTheDocument();
    });

    it('should render available English voices', () => {
      render(<VoiceSettingsSection />);
      expect(screen.getByRole('option', { name: 'Alex' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Samantha' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Google UK English Female' })).toBeInTheDocument();
    });

    it('should call updateSettings when voice is changed', () => {
      render(<VoiceSettingsSection />);

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'Alex' } });

      expect(mockUpdateSettings).toHaveBeenCalledWith({ voiceName: 'Alex' });
    });

    it('should disable dropdown when no voices available', () => {
      mockGetVoices.mockReturnValue([]);
      render(<VoiceSettingsSection />);

      const select = screen.getByRole('combobox');
      expect(select).toBeDisabled();
    });

    it('should select the current voice from settings', () => {
      (useSettingsStore as any).mockReturnValue({
        settings: { ...defaultSettings, voiceName: 'Samantha' },
        updateSettings: mockUpdateSettings,
      });

      render(<VoiceSettingsSection />);

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('Samantha');
    });
  });

  describe('Speech rate slider', () => {
    it('should display current speech rate', () => {
      render(<VoiceSettingsSection />);
      expect(screen.getByText('Speed: 1.0x')).toBeInTheDocument();
    });

    it('should display updated speech rate', () => {
      (useSettingsStore as any).mockReturnValue({
        settings: { ...defaultSettings, voiceRate: 1.5 },
        updateSettings: mockUpdateSettings,
      });

      render(<VoiceSettingsSection />);
      expect(screen.getByText('Speed: 1.5x')).toBeInTheDocument();
    });

    it('should call updateSettings when slider is moved', () => {
      render(<VoiceSettingsSection />);

      const slider = screen.getByRole('slider');
      fireEvent.change(slider, { target: { value: '1.5' } });

      expect(mockUpdateSettings).toHaveBeenCalledWith({ voiceRate: 1.5 });
    });

    it('should have correct min and max values', () => {
      render(<VoiceSettingsSection />);

      const slider = screen.getByRole('slider') as HTMLInputElement;
      expect(slider.min).toBe('0.5');
      expect(slider.max).toBe('2.0');
      expect(slider.step).toBe('0.1');
    });

    it('should show min and max labels', () => {
      render(<VoiceSettingsSection />);
      expect(screen.getByText('0.5x')).toBeInTheDocument();
      expect(screen.getByText('2x')).toBeInTheDocument();
    });
  });

  describe('Test voice', () => {
    it('should render test voice row', () => {
      render(<VoiceSettingsSection />);
      expect(screen.getByText('Test Voice')).toBeInTheDocument();
      expect(screen.getByText('Tap to hear a sample')).toBeInTheDocument();
    });

    it('should call voiceAnnouncementService.testVoice when clicked', () => {
      render(<VoiceSettingsSection />);

      const testRow = screen.getByText('Test Voice').closest('.settings-row');
      if (testRow) {
        fireEvent.click(testRow);
      }

      expect(voiceAnnouncementService.testVoice).toHaveBeenCalledWith(
        'This is a test of your selected voice.'
      );
    });

    it('should show "Speaking..." while testing', async () => {
      render(<VoiceSettingsSection />);

      const testRow = screen.getByText('Test Voice').closest('.settings-row');
      if (testRow) {
        fireEvent.click(testRow);
      }

      await waitFor(() => {
        expect(screen.getByText('Speaking...')).toBeInTheDocument();
      });
    });
  });

  describe('Voice loading', () => {
    it('should load voices on mount', () => {
      render(<VoiceSettingsSection />);
      expect(mockGetVoices).toHaveBeenCalled();
    });

    it('should set onvoiceschanged handler', () => {
      render(<VoiceSettingsSection />);
      expect(window.speechSynthesis.onvoiceschanged).toBeTruthy();
    });

    it('should clean up onvoiceschanged handler on unmount', () => {
      const { unmount } = render(<VoiceSettingsSection />);
      unmount();
      expect(window.speechSynthesis.onvoiceschanged).toBeNull();
    });
  });

  describe('Browser compatibility', () => {
    it('should handle missing speechSynthesis gracefully', () => {
      Object.defineProperty(window, 'speechSynthesis', {
        writable: true,
        value: undefined,
      });

      render(<VoiceSettingsSection />);
      expect(screen.getByText('Voice Settings')).toBeInTheDocument();
    });
  });
});
