import { useState, useEffect, useCallback } from 'react';
import './ThemeToggle.css';

/**
 * ThemeToggle - Theme accent color selector
 *
 * This component lets you choose between four primary colors:
 * - Blue (original Apple system color)
 * - Green (matches landing page aesthetic)
 * - Orange (energetic & sporty)
 * - Purple (sophisticated & calming - popular with older female users)
 *
 * Usage: Add <ThemeToggle /> anywhere in your app (e.g., Settings page)
 */

type ThemeColor = 'blue' | 'green' | 'orange' | 'purple';

export function ThemeToggle() {
  const [activeTheme, setActiveTheme] = useState<ThemeColor>(() => {
    // Initialize from localStorage
    const saved = localStorage.getItem('myK9Q_themeColor');
    return (saved as ThemeColor) || 'green';
  });

  const applyTheme = useCallback((theme: ThemeColor) => {
    // Remove all theme CSS links
    const greenLink = document.getElementById('green-theme-link');
    const orangeLink = document.getElementById('orange-theme-link');
    const purpleLink = document.getElementById('purple-theme-link');
    if (greenLink) greenLink.remove();
    if (orangeLink) orangeLink.remove();
    if (purpleLink) purpleLink.remove();

    // Apply selected theme
    if (theme === 'green') {
      const link = document.createElement('link');
      link.id = 'green-theme-link';
      link.rel = 'stylesheet';
      link.href = '/src/styles/green-theme.css';
      document.head.appendChild(link);
    } else if (theme === 'orange') {
      const link = document.createElement('link');
      link.id = 'orange-theme-link';
      link.rel = 'stylesheet';
      link.href = '/src/styles/orange-theme.css';
      document.head.appendChild(link);
    } else if (theme === 'purple') {
      const link = document.createElement('link');
      link.id = 'purple-theme-link';
      link.rel = 'stylesheet';
      link.href = '/src/styles/purple-theme.css';
      document.head.appendChild(link);
    }
    // Blue theme is default, no additional CSS needed
  }, []);

  useEffect(() => {
    // Apply theme based on current state
    applyTheme(activeTheme);
  }, [applyTheme, activeTheme]);

  const switchTheme = (theme: ThemeColor) => {
    setActiveTheme(theme);
    localStorage.setItem('myK9Q_themeColor', theme);
    applyTheme(theme);

    // Force full page reload to ensure all styles apply
    setTimeout(() => {
      window.location.reload();
    }, 100);
  };

  return (
    <div className="theme-toggle-container">
      <div className="theme-toggle-card">
        <div className="theme-toggle-header">
          <h3>🎨 Theme Colors</h3>
          <span className="theme-toggle-badge">Personalize</span>
        </div>

        <p className="theme-toggle-description">
          Choose your favorite accent color to personalize your myK9Q experience.
        </p>

        <div className="theme-toggle-controls">
          {/* Blue Theme */}
          <button
            className={`theme-option ${activeTheme === 'blue' ? 'active' : ''}`}
            onClick={() => switchTheme('blue')}
          >
            <div className="theme-color-preview" style={{ background: '#007AFF' }}></div>
            <div className="theme-option-content">
              <strong>Original Blue</strong>
            </div>
            {activeTheme === 'blue' && <span className="active-indicator">✓ Active</span>}
          </button>

          {/* Green Theme */}
          <button
            className={`theme-option ${activeTheme === 'green' ? 'active' : ''}`}
            onClick={() => switchTheme('green')}
          >
            <div className="theme-color-preview" style={{ background: '#10b981' }}></div>
            <div className="theme-option-content">
              <strong>Emerald Green</strong>
            </div>
            {activeTheme === 'green' && <span className="active-indicator">✓ Active</span>}
          </button>

          {/* Orange Theme */}
          <button
            className={`theme-option ${activeTheme === 'orange' ? 'active' : ''}`}
            onClick={() => switchTheme('orange')}
          >
            <div className="theme-color-preview" style={{ background: '#f97316' }}></div>
            <div className="theme-option-content">
              <strong>Vibrant Orange</strong>
            </div>
            {activeTheme === 'orange' && <span className="active-indicator">✓ Active</span>}
          </button>

          {/* Purple Theme */}
          <button
            className={`theme-option ${activeTheme === 'purple' ? 'active' : ''}`}
            onClick={() => switchTheme('purple')}
          >
            <div className="theme-color-preview" style={{ background: '#8b5cf6' }}></div>
            <div className="theme-option-content">
              <strong>Rich Purple</strong>
            </div>
            {activeTheme === 'purple' && <span className="active-indicator">✓ Active</span>}
          </button>
        </div>

        {activeTheme === 'green' && (
          <div className="theme-notice">
            <strong>🟢 Green Theme Active</strong>
            <p>Navigate through the app to see all changes. Check buttons, badges, and status colors.</p>
          </div>
        )}

        {activeTheme === 'orange' && (
          <div className="theme-notice" style={{ background: 'rgba(249, 115, 22, 0.1)', borderColor: '#f97316' }}>
            <strong>🟠 Orange Theme Active</strong>
            <p>Navigate through the app to see all changes. Check buttons, badges, and status colors.</p>
          </div>
        )}

        {activeTheme === 'purple' && (
          <div className="theme-notice" style={{ background: 'rgba(139, 92, 246, 0.1)', borderColor: '#8b5cf6' }}>
            <strong>🟣 Purple Theme Active</strong>
            <p>Navigate through the app to see all changes. Check buttons, badges, and status colors.</p>
          </div>
        )}
      </div>
    </div>
  );
}
