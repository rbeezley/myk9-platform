import React from 'react';
import { clsx } from 'clsx';

interface SectionCardProps {
  children: React.ReactNode;
  className?: string;
}

const SectionCard: React.FC<SectionCardProps> = ({ children, className }) => (
  <div
    className={clsx(
      'bg-card-secondary p-4 rounded-xl border border-gray-200 shadow-lg overflow-hidden flex flex-col gap-2 relative',
      'dark:bg-card dark:border-gray-700',
      className
    )}
  >
    {children}
  </div>
);

export default SectionCard;
