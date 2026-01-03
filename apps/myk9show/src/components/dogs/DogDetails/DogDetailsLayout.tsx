import React, { useEffect, startTransition } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useDogStore } from '@/store/dogStore';
import { useDogSidebarStore } from '@/store/dogSidebarStore';
import { useResizableSidebar } from '@/hooks/useResizableSidebar';
import EntitySidebar from '@/components/common/EntitySidebar';
import EntityPageLayout from '@/components/common/EntityPageLayout';
import EntityCardContainer from '@/components/common/EntityCardContainer';
import DogListItem from './DogSidebar/DogListItem';
import EmptyStateView from './EmptyStateView';

interface DogDetailsLayoutProps {
  children: React.ReactNode;
  className?: string;
}

const DogDetailsLayout: React.FC<DogDetailsLayoutProps> = ({ 
  children,
  className 
}) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dogs = useDogStore(state => state.dogs);
  // Initialize sidebar state based on screen size
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const { isCollapsed, toggleCollapsed } = useResizableSidebar({
    initialWidth: 280,
    minWidth: 200,
    maxWidth: 400,
    storageKey: 'dogSidebarWidth',
    defaultCollapsed: isMobile
  });
  const { setSelectedDogId } = useDogSidebarStore();
  
  // Find the selected dog
  const selectedDog = id ? dogs.find(dog => dog.id === id) : null;
  
  // Update the selected dog ID in the sidebar store when the URL param changes
  useEffect(() => {
    setSelectedDogId(id || null);
  }, [id, setSelectedDogId]);

  // If ID is provided but dog not found, navigate to the first dog
  // Or if no ID is provided and dogs exist, navigate to the first dog
  useEffect(() => {
    if ((id && !selectedDog && dogs.length > 0) || (!id && dogs.length > 0)) {
      startTransition(() => {
        navigate(`/dogs/${dogs[0].id}`);
      });
    }
  }, [id, selectedDog, dogs, navigate]);

  return (
    <>
      
      <div className="flex h-[calc(100vh-64px)] overflow-hidden pt-16 relative bg-background">
      {/* Sidebar */}
      <EntitySidebar
        items={dogs}
        selectedId={id || null}
        onSelect={(dogId) => navigate(`/dogs/${dogId}`)}
        renderItem={(dog, isSelected, isCollapsed) => (
          <DogListItem
            dog={dog}
            isSelected={isSelected}
            isCollapsed={isCollapsed}
            onClick={() => startTransition(() => navigate(`/dogs/${dog.id}`))}
            toggleCollapsed={toggleCollapsed}
          />
        )}
        getSearchText={dog => 
          [dog.callName, ...(dog.registrations?.map(reg => reg.registeredName) || [])].join(' ')
        }
        enableSearch
        enableCollapse
        title=""
        collapsed={isCollapsed}
        onToggleCollapse={toggleCollapsed}
        className={cn(
          "z-20 bg-card",
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
        "flex-1 overflow-auto transition-all duration-200",
        className
      )}>
        {/* Content */}
        {selectedDog ? (
          <EntityPageLayout
            title={selectedDog.callName || ''}
            subtitle={`${selectedDog.registrations?.[0]?.breed || 'No breed specified'} • ${selectedDog.registrations?.[0]?.registeredName || ''}`}
            actions={<></>}
          >
            <EntityCardContainer>
              {children}
            </EntityCardContainer>
          </EntityPageLayout>
        ) : (
          <EmptyStateView isSidebarCollapsed={isCollapsed} />
        )}
      </div>
    </div>
    </>
  );
};

export default DogDetailsLayout;
