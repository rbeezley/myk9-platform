import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { buildClasses } from '@/utils/designTokens';

const AdminNavigation: React.FC = () => {
  const location = useLocation();

  // Helper function to check if current path matches menu item
  const isActivePath = (path: string) => {
    return location.pathname.startsWith(path);
  };

  return (
    <div className="hidden md:flex items-center gap-6">
      <Link 
        to="/admin/dashboard" 
        className={`${buildClasses.button.ghost} font-medium transition-colors ${
          isActivePath('/admin') ? 'text-primary' : 'text-foreground/80 hover:text-primary'
        }`}
      >
        Admin Console
      </Link>
      <Link 
        to="/browse-shows" 
        className={`${buildClasses.button.ghost} font-medium transition-colors ${
          isActivePath('/browse-shows') || isActivePath('/shows') ? 'text-primary' : 'text-foreground/80 hover:text-primary'
        }`}
      >
        Shows
      </Link>
      <Link 
        to="/users" 
        className={`${buildClasses.button.ghost} font-medium transition-colors ${
          isActivePath('/users') ? 'text-primary' : 'text-foreground/80 hover:text-primary'
        }`}
      >
        Users
      </Link>
      <Link 
        to="/dogs" 
        className={`${buildClasses.button.ghost} font-medium transition-colors ${
          isActivePath('/dogs') ? 'text-primary' : 'text-foreground/80 hover:text-primary'
        }`}
      >
        Dogs
      </Link>
      <Link 
        to="/clubs" 
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