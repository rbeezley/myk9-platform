import React from 'react';
import { cn } from '@/lib/utils';

/** Tailwind styles for SettingsToggle */
const styles = {
    toggle: cn(
        "relative inline-block w-[52px] h-8",
        "cursor-pointer",
        "[-webkit-tap-highlight-color:transparent]"
    ),
    toggleDisabled: "opacity-50 cursor-not-allowed",
    input: "peer sr-only",
    track: cn(
        "absolute inset-0 rounded-full",
        "bg-[rgba(120,120,128,0.3)]",
        "transition-all duration-300 ease-[cubic-bezier(0.25,0.8,0.25,1)]",
        "peer-checked:bg-[var(--accent-primary)]",
        "peer-checked:shadow-[0_0_12px_var(--accent-glow)]"
    ),
    thumb: cn(
        "absolute h-7 w-7 left-0.5 bottom-0.5",
        "bg-white rounded-full",
        "shadow-[0_2px_4px_rgba(0,0,0,0.2)]",
        "transition-transform duration-300 ease-[cubic-bezier(0.25,0.8,0.25,1)]",
        "peer-checked:translate-x-5"
    ),
};

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
            className={cn(styles.toggle, disabled && styles.toggleDisabled)}
            htmlFor={id}
        >
            <input
                type="checkbox"
                id={id}
                checked={checked}
                onChange={(e) => !disabled && onChange(e.target.checked)}
                disabled={disabled}
                className={styles.input}
            />
            <span className={styles.track} />
            <span className={styles.thumb} />
        </label>
    );
};
