import React, { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import AppHeader from './AppHeader';
import { CollaborationStatusBar } from '@/components/collaboration';
import { useCollaboration } from '@/hooks/useCollaboration';
import { useAuth } from '@/hooks/useAuth';
import { UserPresence } from '@/services/collaboration/CollaborationHubService';

interface AppLayoutProps {
  children?: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const location = useLocation();
  const { user } = useAuth();
  
  // Initialize collaboration with current user
  const collaborationUser: Omit<UserPresence, 'lastSeen'> | undefined = user ? {
    id: user.id,
    name: user.email || 'User',
    email: user.email || '',
    avatar: undefined,
    role: 'exhibitor' as const,
    status: 'online' as const
  } : undefined;

  const { isInitialized, isConnected, updateLocation } = useCollaboration(collaborationUser);

  // Update user location when route changes
  useEffect(() => {
    if (isInitialized) {
      // Extract entity info from location if possible
      const pathSegments = location.pathname.split('/').filter(Boolean);
      let entityType: 'show' | 'dog' | 'person' | 'club' | 'entry' | undefined;
      let entityId: string | undefined;

      // Parse common route patterns
      if (pathSegments.length >= 2) {
        const potentialEntityType = pathSegments[0];
        const potentialEntityId = pathSegments[1];

        // Map route segments to entity types
        const entityTypeMap: Record<string, 'show' | 'dog' | 'person' | 'club' | 'entry'> = {
          'shows': 'show',
          'dogs': 'dog',
          'people': 'person',
          'clubs': 'club',
          'entries': 'entry'
        };

        if (entityTypeMap[potentialEntityType] && potentialEntityId !== 'new') {
          entityType = entityTypeMap[potentialEntityType];
          entityId = potentialEntityId;
        }
      }

      updateLocation(location.pathname, entityId, entityType);
    }
  }, [location.pathname, isInitialized, updateLocation]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader />
      
      <main className="flex-1 relative">
        {children || <Outlet />}
      </main>

      {/* Collaboration status bar - only show when connected */}
      {isInitialized && isConnected && (
        <CollaborationStatusBar />
      )}
    </div>
  );
};

export default AppLayout;