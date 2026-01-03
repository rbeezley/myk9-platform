// Main collaboration components
export { default as PresenceIndicator } from './PresenceIndicator';
export { default as LiveUpdateIndicator } from './LiveUpdateIndicator';
export { default as EditingIndicator, InlineEditingIndicator } from './EditingIndicator';
export { default as CollaborationStatusBar } from './CollaborationStatusBar';

// Re-export collaboration services for convenience
export { 
  collaborationHub,
  presenceService,
  liveUpdatesService,
  collaborativeEditingService
} from '@/services/collaboration/CollaborationHubService';

// Re-export hooks
export {
  useCollaboration,
  usePresence,
  useLiveUpdates,
  useCollaborativeEditing,
  useNotifications,
  useCollaborationActivity,
  useCollaborationHealth
} from '@/hooks/useCollaboration';

// Re-export types for external use
export type {
  UserPresence,
  LiveUpdate,
  NotificationEvent,
  CollaborationEvent,
  EditLock,
  TypingIndicator,
  CollaborationStats
} from '@/services/collaboration/CollaborationHubService';