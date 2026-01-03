/**
 * Blocking Theme Initialization Script
 * This runs BEFORE React to prevent FOUC
 *
 * CRITICAL: Must be loaded as blocking script in index.html
 * VERSION: 2.1 - Also updates meta theme-color for notification styling
 */

(function() {
  try {
    // CRITICAL: Check if we're on landing or login pages FIRST
    // These pages have their own dark theme regardless of user settings
    const path = window.location.pathname;
    const isLandingOrLoginPage = path === '/' || path === '/login' || path === '/landing';

    if (isLandingOrLoginPage) {
      // Landing/Login pages always use dark theme
      applyDarkLandingTheme();
      return;
    }

    // Read settings from localStorage (synchronous)
    const savedSettings = localStorage.getItem('myK9Q_settings');

    if (!savedSettings) {
      // No saved settings - use defaults (light theme, green accent)
      applyThemeClass('light');
      applyAccentColorClass('green');
      return;
    }

    // Zustand v5 persist stores data in { state: { settings: {...} } } format
    const persistedData = JSON.parse(savedSettings);

    // Extract settings from Zustand persist structure
    let settings = {};
    if (persistedData.state && persistedData.state.settings) {
      settings = persistedData.state.settings;
    } else if (persistedData.settings) {
      settings = persistedData.settings;
    } else {
      settings = persistedData;
    }

    // Apply theme mode (light/dark/auto)
    const themeMode = settings.theme || 'auto';

    if (themeMode === 'auto') {
      // Detect system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      applyThemeClass(prefersDark ? 'dark' : 'light');
    } else {
      applyThemeClass(themeMode);
    }

    // Apply accent color class (new system)
    const accentColor = settings.accentColor || 'green';
    applyAccentColorClass(accentColor);

  } catch (error) {
    // Fail silently - use default light theme
    console.warn('Failed to initialize theme from localStorage:', error);
    applyThemeClass('light');
  }

  function applyThemeClass(theme) {
    const html = document.documentElement;

    if (theme === 'dark') {
      html.classList.add('theme-dark');
      html.classList.remove('theme-light');
      // Set html background immediately to prevent flash (body doesn't exist yet)
      html.style.backgroundColor = '#1a1a1e';
    } else {
      html.classList.add('theme-light');
      html.classList.remove('theme-dark');
      // Set html background immediately to prevent flash
      html.style.backgroundColor = '#F8F7F4';
    }
  }

  function updateMetaThemeColor(color) {
    // Find and update all meta theme-color tags
    const themeColorMetas = document.querySelectorAll('meta[name="theme-color"]');
    themeColorMetas.forEach(function(meta) {
      meta.setAttribute('content', color);
    });
  }

  function applyAccentColorClass(color) {
    const html = document.documentElement;

    // Remove all accent color classes
    html.classList.remove('accent-blue', 'accent-green', 'accent-orange', 'accent-purple');

    // Add selected accent color class
    html.classList.add('accent-' + color);

    // Update meta theme-color to match accent (affects browser chrome and mobile status bar)
    var accentColors = {
      green: '#14b8a6',  // teal
      blue: '#3b82f6',
      orange: '#f97316',
      purple: '#8b5cf6'
    };
    updateMetaThemeColor(accentColors[color] || '#14b8a6');
  }

  /**
   * Apply dark theme for landing/login pages
   * These pages have their own isolated dark design, independent of user settings
   */
  function applyDarkLandingTheme() {
    const html = document.documentElement;

    // Add a special class so CSS knows this is a landing/login page
    html.classList.add('landing-theme');

    // Set dark background immediately (no flash)
    html.style.backgroundColor = '#09090b';

    // Also apply teal accent for landing pages
    html.classList.add('accent-green');
  }
})();
