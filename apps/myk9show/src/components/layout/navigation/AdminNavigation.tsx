import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { buildClasses } from '@/utils/designTokens';

interface AdminNavigationProps {
  mobile?: boolean;
  onNavigate?: (() => void) | undefined;
}

const AdminNavigation: React.FC<AdminNavigationProps> = ({ mobile = false, onNavigate }) => {
  const location = useLocation();

  // Helper function to check if current path matches menu item
  const isActivePath = (path: string) => {
    return location.pathname.startsWith(path);
  };

  return (
    <div className={mobile ? "flex flex-col gap-2" : "hidden md:flex items-center gap-6"}>
      <Link
        to="/admin/dashboard"
        onClick={onNavigate}
        className={`${buildClasses.button.ghost} font-medium transition-colors ${
          isActivePath('/admin') ? 'text-primary' : 'text-foreground/80 hover:text-primary'
        }`}
      >
        Admin Console
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
        People
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
        to="/clubs"
        onClick={onNavigate}
        className={`${buildClasses.button.ghost} font-medium transition-colors ${
          isActivePath('/clubs') ? 'text-primary' : 'text-foreground/80 hover:text-primary'
        }`}
      >
        Clubs
      </Link>
    </div>
  );
};

export default AdminNavigation;