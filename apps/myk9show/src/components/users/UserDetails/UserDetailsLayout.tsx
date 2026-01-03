import React, { useEffect, startTransition } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useUserStore } from '@/store/userStore';
import { useUserSidebarStore } from '@/store/userSidebarStore';
import { useResizableSidebar } from '@/hooks/useResizableSidebar';
import EntitySidebar from '@/components/common/EntitySidebar';
import UserListItem from './UserSidebar/UserListItem';
import EmptyStateView from './EmptyStateView';

interface PeopleDetailsLayoutProps {
  children: React.ReactNode;
  className?: string;
}

const PeopleDetailsLayout: React.FC<PeopleDetailsLayoutProps> = ({ 
  children,
  className 
}) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const people = useUserStore(state => state.people);
  
  // Initialize sidebar state based on screen size
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const { isCollapsed, toggleCollapsed } = useResizableSidebar({
    initialWidth: 280,
    minWidth: 200,
    maxWidth: 400,
    storageKey: 'peopleSidebarWidth',
    defaultCollapsed: isMobile
  });
  const { setSelectedPersonId } = useUserSidebarStore();
  
  // Find the selected person
  const selectedUser = id ? people.find(person => person.id === id) : null;
  
  // Update the selected person ID in the sidebar store when the URL param changes
  useEffect(() => {
    setSelectedPersonId(id || null);
  }, [id, setSelectedPersonId]);

  // If ID is provided but person not found, navigate to the first person
  useEffect(() => {
    if (id && !selectedUser && people.length > 0) {
      startTransition(() => {
        navigate(`/people/${people[0].id}`);
      });
    }
  }, [id, selectedUser, people, navigate]);

  return (
    <>
      
      <div className="flex h-[calc(100vh-64px)] overflow-hidden pt-16 relative">
        {/* Sidebar */}
      <EntitySidebar
        items={people}
        selectedId={id || null}
        onSelect={(personId) => navigate(`/people/${personId}`)}
        renderItem={(person, isSelected, isCollapsed) => (
          <UserListItem
            person={person}
            isSelected={isSelected}
            isCollapsed={isCollapsed}
            onClick={() => startTransition(() => navigate(`/people/${person.id}`))}
            toggleCollapsed={toggleCollapsed}
          />
        )}
        getSearchText={person => 
          `${person.firstName} ${person.lastName} ${person.email}`.toLowerCase()
        }
        enableSearch
        enableCollapse
        title=""
        collapsed={isCollapsed}
        onToggleCollapse={toggleCollapsed}
        className={cn(
          "z-20",
          // On mobile, position absolutely and add overlay when open
          "md:relative absolute",
          isCollapsed ? "md:w-[80px]" : "w-full md:w-auto"
        )}
      />
      
      {/* Mobile overlay backdrop */}
      {!isCollapsed && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-10 md:hidden"
          onClick={toggleCollapsed}
        />
      )}
      
      {/* Main content */}
      <div className={cn(
        "flex-1 overflow-auto transition-all duration-200 flex flex-col justify-start items-center",
        className
      )}>
        

        
        {/* Content */}
        {selectedUser ? (
          children
        ) : (
          <EmptyStateView isSidebarCollapsed={isCollapsed} />
        )}
      </div>
    </div>
    </>
  );
};

export default PeopleDetailsLayout;
