import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { buildClasses } from '@/utils/designTokens';

interface JudgeNavigationProps {
  mobile?: boolean;
  onNavigate?: (() => void) | undefined;
}

const JudgeNavigation: React.FC<JudgeNavigationProps> = ({ mobile = false, onNavigate }) => {
  const location = useLocation();

  // Helper function to check if current path matches menu item
  const isActivePath = (path: string) => {
    return location.pathname.startsWith(path);
  };

  return (
    <div className={mobile ? 'flex flex-col gap-2' : 'hidden md:flex items-center gap-6'}>
      <Link
        to="/judge/dashboard"
        onClick={onNavigate}
        className={`${buildClasses.button.ghost} font-medium transition-colors ${
          isActivePath('/judge/dashboard')
            ? 'text-primary'
            : 'text-foreground/80 hover:text-primary'
        }`}
      >
        Dashboard
      </Link>
      <Link
        to="/shows"
        onClick={onNavigate}
        className={`${buildClasses.button.ghost} font-medium transition-colors ${
          isActivePath('/shows') ? 'text-primary' : 'text-foreground/80 hover:text-primary'
        }`}
      >
        Shows
      </Link>
      <Link
        to="/clubs"
        onClick={onNavigate}
        className={`${buildClasses.button.ghost} font-medium transition-colors ${
          isActivePath('/clubs') ? 'text-primary' : 'text-foreground/80 hover:text-primary'
        }`}
      >
        Clubs
      </Link>
      <Link
        to="/calendar"
        onClick={onNavigate}
        className={`${buildClasses.button.ghost} font-medium transition-colors ${
          isActivePath('/calendar') ? 'text-primary' : 'text-foreground/80 hover:text-primary'
        }`}
      >
        Calendar
      </Link>
    </div>
  );
};

export default JudgeNavigation;
