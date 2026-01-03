import React from 'react';
import { SettingsCard } from './SettingsCard';

interface SettingsSectionProps {
    title?: string;
    children: React.ReactNode;
    className?: string;
}

export const SettingsSection: React.FC<SettingsSectionProps> = ({
    title,
    children,
    className = ''
}) => {
    return (
        <div className={`settings-section ${className}`} style={{ marginBottom: '24px' }}>
            {title && (
                <h2 style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--text-tertiary)',
                    marginLeft: '16px',
                    marginBottom: '8px'
                }}>
                    {title}
                </h2>
            )}
            <SettingsCard>
                {children}
            </SettingsCard>
        </div>
    );
};
