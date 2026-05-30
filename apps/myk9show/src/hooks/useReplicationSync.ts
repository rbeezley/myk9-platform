import { useContext } from 'react';
import { ReplicationSyncContext } from '@/context/ReplicationSyncContext';

export const useReplicationSync = () => {
  const context = useContext(ReplicationSyncContext);
  if (!context) {
    throw new Error('useReplicationSync must be used within ReplicationSyncProvider');
  }
  return context;
};
