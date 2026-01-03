import React, { useState, useCallback } from 'react';
import { Users, Calendar, Trophy, Edit, Trash2, MoreVertical, Clock, UserCheck, ClipboardList, DollarSign, Settings } from 'lucide-react';
import { ClassData, EntryData } from './types/classTypes';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ClassResultsTable } from './ClassResultsTable';
import ExpandableSection from './ExpandableSection';
import SectionToggleControls from './SectionToggleControls';
import Breadcrumb from '@/components/common/Breadcrumb';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { Show } from '@/types/show-types';
import { Trial } from '@/components/trials/types/trial.types';
import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole } from '@/types/auth-types';
import { createUserPermissions, UserPermissions } from '@/types/user-permissions';
import { useDogStore } from '@/store/dogStore';
import type { 
  ScentWorkEntry, 
  ScentWorkResult, 
  MultiAreaScentWorkResult,
  ScentWorkClassConfig,
  QualificationStatus 
} from '@/types/scent-work-types';
import '@/styles/apple-show-details.css';

interface ClassDetailsMainProps {
  classData: ClassData;
  classEntries: EntryData[];
  parentShow?: Show; // Show type
  parentTrial?: Trial; // Trial type
  isResultsView?: boolean; // Whether this is being viewed in results mode
  onEditClass: () => void;
  onDeleteClass: () => void;
  onEditPhoto?: () => void;
  onViewTrial?: () => void;
  onAddEntry: () => void;
  onDeleteEntry?: (entryId: string) => void;
  onStatusChange?: (newStatus: string) => void;
  onResultUpdate?: (entryId: string, result: Partial<EntryData>) => Promise<void>;
}

const ClassDetailsMain: React.FC<ClassDetailsMainProps> = ({
  classData,
  classEntries,
  parentShow,
  parentTrial,
  isResultsView = false,
  onEditClass,
  onDeleteClass,
  // onEditPhoto,
  // onViewTrial,
  onAddEntry,
  onDeleteEntry,
  onStatusChange,
  onResultUpdate
}) => {
  // Generate breadcrumb items
  const breadcrumbItems = useBreadcrumb({
    currentPage: 'class',
    show: parentShow,
    trial: parentTrial,
    classId: classData.id,
    className: isResultsView ? `${classData.className} - Results` : classData.className
  });

  // Helper function to count populated fields
  const countPopulatedFields = (fields: (string | number | boolean | undefined)[]): number => {
    return fields.filter(field => 
      field !== undefined && 
      field !== null && 
      field !== '' && 
      // For booleans, only count 'true' values since we only show them when true
      (typeof field === 'boolean' ? field === true : field !== 0)
    ).length;
  };

  // Count fields for each section
  const timingFieldsCount = countPopulatedFields([
    classData.estimatedJudgingTime,
    classData.timeLimit1,
    classData.timeLimit2,
    classData.timeLimit3,
    classData.startTime,
    classData.endTime
  ]);
  

  const officialsFieldsCount = countPopulatedFields([
    classData.gateSteward,
    classData.tableSteward,
    classData.timerSteward,
    classData.ringSteward1,
    classData.ringSteward2,
    classData.ringSteward3
  ]);

  const requirementsFieldsCount = countPopulatedFields([
    classData.hidesUsed,
    classData.distractionsUsed,
    classData.itemsUsed,
    classData.requiresJumpHeight
  ]);

  const feesFieldsCount = countPopulatedFields([
    classData.preEntryFee,
    classData.dayOfShowFee,
    classData.entryFee
  ]);

  const customFieldsCount = classData.customFields ? Object.keys(classData.customFields).length : 0;


  // State for section controls
  const [forceExpandAll, setForceExpandAll] = useState<boolean | undefined>(undefined);
  const [forceCollapseAll, setForceCollapseAll] = useState<boolean | undefined>(undefined);

  // Toggle functions for section controls
  const handleExpandAll = () => {
    setForceCollapseAll(undefined);
    setForceExpandAll(true);
    // Reset after a brief moment to allow individual control again
    setTimeout(() => setForceExpandAll(undefined), 200);
  };

  const handleCollapseAll = () => {
    setForceExpandAll(undefined);
    setForceCollapseAll(true);
    // Reset after a brief moment to allow individual control again
    setTimeout(() => setForceCollapseAll(undefined), 200);
  };

  // Calculate CLASS-SPECIFIC statistics from actual entries
  const totalEntries = classEntries.length;
  const qualified = classEntries.filter(entry => entry.status === 'Qualified').length;
  const notQualified = classEntries.filter(entry => entry.status === 'Not Qualified').length;
  const excused = classEntries.filter(entry => entry.status === 'Excused').length;
  const withdrawn = classEntries.filter(entry => entry.status === 'Withdrawn').length;
  const absent = classEntries.filter(entry => entry.status === 'Absent').length;
  
  // Calculate completed vs pending
  const completedEntries = classEntries.filter(entry => 
    entry.time || entry.score || ['Qualified', 'Not Qualified', 'Excused', 'Withdrawn', 'Absent'].includes(entry.status)
  ).length;
  const pendingEntries = totalEntries - completedEntries;
  
  // Check if this is a Scent Work show
  const isScentWork = parentShow?.type?.toLowerCase().includes('scent work') || 
                       parentShow?.type?.toLowerCase().includes('scentwork') ||
                       parentShow?.type?.toLowerCase().includes('nosework');

  // Build stats array conditionally
  const stats = [
    {
      title: "Total Entries",
      value: totalEntries.toString(),
      trend: "",  // Removed misleading hardcoded trend
      detail1: `${completedEntries} completed`,
      detail2: `${pendingEntries} pending`,
      progress: totalEntries > 0 ? Math.round((completedEntries / totalEntries) * 100) : 0,
      type: "entries"
    },
    {
      title: "Qualified Rate", 
      value: `${totalEntries > 0 ? Math.round((qualified / totalEntries) * 100) : 0}%`,
      trend: "",  // Removed misleading hardcoded trend
      detail1: `${qualified} Qualified`,
      detail2: `${notQualified} NQ`,
      detail3: excused + withdrawn + absent > 0 
        ? `${excused + withdrawn + absent} Other` 
        : undefined, // New detail line for other statuses
      progress: totalEntries > 0 ? Math.round((qualified / totalEntries) * 100) : 0,
      type: "classes"
    }
  ];
  
  // Only add average score for non-scent work shows
  if (!isScentWork) {
    const avgScore = classEntries.length > 0 
      ? classEntries.reduce((sum, entry) => sum + (parseFloat(entry.score) || 0), 0) / classEntries.length
      : 0;
      
    stats.push({
      title: "Avg Score",
      value: avgScore > 0 ? avgScore.toFixed(1) : "0",
      trend: "",  // Removed misleading hardcoded trend
      detail1: `Out of 100 points`,
      detail2: `Class average`,
      progress: avgScore > 0 ? Math.round(avgScore) : 0,
      type: "trials"
    });
  }

  const formatClassTitle = useCallback(() => {
    const parts = [classData.element];
    if (classData.level) parts.push(classData.level);
    if (classData.section) parts.push(classData.section);
    return parts.join(' ');
  }, [classData.element, classData.level, classData.section]);

  const getStatusClass = useCallback((status: string) => {
    switch (status?.toLowerCase()) {
      case 'scheduled': return 'apple-show-status-upcoming';
      case 'in progress': return 'apple-show-status-in-progress';
      case 'completed': return 'apple-show-status-completed';
      default: return 'apple-show-status-upcoming';
    }
  }, []);

  const getStatusIcon = useCallback((status: string) => {
    switch (status?.toLowerCase()) {
      case 'scheduled': return <Calendar className="w-3 h-3" />;
      case 'in progress': return <Users className="w-3 h-3" />;
      case 'completed': return <Trophy className="w-3 h-3" />;
      default: return <Calendar className="w-3 h-3" />;
    }
  }, []);

  const handleStatusClick = useCallback(() => {
    if (!onStatusChange) return;
    
    const statusOrder = ['Scheduled', 'In Progress', 'Completed'];
    const currentIndex = statusOrder.indexOf(classData.status);
    const nextIndex = (currentIndex + 1) % statusOrder.length;
    const nextStatus = statusOrder[nextIndex];
    
    onStatusChange(nextStatus);
  }, [classData.status, onStatusChange]);

  // Result Entry navigation handlers
  const { user, hasRole } = useAuthContext();
  const { dogs } = useDogStore();

  // Create user permissions based on role
  const userPermissions: UserPermissions = React.useMemo(() => {
    const displayName = user?.email || 'Unknown User';
    
    if (hasRole(UserRole.SITE_ADMIN)) {
      return createUserPermissions('admin', user?.id, displayName);
    } else if (hasRole(UserRole.SECRETARY)) {
      return createUserPermissions('secretary', user?.id, displayName);
    } else if (hasRole(UserRole.CLUB_ADMIN)) {
      return createUserPermissions('steward', user?.id, displayName);
    } else {
      return createUserPermissions('exhibitor', user?.id, displayName);
    }
  }, [user, hasRole]);

  // Create class configuration for BulkResultEntry
  const classConfig: ScentWorkClassConfig = React.useMemo(() => ({
    element: (classData.element as 'Interior' | 'Exterior' | 'Container' | 'Buried') || 'Interior',
    level: (classData.level as 'Novice' | 'Advanced' | 'Excellent' | 'Masters') || 'Novice',
    timeLimit: (classData.timeLimit1 && parseInt(classData.timeLimit1) * 1000) || 180000, // Convert to milliseconds
    multiArea: false,
    warningsEnabled: true
  }), [classData.element, classData.level, classData.timeLimit1]);

  // Transform classEntries to ScentWorkEntry format for BulkResultEntry
  const scentWorkEntries: ScentWorkEntry[] = React.useMemo(() => {
    return classEntries.map(entry => {
      // Find dog by name since EntryData uses dog name as string
      const dog = dogs.find(d => 
        d.name === entry.dog || 
        d.callName === entry.dog ||
        d.name.toLowerCase() === entry.dog.toLowerCase()
      );
      
      return {
        id: entry.id,
        showId: classData.id, // Use classId as showId for now
        classId: classData.id,
        dogId: dog?.id || entry.id, // Use dog ID if found, fallback to entry ID
        status: 'confirmed' as const,
        registrationData: {
          submittedAt: new Date(),
          handler: entry.handler || 'Unknown Handler',
          entryFee: classData.entryFee ? parseFloat(classData.entryFee.toString()) : 0,
          paymentStatus: 'paid' as const,
          armband: entry.armband || '',
        },
        competitionData: entry.time || entry.score || entry.status ? {
          time: entry.time || '',
          score: entry.score || '',
          qualified: entry.status === 'Qualified' ? true : entry.status === 'Not Qualified' ? false : undefined,
          qualification: entry.status || '',
          qualificationReason: entry.qualificationReason || '',
          placement: entry.placement || '',
          judgeNotes: '',
          recordedBy: 'Secretary',
          recordedAt: new Date().toISOString()
        } : undefined,
        statusHistory: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        classConfig: classConfig,
        // Add registrations from the matched dog
        registrations: dog?.registrations || [],
        displayInfo: {
          armband: entry.armband || '',
          dogName: entry.dog || 'Unknown Dog',
          dogBreed: dog?.registrations?.[0]?.breed || 'Unknown Breed',
          handlerName: entry.handler || 'Unknown Handler',
          dogId: dog?.id || '', 
          handlerId: ''
        },
        judgingState: {
          isInProgress: false,
          currentResult: entry.time || entry.score || entry.status ? {
            entryId: entry.id,
            classId: classData.id,
            searchTime: entry.score ? parseFloat(entry.score) * 1000 : 0,
            maxTimeAllowed: classConfig.timeLimit,
            qualification: entry.status as QualificationStatus,
            qualificationReason: entry.qualificationReason,
            faults: 0,
            judgeNotes: '',
            recordedBy: 'System',
            recordedAt: new Date()
          } : undefined
        }
      };
    });
  }, [classEntries, dogs, classData, classConfig]);



  // Handle results submission from BulkResultEntry
  const handleResultsSubmit = React.useCallback(async (results: (ScentWorkResult | MultiAreaScentWorkResult)[]) => {
    if (!onResultUpdate) return;
    
    try {
      for (const result of results) {
        // Check if it's a ScentWorkResult (has searchTime) or MultiAreaScentWorkResult (has totalSearchTime)
        const searchTime = 'searchTime' in result ? result.searchTime : result.totalSearchTime;
        
        // Transform ScentWorkResult back to EntryData format for onResultUpdate
        const entryUpdate: Partial<EntryData> = {
          time: searchTime ? formatTime(searchTime) : '',
          status: result.qualification, // Don't cast - preserve all qualification values
          qualificationReason: (result as ScentWorkResult).qualificationReason || undefined,
          score: searchTime ? (searchTime / 1000).toString() : '',
          placement: (result as ScentWorkResult & { placementCalculated?: number }).placementCalculated?.toString() || ''
        };
        
        await onResultUpdate(result.entryId, entryUpdate);
      }
    } catch (error) {
      console.error('❌ Error submitting results:', error);
    }
  }, [onResultUpdate]);

  // Helper function to format time from milliseconds to MM:SS.HH format
  const formatTime = (ms: number): string => {
    const totalSeconds = ms / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const hundredths = Math.round((totalSeconds % 1) * 100);
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
  };

  return (
    <div className="apple-show-container">
      {/* Breadcrumb Navigation */}
      <Breadcrumb items={breadcrumbItems} showHomeIcon={true} />

      {/* Class Information Card - using CLASS-SPECIFIC fields */}
      <div className="apple-show-info-card">
        <div className="apple-show-info-header">
          <div>
            <div className="flex items-center gap-3">
              <div className="apple-show-info-title">{formatClassTitle()}</div>
              <button
                onClick={isResultsView ? undefined : handleStatusClick}
                className={`apple-show-status ${getStatusClass(classData.status)} ${onStatusChange && !isResultsView ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                disabled={!onStatusChange || isResultsView}
                title={onStatusChange && !isResultsView ? 'Click to change status' : undefined}
              >
                {getStatusIcon(classData.status)}
                {classData.status || 'Scheduled'}
              </button>
            </div>
          </div>
          {!isResultsView && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEditClass}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit Class
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={onDeleteClass}
                  className="text-red-600"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Class
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        
        {/* Essential Information - Always Visible */}
        <div className="apple-show-info-grid">
          <div className="apple-show-info-item">
            <div className="apple-show-info-label">Trial</div>
            <div className="apple-show-info-value">{classData.trial}</div>
          </div>
          <div className="apple-show-info-item">
            <div className="apple-show-info-label">Trial Date</div>
            <div className="apple-show-info-value">{new Date(classData.trialDate).toLocaleDateString()}</div>
          </div>
          <div className="apple-show-info-item">
            <div className="apple-show-info-label">Judge</div>
            <div className="apple-show-info-value">{classData.judge}</div>
          </div>
          <div className="apple-show-info-item">
            <div className="apple-show-info-label">Class Order</div>
            <div className="apple-show-info-value">#{classData.classOrder}</div>
          </div>
          <div className="apple-show-info-item">
            <div className="apple-show-info-label">Entry Fee</div>
            <div className="apple-show-info-value">${classData.entryFee}</div>
          </div>
          <div className="apple-show-info-item">
            <div className="apple-show-info-label">Max Entries</div>
            <div className="apple-show-info-value">{classData.maxEntries}</div>
          </div>
          <div className="apple-show-info-item">
            <div className="apple-show-info-label">Time Limit</div>
            <div className="apple-show-info-value">{classData.timeLimit1}</div>
          </div>
          <div className="apple-show-info-item">
            <div className="apple-show-info-label">Trial Number</div>
            <div className="apple-show-info-value">{classData.trialNumber}</div>
          </div>
        </div>

        {/* Section Controls */}
        <div className="mt-6 flex justify-end">
          <SectionToggleControls
            onExpandAll={handleExpandAll}
            onCollapseAll={handleCollapseAll}
          />
        </div>

        {/* Expandable Sections for Additional Details */}
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
              <div className="apple-show-info-item">
                <div className="apple-show-info-label">Estimated Judging Time</div>
                <div className="apple-show-info-value">{classData.estimatedJudgingTime}</div>
              </div>
            )}
            {classData.timeLimit1 && (
              <div className="apple-show-info-item">
                <div className="apple-show-info-label">Time Limit 1</div>
                <div className="apple-show-info-value">{classData.timeLimit1}</div>
              </div>
            )}
            {classData.timeLimit2 && (
              <div className="apple-show-info-item">
                <div className="apple-show-info-label">Time Limit 2</div>
                <div className="apple-show-info-value">{classData.timeLimit2}</div>
              </div>
            )}
            {classData.timeLimit3 && (
              <div className="apple-show-info-item">
                <div className="apple-show-info-label">Time Limit 3</div>
                <div className="apple-show-info-value">{classData.timeLimit3}</div>
              </div>
            )}
            {classData.startTime && (
              <div className="apple-show-info-item">
                <div className="apple-show-info-label">Start Time</div>
                <div className="apple-show-info-value">{new Date(classData.startTime).toLocaleTimeString()}</div>
              </div>
            )}
            {classData.endTime && (
              <div className="apple-show-info-item">
                <div className="apple-show-info-label">End Time</div>
                <div className="apple-show-info-value">{new Date(classData.endTime).toLocaleTimeString()}</div>
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
              <div className="apple-show-info-item">
                <div className="apple-show-info-label">Gate Steward</div>
                <div className="apple-show-info-value">{classData.gateSteward}</div>
              </div>
            )}
            {classData.tableSteward && (
              <div className="apple-show-info-item">
                <div className="apple-show-info-label">Table Steward</div>
                <div className="apple-show-info-value">{classData.tableSteward}</div>
              </div>
            )}
            {classData.timerSteward && (
              <div className="apple-show-info-item">
                <div className="apple-show-info-label">Timer Steward</div>
                <div className="apple-show-info-value">{classData.timerSteward}</div>
              </div>
            )}
            {classData.ringSteward1 && (
              <div className="apple-show-info-item">
                <div className="apple-show-info-label">Ring Steward 1</div>
                <div className="apple-show-info-value">{classData.ringSteward1}</div>
              </div>
            )}
            {classData.ringSteward2 && (
              <div className="apple-show-info-item">
                <div className="apple-show-info-label">Ring Steward 2</div>
                <div className="apple-show-info-value">{classData.ringSteward2}</div>
              </div>
            )}
            {classData.ringSteward3 && (
              <div className="apple-show-info-item">
                <div className="apple-show-info-label">Ring Steward 3</div>
                <div className="apple-show-info-value">{classData.ringSteward3}</div>
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
              <div className="apple-show-info-item">
                <div className="apple-show-info-label">Hides Used</div>
                <div className="apple-show-info-value">{classData.hidesUsed}</div>
              </div>
            )}
            {classData.distractionsUsed && (
              <div className="apple-show-info-item">
                <div className="apple-show-info-label">Distractions Used</div>
                <div className="apple-show-info-value">{classData.distractionsUsed}</div>
              </div>
            )}
            {classData.itemsUsed && (
              <div className="apple-show-info-item">
                <div className="apple-show-info-label">Items Used</div>
                <div className="apple-show-info-value">{classData.itemsUsed}</div>
              </div>
            )}
            {classData.requiresJumpHeight && (
              <div className="apple-show-info-item">
                <div className="apple-show-info-label">Requires Jump Height</div>
                <div className="apple-show-info-value">Yes</div>
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
              <div className="apple-show-info-item">
                <div className="apple-show-info-label">Pre Entry Fee</div>
                <div className="apple-show-info-value">${classData.preEntryFee}</div>
              </div>
            )}
            {classData.dayOfShowFee && (
              <div className="apple-show-info-item">
                <div className="apple-show-info-label">Day of Show Fee</div>
                <div className="apple-show-info-value">${classData.dayOfShowFee}</div>
              </div>
            )}
            {classData.entryFee && classData.entryFee !== classData.preEntryFee && (
              <div className="apple-show-info-item">
                <div className="apple-show-info-label">Standard Entry Fee</div>
                <div className="apple-show-info-value">${classData.entryFee}</div>
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
              {classData.customFields && Object.entries(classData.customFields).map(([key, value]) => (
                <div key={key} className="apple-show-info-item">
                  <div className="apple-show-info-label">{key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}</div>
                  <div className="apple-show-info-value">{value}</div>
                </div>
              ))}
            </ExpandableSection>
          )}
        </div>
      </div>

      {/* Statistics Cards - CLASS-SPECIFIC */}
      <div className="apple-show-stats-section">
        <div className="apple-show-stats-grid">
          {stats.map((stat, index) => (
            <div key={index} className="apple-show-stat-card">
              <div className="apple-show-stat-layout">
                <div className={`apple-show-stat-icon ${stat.type}`}>
                  {stat.type === 'trials' && <Calendar className="w-5 h-5" />}
                  {stat.type === 'classes' && <Trophy className="w-5 h-5" />}
                  {stat.type === 'entries' && <Users className="w-5 h-5" />}
                </div>
                
                <div className="apple-show-stat-content">
                  <div className="apple-show-stat-header">
                    <div className="apple-show-stat-title">{stat.title}</div>
                    {stat.trend && <div className="apple-show-stat-trend">{stat.trend}</div>}
                  </div>
                  <div className="apple-show-stat-number">{stat.value}</div>
                </div>
              </div>
              
              <div className="apple-show-stat-details">
                <span>{stat.detail1}</span>
                <span>{stat.detail2}</span>
                {stat.detail3 && <span className="text-xs text-muted-foreground">{stat.detail3}</span>}
              </div>
              
              <div className="apple-show-stat-progress">
                <div 
                  className={`apple-show-stat-progress-bar ${stat.type}`}
                  style={{ width: `${stat.progress}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>


      {/* ENTRIES Section (not Trials) */}
      <ClassResultsTable
        entries={scentWorkEntries}
        classConfig={classConfig}
        userPermissions={userPermissions}
        onResultsSubmit={handleResultsSubmit}
        onDeleteEntry={onDeleteEntry}
        onAddEntry={onAddEntry}
      />
    </div>
  );
};

export default ClassDetailsMain;