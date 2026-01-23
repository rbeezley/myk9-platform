import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { buildClasses } from '@/utils/designTokens';

interface SecretaryNavigationProps {
  mobile?: boolean;
  onNavigate?: (() => void) | undefined;
}

const SecretaryNavigation: React.FC<SecretaryNavigationProps> = ({ mobile = false, onNavigate }) => {
  const location = useLocation();

  // Helper function to check if current path matches menu item
  const isActivePath = (path: string) => {
    return location.pathname.startsWith(path);
  };

  return (
    <div className={mobile ? "flex flex-col gap-2" : "hidden md:flex items-center gap-6"}>
      <Link
        to="/secretary/dashboard"
        onClick={onNavigate}
        className={`${buildClasses.button.ghost} font-medium transition-colors ${
          isActivePath('/secretary/dashboard') ? 'text-primary' : 'text-foreground/80 hover:text-primary'
        }`}
      >
        Dashboard
      </Link>
      <Link
        to="/browse-shows"
        onClick={onNavigate}
        className={`${buildClasses.button.ghost} font-medium transition-colors ${
          isActivePath('/browse-shows') || isActivePath('/shows') ? 'text-primary' : 'text-foreground/80 hover:text-primary'
        }`}
      >
        Shows
      </Link>
      <Link
        to="/users"
        onClick={onNavigate}
        className={`${buildClasses.button.ghost} font-medium transition-colors ${
          isActivePath('/users') ? 'text-primary' : 'text-foreground/80 hover:text-primary'
        }`}
      >
        Users
      </Link>
      <Link
        to="/dogs"
        onClick={onNavigate}
        className={`${buildClasses.button.ghost} font-medium transition-colors ${
          isActivePath('/dogs') ? 'text-primary' : 'text-foreground/80 hover:text-primary'
        }`}
      >
        Dogs
      </Link>
      <Link
        to="/entries"
        onClick={onNavigate}
        className={`${buildClasses.button.ghost} font-medium transition-colors ${
          isActivePath('/entries') ? 'text-primary' : 'text-foreground/80 hover:text-primary'
        }`}
      >
        Entries
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
      <Link
        to="/alerts"
        onClick={onNavigate}
        className={`${buildClasses.button.ghost} font-medium transition-colors ${
          isActivePath('/alerts') ? 'text-primary' : 'text-foreground/80 hover:text-primary'
        }`}
      >
        Alerts
      </Link>
    </div>
  );
};

export default SecretaryNavigation;