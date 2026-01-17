import React, { useState, useEffect } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { collaborationHub, EditLock, TypingIndicator } from '@/services/collaboration/CollaborationHubService';
import { Lock, Eye, Type, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface EditingIndicatorProps {
  entityType: string;
  entityId: string;
  fieldName?: string;
  className?: string;
  showAsAlert?: boolean;
  showTypingIndicators?: boolean;
}

interface EditingIndicatorState {
  editLock: EditLock | null;
  typingIndicators: TypingIndicator[];
  isLocked: boolean;
}

export const EditingIndicator: React.FC<EditingIndicatorProps> = ({
  entityType,
  entityId,
  fieldName,
  className = '',
  showAsAlert = false,
  showTypingIndicators = true
}) => {
  const [state, setState] = useState<EditingIndicatorState>({
    editLock: null,
    typingIndicators: [],
    isLocked: false
  });

  useEffect(() => {
    const updateState = () => {
      const editLock = collaborationHub.getEditLock(entityType, entityId);
      const isLocked = collaborationHub.isEntityLocked(entityType, entityId);
      let typingIndicators: TypingIndicator[] = [];

      if (fieldName && showTypingIndicators) {
        typingIndicators = collaborationHub.getTypingIndicators(entityType, entityId, fieldName);
      }

      setState({ editLock, isLocked, typingIndicators });
    };

    // Initial load
    updateState();

    // Subscribe to collaboration events
    const unsubscribe = collaborationHub.subscribe((event) => {
      if (event.type === 'edit_lock' || event.type === 'typing') {
        updateState();
      }
    });

    // Refresh every 10 seconds to catch expired locks
    const interval = setInterval(updateState, 10000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [entityType, entityId, fieldName, showTypingIndicators]);

  const getInitials = (name: string): string => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const renderTypingIndicators = () => {
    if (!showTypingIndicators || state.typingIndicators.length === 0) {
      return null;
    }

    return (
      <div className="flex items-center gap-2 mt-2">
        <Type className="w-3 h-3 text-muted-foreground" />
        <div className="flex items-center gap-1">
          {state.typingIndicators.map((indicator, index) => (
            <TooltipProvider key={`${indicator.userId}-${index}`}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1">
                    <Avatar className="h-5 w-5">
                      <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
                        {getInitials(indicator.userName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex space-x-0.5">
                      <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" />
                      <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                      <div className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-sm">{indicator.userName} is typing...</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          {state.typingIndicators.length === 1 
            ? `${state.typingIndicators[0].userName} is typing...`
            : `${state.typingIndicators.length} people are typing...`
          }
        </span>
      </div>
    );
  };

  // Track current time for expiration check
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10000); // Update every 10 seconds
    return () => clearInterval(id);
  }, []);

  const renderEditLockIndicator = () => {
    if (!state.editLock) {
      return null;
    }

    const { editLock } = state;
    const isExpiringSoon = editLock.expiresAt.getTime() - now < 60000; // Less than 1 minute

    if (showAsAlert) {
      return (
        <Alert className={cn(
          'mb-4',
          isExpiringSoon ? 'border-yellow-200 bg-yellow-50' : 'border-blue-200 bg-blue-50'
        )}>
          <Lock className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Avatar className="h-6 w-6">
                <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
                  {getInitials(editLock.userName)}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm">
                <strong>{editLock.userName}</strong> is currently editing this {entityType}.
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span>
                {isExpiringSoon 
                  ? 'Expires soon'
                  : `Expires ${formatDistanceToNow(editLock.expiresAt)} from now`
                }
              </span>
            </div>
          </AlertDescription>
        </Alert>
      );
    }

    return (
      <div className={cn('flex items-center gap-2', className)}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2 px-2 py-1 bg-blue-50 border border-blue-200 rounded-md">
                <Lock className={cn(
                  'w-3 h-3',
                  isExpiringSoon ? 'text-yellow-600' : 'text-blue-600'
                )} />
                <Avatar className="h-5 w-5">
                  <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
                    {getInitials(editLock.userName)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs font-medium text-blue-700">
                  {editLock.userName}
                </span>
                <Badge 
                  variant="secondary" 
                  className={cn(
                    'text-xs',
                    isExpiringSoon ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'
                  )}
                >
                  Editing
                </Badge>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-sm">
                <p className="font-medium">{editLock.userName} is editing</p>
                <p className="text-muted-foreground">
                  Started {formatDistanceToNow(editLock.lockedAt)} ago
                </p>
                <p className="text-muted-foreground">
                  {isExpiringSoon 
                    ? 'Lock expires soon'
                    : `Expires ${formatDistanceToNow(editLock.expiresAt)} from now`
                  }
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  };

  const renderViewingIndicator = () => {
    // Get users who are viewing this entity but not editing
    const activeUsers = collaborationHub.getActiveUsersForEntity(entityType, entityId);
    const viewingUsers = activeUsers.filter(user => 
      user.activity?.type === 'viewing' && 
      (!state.editLock || user.id !== state.editLock.userId)
    );

    if (viewingUsers.length === 0) {
      return null;
    }

    const displayUsers = viewingUsers.slice(0, 3);
    const remainingCount = Math.max(0, viewingUsers.length - 3);

    return (
      <div className="flex items-center gap-2 mt-2">
        <Eye className="w-3 h-3 text-muted-foreground" />
        <div className="flex -space-x-1">
          {displayUsers.map((user) => (
            <TooltipProvider key={user.id}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Avatar className="h-5 w-5 border border-background">
                    <AvatarFallback className="text-xs bg-green-100 text-green-700">
                      {getInitials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-sm">{user.name} is viewing</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
          {remainingCount > 0 && (
            <Avatar className="h-5 w-5 border border-background bg-muted">
              <AvatarFallback className="text-xs">
                +{remainingCount}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {viewingUsers.length === 1 
            ? `${viewingUsers[0].name} is viewing`
            : `${viewingUsers.length} people viewing`
          }
        </span>
      </div>
    );
  };

  // If there's no activity, don't render anything
  if (!state.editLock && state.typingIndicators.length === 0) {
    return null;
  }

  return (
    <div className={cn('space-y-2', className)}>
      {renderEditLockIndicator()}
      {renderTypingIndicators()}
      {!showAsAlert && renderViewingIndicator()}
    </div>
  );
};

// Simplified version for inline use
export const InlineEditingIndicator: React.FC<{
  entityType: string;
  entityId: string;
  className?: string;
}> = ({ entityType, entityId, className = '' }) => {
  const [editLock, setEditLock] = useState<EditLock | null>(null);

  useEffect(() => {
    const updateLock = () => {
      setEditLock(collaborationHub.getEditLock(entityType, entityId));
    };

    updateLock();
    const unsubscribe = collaborationHub.subscribe(updateLock);
    const interval = setInterval(updateLock, 10000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [entityType, entityId]);

  if (!editLock) {
    return null;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="secondary" className={cn('text-xs', className)}>
            <Lock className="w-3 h-3 mr-1" />
            Being edited
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-sm">
            {editLock.userName} is currently editing this {entityType}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default EditingIndicator;