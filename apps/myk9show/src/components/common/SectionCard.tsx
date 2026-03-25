import React from 'react';
import { clsx } from 'clsx';

interface SectionCardProps {
  children: React.ReactNode;
  className?: string;
}

const SectionCard: React.FC<SectionCardProps> = ({ children, className }) => (
  <div
    className={clsx(
      'bg-card-secondary p-4 rounded-xl shadow-card overflow-hidden flex flex-col gap-2 relative',
      'dark:bg-card',
      className
    )}
  >
    {children}
  </div>
);

export default SectionCard;
