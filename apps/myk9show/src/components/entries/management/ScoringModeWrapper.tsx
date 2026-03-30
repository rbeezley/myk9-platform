import React, { useMemo } from 'react';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ClassResultsTable } from '@/components/classes/ClassResultsTable';
import { useClassStoreCompat, useClassEntriesWithQuery } from '@/hooks/useClassStoreCompat';
import { useClassEntriesRaw } from '@/hooks/queries/useClassEntriesRaw';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useAuthContext } from '@/hooks/useAuthContext';
import { buildClassConfig, buildScentWorkEntries } from '@/components/classes/ClassDetailsMain.helpers';
import { getClassName } from '@/components/classes/types/classTypes';
import { createUserPermissions } from '@/types/user-permissions';
import type { UserRole } from '@/types/user-permissions';
import type { ClassData, EntryData } from '@/components/classes/types/classTypes';

interface ScoringModeWrapperProps {
  classId: string;
  showId: string;
  trialId: string;
  onBack: () => void;
}

/**
 * Data-bridge wrapper that assembles all props needed by ClassResultsTable
 * when used from the Entry Management page (outside of ClassDetailsPage).
 */
export const ScoringModeWrapper: React.FC<ScoringModeWrapperProps> = ({
  classId,
  showId,
  trialId,
  onBack,
}) => {
  const { getClassById, getEntriesByClass, isLoading: isLoadingClasses } = useClassStoreCompat();
  const {
    entries: mappedEntries,
    isLoading: isLoadingEntries,
    error: entriesError,
  } = useClassEntriesWithQuery(classId);
  const {
    data: rawEntries,
    isLoading: isLoadingRaw,
    error: rawError,
  } = useClassEntriesRaw(classId);
  const { dogs } = useDogStoreCompat();
  const { user, isAdmin, isSecretary, isJudge } = useAuthContext();

  // Get class from the store
  const storeClass = getClassById(classId);

  // Map store class to ClassData (SyncableClassData extends ClassData, so it's compatible)
  const classData: ClassData | null = storeClass;

  // Build display name
  const className = classData ? getClassName(classData) : 'Loading...';

  // Build class config for scent work
  const classConfig = useMemo(() => {
    if (!classData) {
      return {
        element: 'Interior' as const,
        level: 'Novice' as const,
        timeLimit: 180000,
        multiArea: false,
        warningsEnabled: true,
      };
    }
    return buildClassConfig(classData);
  }, [classData]);

  // Map store entries to EntryData format
  const classEntries: EntryData[] = useMemo(() => {
    if (mappedEntries.length > 0) return mappedEntries;
    // Fallback to getEntriesByClass from the compat store
    return getEntriesByClass(classId);
  }, [mappedEntries, getEntriesByClass, classId]);

  // Build ScentWorkEntry[] for ClassResultsTable
  const scentWorkEntries = useMemo(() => {
    if (!classData || classEntries.length === 0) return [];
    return buildScentWorkEntries(classEntries, classData, classConfig, dogs);
  }, [classEntries, classData, classConfig, dogs]);

  // Build user permissions from auth context
  const userPermissions = useMemo(() => {
    let role: UserRole = 'exhibitor';
    if (isAdmin) role = 'admin';
    else if (isSecretary) role = 'secretary';
    else if (isJudge) role = 'judge';

    return createUserPermissions(
      role,
      user?.id,
      user?.user_metadata?.firstName
        ? `${user.user_metadata.firstName} ${user.user_metadata.lastName || ''}`.trim()
        : user?.email,
    );
  }, [isAdmin, isSecretary, isJudge, user]);

  // Loading state
  if (isLoadingRaw || isLoadingEntries || isLoadingClasses) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9" />
          <Skeleton className="h-6 w-48" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Error state
  if (rawError || entriesError) {
    return (
      <Card className="p-8 text-center">
        <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-3" />
        <p className="text-sm text-muted-foreground mb-4">Failed to load class entries</p>
        <Button variant="outline" onClick={onBack}>
          Back to Trial Roster
        </Button>
      </Card>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-lg font-semibold">{className}</h2>
      </div>

      <ClassResultsTable
        entries={scentWorkEntries}
        rawEntries={rawEntries ?? []}
        classConfig={classConfig}
        userPermissions={userPermissions}
        classId={classId}
        showId={showId}
        trialId={trialId}
        classStatus={classData?.status}
        resultsReleasedAt={classData?.results_released_at}
      />
    </div>
  );
};
