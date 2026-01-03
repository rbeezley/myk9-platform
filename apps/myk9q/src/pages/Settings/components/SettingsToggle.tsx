import React from 'react';
import './SettingsToggle.css';

interface SettingsToggleProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    id?: string;
}

export const SettingsToggle: React.FC<SettingsToggleProps> = ({
    checked,
    onChange,
    disabled = false,
    id
}) => {
    return (
        <label
            className={`settings-toggle ${disabled ? 'disabled' : ''}`}
            htmlFor={id}
        >
            <input
                type="checkbox"
                id={id}
                checked={checked}
                onChange={(e) => !disabled && onChange(e.target.checked)}
                disabled={disabled}
            />
            <span className="toggle-track">
                <span className="toggle-thumb" />
            </span>
        </label>
    );
};
