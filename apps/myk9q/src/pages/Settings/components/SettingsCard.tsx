import React from 'react';

interface SettingsCardProps {
    children: React.ReactNode;
    className?: string;
}

export const SettingsCard: React.FC<SettingsCardProps> = ({ children, className = '' }) => {
    // Check if we're in dark mode
    const isDarkMode = document.documentElement.classList.contains('theme-dark');

    return (
        <div
            className={`settings-card ${className}`}
            style={{
                // Dark mode: slightly lighter than page background, Light mode: white card
                background: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                overflow: 'hidden',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                transition: 'background 0.3s ease',
            }}
        >
            {children}
        </div>
    );
};
