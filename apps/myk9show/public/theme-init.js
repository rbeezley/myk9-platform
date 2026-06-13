/**
 * Blocking theme initialization script.
 * Runs before React to prevent FOUC while staying compatible with script-src 'self'.
 */
(function () {
  try {
    var saved = localStorage.getItem('myK9Q_settings');
    var settings = saved ? JSON.parse(saved) : {};

    if (settings.state && settings.state.settings) settings = settings.state.settings;
    else if (settings.settings) settings = settings.settings;

    var theme = settings.theme || 'auto';
    var isDark =
      theme === 'dark' ||
      (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    // Keep this trio (theme-light/theme-dark + dark + colorScheme) in lockstep
    // with src/context/themeClasses.ts applyThemeClasses() — the canonical
    // applier for the running app. This file duplicates the logic only because
    // it's a pre-React, CSP-safe blocking script that can't import the TS
    // module. If the trio changes there, change it here too.
    document.documentElement.classList.add(isDark ? 'theme-dark' : 'theme-light');
    if (isDark) document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';

    var accentMigration = {
      green: 'grove',
      blue: 'dusk',
      purple: 'heather',
      terracotta: 'clay',
      orange: 'clay',
    };
    var accent = settings.accentColor || 'clay';
    accent = accentMigration[accent] || accent;
    document.documentElement.setAttribute('data-accent', accent);

    var accentColors = {
      clay: '#c96442',
      grove: '#2f8a7f',
      dusk: '#3d6d8c',
      heather: '#7b5aa6',
    };
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', accentColors[accent] || '#c96442');
  } catch (error) {
    document.documentElement.classList.add('theme-light');
    document.documentElement.setAttribute('data-accent', 'clay');
  }
})();
