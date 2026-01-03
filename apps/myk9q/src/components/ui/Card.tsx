import React from 'react';
import './shared-ui.css';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'clickable' | 'scored' | 'unscored';
  onClick?: () => void;
}

// Haptic feedback is handled globally by useGlobalHaptic hook
export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  variant = 'default',
  onClick
}) => {
  const isClickable = variant === 'clickable' || !!onClick;

  return (
    <div
      className={`card ${variant} ${isClickable ? 'clickable' : ''} ${className}`}
      onClick={onClick}
      style={{ cursor: isClickable ? 'pointer' : 'default' }}
    >
      {children}
    </div>
  );
};

interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export const CardHeader: React.FC<CardHeaderProps> = ({ children, className = '' }) => (
  <div className={`card-header ${className}`}>
    {children}
  </div>
);

interface CardContentProps {
  children: React.ReactNode;
  className?: string;
}

export const CardContent: React.FC<CardContentProps> = ({ children, className = '' }) => (
  <div className={`card-content ${className}`}>
    {children}
  </div>
);

interface CardActionsProps {
  children: React.ReactNode;
  className?: string;
}

export const CardActions: React.FC<CardActionsProps> = ({ children, className = '' }) => (
  <div className={`card-actions ${className}`}>
    {children}
  </div>
);