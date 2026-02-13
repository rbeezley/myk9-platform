import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface ValidationBannerProps {
  messages: string[];
}

const ValidationBanner: React.FC<ValidationBannerProps> = ({ messages }) => {
  if (messages.length === 0) return null;

  return (
    <div className="flex-shrink-0 px-6 py-3 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800/50">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <h4 className="font-medium text-amber-800 dark:text-amber-200 text-sm mb-1">
            Please complete the following to continue:
          </h4>
          <ul className="text-sm text-amber-700 dark:text-amber-300 space-y-0.5">
            {messages.map((message, index) => (
              <li key={index}>{'\u2022'} {message}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ValidationBanner;
