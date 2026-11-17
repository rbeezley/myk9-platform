import React from 'react';
import { ClassResultsTable } from './ClassResultsTable';
import type { ClassDetailsMainProps } from './ClassDetailsMain.types';
import { buildClassConfig, buildScentWorkEntries } from './ClassDetailsMain.helpers';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';

/**
 * The class page's body: the class's entries and released results, read-only for everyone. A class
 * is checked in, scored, run and edited on Show Desk (MYK9-2136).
 */
const ClassDetailsMain: React.FC<ClassDetailsMainProps> = ({
  classData,
  classEntries,
  rawEntries,
  parentShow,
}) => {
  const { dogs } = useDogStoreCompat();

  const scentWorkEntries = React.useMemo(
    () => buildScentWorkEntries(classEntries, classData, buildClassConfig(classData), dogs),
    [classEntries, dogs, classData]
  );

  return (
    <div className="space-y-6" data-testid="class-details-main">
      <ClassResultsTable
        entries={scentWorkEntries}
        rawEntries={rawEntries}
        classId={classData?.id}
        showId={parentShow?.id}
        trialId={classData?.trialId}
        classStatus={classData?.status}
        resultsReleasedAt={classData?.results_released_at}
      />
    </div>
  );
};

export default ClassDetailsMain;
