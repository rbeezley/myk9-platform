import React from 'react';

interface RequiredLabelProps {
  children: React.ReactNode;
  required?: boolean;
  className?: string;
}

const RequiredLabel: React.FC<RequiredLabelProps> = ({ children, required = false, className = '' }) => (
  <span className={`flex items-center gap-1 ${className}`}>
    {children}
    {required && <span className="text-red-500">*</span>}
  </span>
);

export default RequiredLabel;
