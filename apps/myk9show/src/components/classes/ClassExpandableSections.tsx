import React from 'react';
import { Clock, UserCheck, ClipboardList, DollarSign, Settings } from 'lucide-react';
import { ClassData } from './types/classTypes';
import ExpandableSection from './ExpandableSection';
import { formatFee } from '@/utils/format';

interface ClassExpandableSectionsProps {
  classData: ClassData;
  timingFieldsCount: number;
  officialsFieldsCount: number;
  requirementsFieldsCount: number;
  feesFieldsCount: number;
  customFieldsCount: number;
  forceExpandAll: boolean | undefined;
  forceCollapseAll: boolean | undefined;
}

const ClassExpandableSections: React.FC<ClassExpandableSectionsProps> = ({
  classData,
  timingFieldsCount,
  officialsFieldsCount,
  requirementsFieldsCount,
  feesFieldsCount,
  customFieldsCount,
  forceExpandAll,
  forceCollapseAll,
}) => {
  return (
    <div className="mt-3 space-y-3">
      {/* Timing Details Section - Utility */}
      <ExpandableSection
        title="Timing Details"
        icon={<Clock className="h-4 w-4" />}
        contentCount={timingFieldsCount}
        storageKey="class-timing"
        priority="utility"
        forceExpanded={forceExpandAll}
        forceCollapsed={forceCollapseAll}
      >
        {classData.estimatedJudgingTime && (
          <div className="myk9-show-info-item">
            <div className="myk9-show-info-label">Estimated Judging Time</div>
            <div className="myk9-show-info-value">{classData.estimatedJudgingTime}</div>
          </div>
        )}
        {classData.timeLimit1 && (
          <div className="myk9-show-info-item">
            <div className="myk9-show-info-label">Time Limit 1</div>
            <div className="myk9-show-info-value">{classData.timeLimit1}</div>
          </div>
        )}
        {classData.timeLimit2 && (
          <div className="myk9-show-info-item">
            <div className="myk9-show-info-label">Time Limit 2</div>
            <div className="myk9-show-info-value">{classData.timeLimit2}</div>
          </div>
        )}
        {classData.timeLimit3 && (
          <div className="myk9-show-info-item">
            <div className="myk9-show-info-label">Time Limit 3</div>
            <div className="myk9-show-info-value">{classData.timeLimit3}</div>
          </div>
        )}
        {classData.startTime && (
          <div className="myk9-show-info-item">
            <div className="myk9-show-info-label">Start Time</div>
            <div className="myk9-show-info-value">
              {new Date(classData.startTime).toLocaleTimeString()}
            </div>
          </div>
        )}
        {classData.endTime && (
          <div className="myk9-show-info-item">
            <div className="myk9-show-info-label">End Time</div>
            <div className="myk9-show-info-value">
              {new Date(classData.endTime).toLocaleTimeString()}
            </div>
          </div>
        )}
      </ExpandableSection>

      {/* Officials Section - Important */}
      <ExpandableSection
        title="Officials"
        icon={<UserCheck className="h-4 w-4" />}
        contentCount={officialsFieldsCount}
        storageKey="class-officials"
        priority="important"
        forceExpanded={forceExpandAll}
        forceCollapsed={forceCollapseAll}
      >
        {classData.gateSteward && (
          <div className="myk9-show-info-item">
            <div className="myk9-show-info-label">Gate Steward</div>
            <div className="myk9-show-info-value">{classData.gateSteward}</div>
          </div>
        )}
        {classData.tableSteward && (
          <div className="myk9-show-info-item">
            <div className="myk9-show-info-label">Table Steward</div>
            <div className="myk9-show-info-value">{classData.tableSteward}</div>
          </div>
        )}
        {classData.timerSteward && (
          <div className="myk9-show-info-item">
            <div className="myk9-show-info-label">Timer Steward</div>
            <div className="myk9-show-info-value">{classData.timerSteward}</div>
          </div>
        )}
        {classData.ringSteward1 && (
          <div className="myk9-show-info-item">
            <div className="myk9-show-info-label">Ring Steward 1</div>
            <div className="myk9-show-info-value">{classData.ringSteward1}</div>
          </div>
        )}
        {classData.ringSteward2 && (
          <div className="myk9-show-info-item">
            <div className="myk9-show-info-label">Ring Steward 2</div>
            <div className="myk9-show-info-value">{classData.ringSteward2}</div>
          </div>
        )}
        {classData.ringSteward3 && (
          <div className="myk9-show-info-item">
            <div className="myk9-show-info-label">Ring Steward 3</div>
            <div className="myk9-show-info-value">{classData.ringSteward3}</div>
          </div>
        )}
      </ExpandableSection>

      {/* Requirements Section - Important */}
      <ExpandableSection
        title="Requirements"
        icon={<ClipboardList className="h-4 w-4" />}
        contentCount={requirementsFieldsCount}
        storageKey="class-requirements"
        priority="important"
        forceExpanded={forceExpandAll}
        forceCollapsed={forceCollapseAll}
      >
        {classData.hidesUsed && (
          <div className="myk9-show-info-item">
            <div className="myk9-show-info-label">Hides Used</div>
            <div className="myk9-show-info-value">{classData.hidesUsed}</div>
          </div>
        )}
        {classData.distractionsUsed && (
          <div className="myk9-show-info-item">
            <div className="myk9-show-info-label">Distractions Used</div>
            <div className="myk9-show-info-value">{classData.distractionsUsed}</div>
          </div>
        )}
        {classData.itemsUsed && (
          <div className="myk9-show-info-item">
            <div className="myk9-show-info-label">Items Used</div>
            <div className="myk9-show-info-value">{classData.itemsUsed}</div>
          </div>
        )}
        {classData.requiresJumpHeight && (
          <div className="myk9-show-info-item">
            <div className="myk9-show-info-label">Requires Jump Height</div>
            <div className="myk9-show-info-value">Yes</div>
          </div>
        )}
      </ExpandableSection>

      {/* Fee Structure Section - Utility */}
      <ExpandableSection
        title="Fee Structure"
        icon={<DollarSign className="h-4 w-4" />}
        contentCount={feesFieldsCount}
        storageKey="class-fees"
        priority="utility"
        forceExpanded={forceExpandAll}
        forceCollapsed={forceCollapseAll}
      >
        {classData.preEntryFee && (
          <div className="myk9-show-info-item">
            <div className="myk9-show-info-label">Pre Entry Fee</div>
            <div className="myk9-show-info-value">{formatFee(classData.preEntryFee)}</div>
          </div>
        )}
        {classData.dayOfShowFee && (
          <div className="myk9-show-info-item">
            <div className="myk9-show-info-label">Day of Show Fee</div>
            <div className="myk9-show-info-value">{formatFee(classData.dayOfShowFee)}</div>
          </div>
        )}
        {classData.entryFee && classData.entryFee !== classData.preEntryFee && (
          <div className="myk9-show-info-item">
            <div className="myk9-show-info-label">Standard Entry Fee</div>
            <div className="myk9-show-info-value">${classData.entryFee}</div>
          </div>
        )}
      </ExpandableSection>

      {/* Custom Fields Section - Utility */}
      {customFieldsCount > 0 && (
        <ExpandableSection
          title="Advanced/Custom"
          icon={<Settings className="h-4 w-4" />}
          contentCount={customFieldsCount}
          storageKey="class-custom"
          priority="utility"
          forceExpanded={forceExpandAll}
          forceCollapsed={forceCollapseAll}
        >
          {classData.customFields &&
            Object.entries(classData.customFields).map(([key, value]) => (
              <div key={key} className="myk9-show-info-item">
                <div className="myk9-show-info-label">
                  {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                </div>
                <div className="myk9-show-info-value">{value}</div>
              </div>
            ))}
        </ExpandableSection>
      )}
    </div>
  );
};

export default ClassExpandableSections;
