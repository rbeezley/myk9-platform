import React from 'react';
import { ChevronRight } from 'lucide-react';

interface SettingsRowProps {
    icon?: React.ReactNode;
    label: string;
    description?: string;
    action?: React.ReactNode;
    onClick?: () => void;
    isDestructive?: boolean;
    className?: string;
}

export const SettingsRow: React.FC<SettingsRowProps> = ({
    icon,
    label,
    description,
    action,
    onClick,
    isDestructive = false,
    className = ''
}) => {
    const [isHovered, setIsHovered] = React.useState(false);

    return (
        <div
            className={`settings-row ${className} ${onClick ? 'clickable' : ''}`}
            onClick={onClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                display: 'flex',
                alignItems: 'center',
                padding: '16px 20px',
                minHeight: '72px',
                cursor: onClick ? 'pointer' : 'default',
                borderBottom: '1px solid var(--border)',
                background: isHovered ? 'var(--muted)' : 'transparent',
                transition: 'all 0.15s ease',
            }}
        >
            {icon && (
                <div style={{
                    marginRight: '16px',
                    color: isDestructive ? '#ef4444' : 'var(--accent-primary)',
                    display: 'flex',
                    alignItems: 'center'
                }}>
                    {icon}
                </div>
            )}

            <div style={{ flex: 1, marginRight: '16px' }}>
                <div style={{
                    fontSize: '16px',
                    fontWeight: 500,
                    color: isDestructive ? '#ef4444' : 'var(--text-primary)',
                    marginBottom: description ? '4px' : '0'
                }}>
                    {label}
                </div>
                {description && (
                    <div style={{
                        fontSize: '13px',
                        color: 'var(--text-secondary)',
                        lineHeight: 1.4
                    }}>
                        {description}
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center' }}>
                {action}
                {onClick && !action && (
                    <ChevronRight size={20} color="var(--text-tertiary)" />
                )}
            </div>
        </div>
    );
};
