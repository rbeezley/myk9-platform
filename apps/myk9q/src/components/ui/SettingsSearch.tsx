/**
 * Settings Search Component
 *
 * Search and filter functionality for settings page.
 * Supports keyword search with highlighting and category filtering.
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import './SettingsSearch.css';

export interface SearchableSettingmatch {
  /** Setting ID */
  id: string;

  /** Setting title/label */
  title: string;

  /** Setting description/hint */
  description?: string;

  /** Category */
  category: string;

  /** Keywords for search */
  keywords?: string[];

  /** Section ID where this setting lives */
  sectionId: string;
}

export interface SettingsSearchProps {
  /** All searchable settings */
  settings: SearchableSettingmatch[];

  /** Search query */
  query: string;

  /** Callback when query changes */
  onQueryChange: (query: string) => void;

  /** Callback when a setting is selected */
  onSettingSelect?: (setting: SearchableSettingmatch) => void;

  /** Show category filter */
  showCategoryFilter?: boolean;

  /** Placeholder text */
  placeholder?: string;

  /** Auto-focus on mount */
  autoFocus?: boolean;

  /** Controlled selected category */
  selectedCategory?: string;

  /** Callback when category changes */
  onCategoryChange?: (category: string) => void;
}

export function SettingsSearch({
  settings,
  query,
  onQueryChange,
  onSettingSelect,
  showCategoryFilter = true,
  placeholder = 'Search settings...',
  autoFocus = false,
  selectedCategory: controlledCategory,
  onCategoryChange,
}: SettingsSearchProps) {
  const [internalCategory, setInternalCategory] = useState<string>('all');

  const selectedCategory = controlledCategory !== undefined ? controlledCategory : internalCategory;
  const setSelectedCategory = (category: string) => {
    if (onCategoryChange) {
      onCategoryChange(category);
    } else {
      setInternalCategory(category);
    }
  };

  const [showResults, setShowResults] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Get unique categories
  const categories = useMemo(() => {
    const cats = new Set(settings.map((s) => s.category));
    return ['all', ...Array.from(cats).sort()];
  }, [settings]);

  // Filter and search settings
  const filteredSettings = useMemo(() => {
    if (!query.trim()) return [];

    const searchQuery = query.toLowerCase();
    const filtered = settings.filter((setting) => {
      // Category filter
      if (selectedCategory !== 'all' && setting.category !== selectedCategory) {
        return false;
      }

      // Text search
      const searchableText = [
        setting.title,
        setting.description || '',
        ...(setting.keywords || []),
      ].join(' ').toLowerCase();

      return searchableText.includes(searchQuery);
    });

    // Sort by relevance (title matches first)
    return filtered.sort((a, b) => {
      const aTitle = a.title.toLowerCase().includes(searchQuery);
      const bTitle = b.title.toLowerCase().includes(searchQuery);

      if (aTitle && !bTitle) return -1;
      if (!aTitle && bTitle) return 1;
      return 0;
    });
  }, [settings, query, selectedCategory]);

  // Handle click outside to close results
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        resultsRef.current &&
        !resultsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowResults(false);
      inputRef.current?.blur();
    }
  };

  const handleSettingClick = (setting: SearchableSettingmatch) => {
    onSettingSelect?.(setting);
    setShowResults(false);
    onQueryChange('');

    // Scroll to setting
    const sectionElement = document.getElementById(setting.sectionId);
    if (sectionElement) {
      sectionElement.scrollIntoView({ behavior: 'smooth', block: 'start' });

      // Expand section if it's collapsible
      const header = sectionElement.querySelector('[role="button"]') as HTMLElement;
      if (header && header.getAttribute('aria-expanded') === 'false') {
        header.click();
      }

      // Highlight the setting
      setTimeout(() => {
        const settingElement = document.getElementById(setting.id);
        if (settingElement) {
          settingElement.classList.add('highlight-setting');
          setTimeout(() => {
            settingElement.classList.remove('highlight-setting');
          }, 2000);
        }
      }, 500);
    }
  };

  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;

    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return parts.map((part, index) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={index} className="search-highlight">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <div className="settings-search">
      <div className="search-input-container">
        <svg
          className="search-icon"
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M9 17A8 8 0 1 0 9 1a8 8 0 0 0 0 16zM18.5 18.5l-4.35-4.35"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <input
          ref={inputRef}
          type="search"
          className="search-input"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            onQueryChange(e.target.value);
            setShowResults(true);
          }}
          onFocus={() => query && setShowResults(true)}
          onKeyDown={handleKeyDown}
          autoFocus={autoFocus}
          aria-label="Search settings"
          aria-expanded={showResults && filteredSettings.length > 0}
          aria-controls="search-results"
        />
        {query && (
          <button
            className="clear-search"
            onClick={() => {
              onQueryChange('');
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 4L4 12M4 4l8 8"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
      </div>

      {showCategoryFilter && (
        <div className="category-filter">
          <label htmlFor="category-select" className="sr-only">
            Filter by category
          </label>
          <select
            id="category-select"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="category-select"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat === 'all' ? 'All Categories' : cat}
              </option>
            ))}
          </select>
          <svg
            className="category-icon"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M4 6l4 4 4-4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}

      {showResults && query && (
        <div
          ref={resultsRef}
          id="search-results"
          className="search-results"
          role="listbox"
          aria-label="Search results"
        >
          {filteredSettings.length > 0 ? (
            <>
              <div className="results-header">
                {filteredSettings.length} result{filteredSettings.length !== 1 ? 's' : ''}
              </div>
              <ul className="results-list">
                {filteredSettings.map((setting) => (
                  <li key={setting.id} className="result-item">
                    <button
                      className="result-button"
                      onClick={() => handleSettingClick(setting)}
                      role="option"
                      aria-selected="false"
                    >
                      <div className="result-content">
                        <div className="result-title">
                          {highlightText(setting.title, query)}
                        </div>
                        {setting.description && (
                          <div className="result-description">
                            {highlightText(setting.description, query)}
                          </div>
                        )}
                        <div className="result-category">{setting.category}</div>
                      </div>
                      <svg
                        className="result-arrow"
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        aria-hidden="true"
                      >
                        <path
                          d="M6 4l4 4-4 4"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="no-results">
              <p>No settings found for "{query}"</p>
              <p className="no-results-hint">Try different keywords or check the category filter</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Hook to generate searchable settings from the settings page structure
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useSearchableSettings(): SearchableSettingmatch[] {
  return useMemo(
    () => [
      // Mobile settings
      { id: 'oneHandedMode', title: 'One-Handed Mode', description: 'Optimize for thumb reach', category: 'General', sectionId: 'general-section', keywords: ['accessibility', 'thumb', 'reachability'] },
      { id: 'handPreference', title: 'Hand Preference', description: 'Which hand do you use?', category: 'General', sectionId: 'general-section', keywords: ['left', 'right', 'hand'] },
      { id: 'pullToRefresh', title: 'Pull to Refresh', description: 'Swipe down to reload', category: 'General', sectionId: 'general-section', keywords: ['swipe', 'reload', 'refresh'] },
      { id: 'pullSensitivity', title: 'Pull Sensitivity', description: 'How far to pull', category: 'General', sectionId: 'general-section', keywords: ['swipe', 'sensitivity'] },
      { id: 'hapticFeedback', title: 'Haptic Feedback', description: 'Vibration on touch', category: 'General', sectionId: 'general-section', keywords: ['vibration', 'touch', 'feedback'] },

      // Notification settings
      { id: 'enableNotifications', title: 'Enable Notifications', description: 'Show push notifications', category: 'Notifications', sectionId: 'notifications-section', keywords: ['notifications', 'push', 'alerts'] },
      { id: 'notificationSound', title: 'Sound', description: 'Play sound with notifications', category: 'Notifications', sectionId: 'notifications-section', keywords: ['sound', 'audio', 'alerts'] },
      { id: 'showBadges', title: 'Badge Counter', description: 'Show number on app icon', category: 'Notifications', sectionId: 'notifications-section', keywords: ['badge', 'count', 'icon'] },
      { id: 'notifyClassStarting', title: 'Class Starting Soon', description: 'Notify when class is about to start', category: 'Notifications', sectionId: 'notifications-section', keywords: ['class', 'starting', 'alerts'] },
      { id: 'notifyYourTurn', title: 'Your Turn to Compete', description: 'Notify when it\'s your turn', category: 'Notifications', sectionId: 'notifications-section', keywords: ['turn', 'compete', 'alerts'] },
      { id: 'notifyResults', title: 'Results Posted', description: 'Notify when results are available', category: 'Notifications', sectionId: 'notifications-section', keywords: ['results', 'scores', 'alerts'] },
      { id: 'notifyConflicts', title: 'Schedule Conflicts', description: 'Notify about scheduling conflicts', category: 'Notifications', sectionId: 'notifications-section', keywords: ['conflicts', 'schedule', 'alerts'] },
      { id: 'notifySyncErrors', title: 'Sync Errors', description: 'Notify about sync problems', category: 'Notifications', sectionId: 'notifications-section', keywords: ['sync', 'errors', 'alerts'] },

      // Voice settings (Notifications - everyone)
      { id: 'voiceNotifications', title: 'Voice Notifications', description: 'Speak push notifications aloud', category: 'Notifications', sectionId: 'notifications-section', keywords: ['voice', 'speak', 'announce', 'audio', 'tts', 'text-to-speech', 'notifications'] },

      // Voice settings (Scoring - judges only)
      { id: 'voiceAnnouncements', title: 'Voice Announcements (Scoring)', description: 'Speak timer warnings aloud', category: 'Scoring', sectionId: 'scoring-section', keywords: ['voice', 'speak', 'announce', 'audio', 'tts', 'text-to-speech', 'timer', 'scoring'] },

      // Privacy & Security settings
      { id: 'rememberMe', title: 'Remember Me', description: 'Stay logged in on this device', category: 'Privacy', sectionId: 'privacy-section', keywords: ['remember', 'login', 'session'] },
      { id: 'biometricLogin', title: 'Biometric Login', description: 'Use fingerprint/face ID', category: 'Privacy', sectionId: 'privacy-section', keywords: ['biometric', 'fingerprint', 'face'] },

      // Advanced settings
      { id: 'developerMode', title: 'Developer Mode', description: 'Enable debugging tools', category: 'Advanced', sectionId: 'advanced-section', keywords: ['developer', 'debug', 'tools'] },
      { id: 'showFPS', title: 'Show FPS Counter', description: 'Display frames per second', category: 'Advanced', sectionId: 'advanced-section', keywords: ['fps', 'performance', 'debug'] },
      { id: 'showNetworkRequests', title: 'Show Network Requests', description: 'Log network activity', category: 'Advanced', sectionId: 'advanced-section', keywords: ['network', 'requests', 'debug'] },
      { id: 'consoleLogging', title: 'Console Logging', description: 'Control console output', category: 'Advanced', sectionId: 'advanced-section', keywords: ['console', 'logging', 'debug'] },
      { id: 'enableBetaFeatures', title: 'Beta Features', description: 'Try experimental features', category: 'Advanced', sectionId: 'advanced-section', keywords: ['beta', 'experimental', 'features'] },
      { id: 'enablePerformanceMonitoring', title: 'Performance Monitoring', description: 'Track performance metrics', category: 'Advanced', sectionId: 'advanced-section', keywords: ['performance', 'monitoring', 'metrics'] },
    ],
    []
  );
}
