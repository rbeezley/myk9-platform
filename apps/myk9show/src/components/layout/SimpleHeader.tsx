import React from 'react';
import { Link } from 'react-router-dom';
import { buildClasses } from '@/utils/designTokens';

const SimpleHeader: React.FC = () => {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b bg-background h-16">
      <div className="max-w-7xl mx-auto px-4 h-full">
        <div className="flex items-center justify-between h-full">
          <Link to="/" className="text-xl font-bold text-primary">myK9Show</Link>
          <div className="flex gap-4">
            <Link 
              to="/sign-in" 
              className={`${buildClasses.button.ghost} px-4 py-2 text-sm font-medium text-foreground hover:text-primary transition-colors`}
            >
              Sign In
            </Link>
            <Link 
              to="/sign-up" 
              className={`${buildClasses.button.primary} px-4 py-2 rounded-lg font-medium transition-colors text-sm`}
            >
              Sign Up
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default SimpleHeader;