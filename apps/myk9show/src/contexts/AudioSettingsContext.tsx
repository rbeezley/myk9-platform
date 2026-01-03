/**
 * Audio Settings Context for managing user preferences
 */
import React, { createContext, useState, useCallback, type ReactNode } from 'react';
import { DEFAULT_AUDIO_SETTINGS, type AudioSettings } from '@/constants/audioSettings';


interface AudioSettingsContextType {
  settings: AudioSettings;
  updateSettings: (newSettings: Partial<AudioSettings>) => void;
  resetToDefaults: () => void;
}

const AudioSettingsContext = createContext<AudioSettingsContextType | null>(null);

function AudioSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AudioSettings>(() => {
    // Load from localStorage if available
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('k9show-audio-settings');
        if (saved) {
          return { ...DEFAULT_AUDIO_SETTINGS, ...JSON.parse(saved) };
        }
      } catch (error) {
        console.warn('Failed to load audio settings:', error);
      }
    }
    return DEFAULT_AUDIO_SETTINGS;
  });

  const updateSettings = useCallback((newSettings: Partial<AudioSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...newSettings };
      
      // Save to localStorage
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('k9show-audio-settings', JSON.stringify(updated));
        } catch (error) {
          console.warn('Failed to save audio settings:', error);
        }
      }
      
      return updated;
    });
  }, []);

  const resetToDefaults = useCallback(() => {
    setSettings(DEFAULT_AUDIO_SETTINGS);
    
    // Clear localStorage
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('k9show-audio-settings');
      } catch (error) {
        console.warn('Failed to clear audio settings:', error);
      }
    }
  }, []);

  return (
    <AudioSettingsContext.Provider value={{ settings, updateSettings, resetToDefaults }}>
      {children}
    </AudioSettingsContext.Provider>
  );
}

export { AudioSettingsContext, AudioSettingsProvider };

