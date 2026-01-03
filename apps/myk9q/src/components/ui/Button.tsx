import React from 'react';
import './shared-ui.css';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'gradient' | 'ghost';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  fullWidth?: boolean;
}

// Haptic feedback is handled globally by useGlobalHaptic hook
export const Button: React.FC<ButtonProps> = ({
  children,
  className = '',
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  ...props
}) => {
  return (
    <button
      className={`btn btn-${variant} btn-${size} ${fullWidth ? 'btn-full' : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};