import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

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

/** Tailwind styles for ThemeToggle */
const styles = {
  container: "w-full max-w-[600px] mx-auto my-[var(--token-space-4xl)]",
  card: cn(
    "bg-[var(--card)] border border-[var(--border)] rounded-xl",
    "p-[var(--token-space-3xl)]",
    "shadow-[0_2px_8px_var(--shadow-barely)]",
    "dark:shadow-[0_2px_12px_var(--shadow-medium)]"
  ),
  header: cn(
    "flex items-center justify-between",
    "mb-[var(--token-space-xl)]"
  ),
  title: cn(
    "text-xl font-semibold m-0",
    "text-[var(--foreground)]"
  ),
  badge: cn(
    "bg-[var(--muted)] text-[var(--muted-foreground)]",
    "px-[var(--token-space-lg)] py-[var(--token-space-sm)]",
    "rounded-md text-xs font-medium uppercase tracking-[0.5px]"
  ),
  description: cn(
    "text-[var(--muted-foreground)] leading-relaxed",
    "mb-[var(--token-space-3xl)]"
  ),
  controls: cn(
    "flex flex-col gap-[var(--token-space-lg)]",
    "mb-[var(--token-space-3xl)]",
    "sm:flex-row"
  ),
  option: cn(
    "flex items-center gap-[var(--token-space-xl)]",
    "p-[var(--token-space-xl)]",
    "bg-[var(--background)] border-2 border-[var(--border)] rounded-lg",
    "cursor-pointer text-left w-full",
    "transition-all duration-200",
    "hover:border-[var(--muted-foreground)] hover:-translate-y-0.5",
    "hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)]",
    "sm:flex-1 sm:flex-col sm:text-center sm:items-center sm:p-[var(--token-space-3xl)]"
  ),
  optionActive: cn(
    "border-[var(--primary)] bg-[var(--muted)]",
    "shadow-[0_4px_16px_rgba(0,0,0,0.12)]"
  ),
  colorPreview: cn(
    "w-12 h-12 rounded-lg shrink-0",
    "shadow-[0_2px_8px_var(--shadow-light)]",
    "sm:w-16 sm:h-16"
  ),
  optionContent: cn(
    "flex-1 flex flex-col gap-[var(--token-space-sm)]"
  ),
  optionLabel: "text-base font-semibold text-[var(--foreground)]",
  activeIndicator: cn(
    "text-[var(--primary)] font-semibold text-xl"
  ),
  notice: cn(
    "mt-[var(--token-space-3xl)] p-[var(--token-space-xl)]",
    "bg-[var(--muted)] border border-[var(--primary)] rounded-lg",
    "dark:bg-[var(--muted)]"
  ),
  noticeTitle: cn(
    "block text-[var(--primary)]",
    "mb-[var(--token-space-md)] text-sm font-semibold"
  ),
  noticeText: cn(
    "text-[var(--foreground)] text-sm leading-relaxed m-0"
  ),
};

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
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h3 className={styles.title}>🎨 Theme Colors</h3>
          <span className={styles.badge}>Personalize</span>
        </div>

        <p className={styles.description}>
          Choose your favorite accent color to personalize your myK9Q experience.
        </p>

        <div className={styles.controls}>
          {/* Blue Theme */}
          <button
            className={cn(styles.option, activeTheme === 'blue' && styles.optionActive)}
            onClick={() => switchTheme('blue')}
          >
            <div className={styles.colorPreview} style={{ background: '#007AFF' }}></div>
            <div className={styles.optionContent}>
              <strong className={styles.optionLabel}>Original Blue</strong>
            </div>
            {activeTheme === 'blue' && <span className={styles.activeIndicator}>✓ Active</span>}
          </button>

          {/* Green Theme */}
          <button
            className={cn(styles.option, activeTheme === 'green' && styles.optionActive)}
            onClick={() => switchTheme('green')}
          >
            <div className={styles.colorPreview} style={{ background: '#10b981' }}></div>
            <div className={styles.optionContent}>
              <strong className={styles.optionLabel}>Emerald Green</strong>
            </div>
            {activeTheme === 'green' && <span className={styles.activeIndicator}>✓ Active</span>}
          </button>

          {/* Orange Theme */}
          <button
            className={cn(styles.option, activeTheme === 'orange' && styles.optionActive)}
            onClick={() => switchTheme('orange')}
          >
            <div className={styles.colorPreview} style={{ background: '#f97316' }}></div>
            <div className={styles.optionContent}>
              <strong className={styles.optionLabel}>Vibrant Orange</strong>
            </div>
            {activeTheme === 'orange' && <span className={styles.activeIndicator}>✓ Active</span>}
          </button>

          {/* Purple Theme */}
          <button
            className={cn(styles.option, activeTheme === 'purple' && styles.optionActive)}
            onClick={() => switchTheme('purple')}
          >
            <div className={styles.colorPreview} style={{ background: '#8b5cf6' }}></div>
            <div className={styles.optionContent}>
              <strong className={styles.optionLabel}>Rich Purple</strong>
            </div>
            {activeTheme === 'purple' && <span className={styles.activeIndicator}>✓ Active</span>}
          </button>
        </div>

        {activeTheme === 'green' && (
          <div className={styles.notice}>
            <strong className={styles.noticeTitle}>🟢 Green Theme Active</strong>
            <p className={styles.noticeText}>Navigate through the app to see all changes. Check buttons, badges, and status colors.</p>
          </div>
        )}

        {activeTheme === 'orange' && (
          <div className={styles.notice} style={{ background: 'rgba(249, 115, 22, 0.1)', borderColor: '#f97316' }}>
            <strong className={styles.noticeTitle}>🟠 Orange Theme Active</strong>
            <p className={styles.noticeText}>Navigate through the app to see all changes. Check buttons, badges, and status colors.</p>
          </div>
        )}

        {activeTheme === 'purple' && (
          <div className={styles.notice} style={{ background: 'rgba(139, 92, 246, 0.1)', borderColor: '#8b5cf6' }}>
            <strong className={styles.noticeTitle}>🟣 Purple Theme Active</strong>
            <p className={styles.noticeText}>Navigate through the app to see all changes. Check buttons, badges, and status colors.</p>
          </div>
        )}
      </div>
    </div>
  );
}
