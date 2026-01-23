import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { buildClasses } from '@/utils/designTokens';

interface ExhibitorNavigationProps {
  mobile?: boolean;
  onNavigate?: (() => void) | undefined;
}

const ExhibitorNavigation: React.FC<ExhibitorNavigationProps> = ({ mobile = false, onNavigate }) => {
  const location = useLocation();

  // Helper function to check if current path matches menu item
  const isActivePath = (path: string) => {
    return location.pathname.startsWith(path);
  };

  return (
    <div className={mobile ? "flex flex-col gap-2" : "hidden md:flex items-center gap-6"}>
      <Link
        to="/exhibitor/dashboard"
        onClick={onNavigate}
        className={`${buildClasses.button.ghost} font-medium transition-colors ${
          isActivePath('/exhibitor/dashboard') ? 'text-primary' : 'text-foreground/80 hover:text-primary'
        }`}
      >
        Dashboard
      </Link>
      <Link
        to="/dogs"
        onClick={onNavigate}
        className={`${buildClasses.button.ghost} font-medium transition-colors ${
          isActivePath('/dogs') ? 'text-primary' : 'text-foreground/80 hover:text-primary'
        }`}
      >
        My Dogs
      </Link>
      <Link
        to="/browse-shows"
        onClick={onNavigate}
        className={`${buildClasses.button.ghost} font-medium transition-colors ${
          isActivePath('/browse-shows') || isActivePath('/shows') || isActivePath('/my-entries') || isActivePath('/entries') ? 'text-primary' : 'text-foreground/80 hover:text-primary'
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

export default ExhibitorNavigation;