import React, { useState } from 'react';
import { toast } from 'sonner';
import { Clock } from 'lucide-react';
import type { MaxTimeDialogProps } from '@myk9/ringside';
import { Button } from '@/components/ui/button';
import { MaxTimeDialog } from '@/features/at-show/slots/MaxTimeDialog';
import { replicatedClassesTable } from '@/services/replication';
import { scoresheetKeyForClass } from '@/pages/scoring/types';
import { pairedClassOf } from './classTimeLimitPair';

/**
 * Edit Class's one door to a class's time limits (MYK9-2405). The form never carries the limits
 * itself, so a save cannot write, clear or be blocked by one; this opens MaxTimeDialog, which
 * applies the registry rule (a rulebook-fixed limit is read-only there) and saves on this device.
 * It shows no limit value here: the dialog is where the current limit and its rule are read.
 */
export const ClassTimeLimitButton: React.FC<{ classId: string | undefined }> = ({ classId }) => {
  const [classData, setClassData] = useState<MaxTimeDialogProps['classData'] | null>(null);
  const [opening, setOpening] = useState(false);

  if (!classId) return null;

  const open = async () => {
    setOpening(true);
    try {
      const live = await replicatedClassesTable.getClassById(classId);
      if (!live) throw new Error('class not on this device');
      const sheet = await scoresheetKeyForClass(live.trialId, live.name);
      const pair = await pairedClassOf(live);
      setClassData({
        id: live.id,
        element: live.element ?? '',
        level: live.level ?? '',
        class_name: pair?.className ?? live.name,
        ...(pair && { pairedClassId: pair.pairedClassId }),
        per_area_times: sheet === 'AKC_SCENT_WORK' || sheet === 'ASCA_SCENT_DETECTION',
        ...(live.timeLimitSeconds != null && { time_limit_seconds: live.timeLimitSeconds }),
        ...(live.timeLimitArea2Seconds != null && {
          time_limit_area2_seconds: live.timeLimitArea2Seconds,
        }),
        ...(live.timeLimitArea3Seconds != null && {
          time_limit_area3_seconds: live.timeLimitArea3Seconds,
        }),
        ...(live.areaCount != null && { area_count: live.areaCount }),
      });
    } catch {
      toast.error("Couldn't open this class's time limit. Try again.");
    } finally {
      setOpening(false);
    }
  };

  return (
    <>
      <Button type="button" variant="outline" disabled={opening} onClick={() => void open()}>
        <Clock className="mr-2 h-4 w-4" aria-hidden="true" />
        Time limit...
      </Button>
      {classData && (
        <MaxTimeDialog isOpen onClose={() => setClassData(null)} classData={classData} />
      )}
    </>
  );
};
