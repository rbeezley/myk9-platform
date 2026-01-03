import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { AppleTabs } from '@/components/ui/apple-tabs';
import { 
  Calendar, 
  Users, 
  Trophy, 
  Clock, 
 
  UserPlus, 
  AlertCircle,
  CheckCircle,
  Settings,
  Eye,
  UserCheck,
  Play,
  Check
} from 'lucide-react';
import { formatDistanceToNow, isBefore, isAfter } from 'date-fns';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole, PERMISSIONS } from '@/types/auth-types';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import Breadcrumb from '@/components/common/Breadcrumb';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';

interface ShowDetailsEnhancedAppleProps {
  showData: Show;
  associatedTrials: Trial[];
  onEditShow: () => void;
  onDeleteShow: () => void;
  onRegisterForShow?: () => void;
  onManageEntries?: () => void;
  onViewResults?: () => void;
}

const ShowDetailsEnhancedApple: React.FC<ShowDetailsEnhancedAppleProps> = ({
  showData,
  associatedTrials,
  onEditShow,
  onDeleteShow: _onDeleteShow, // eslint-disable-line @typescript-eslint/no-unused-vars
  onRegisterForShow,
  onManageEntries,
  onViewResults: _onViewResults // eslint-disable-line @typescript-eslint/no-unused-vars
}) => {
  const navigate = useNavigate();
  const { userWithRoles } = useAuthContext();
  const [activeTab, setActiveTab] = useState('overview');

  // Generate breadcrumb items
  const breadcrumbItems = useBreadcrumb({
    currentPage: 'show',
    show: showData
  });

  // Optimized role calculation with O(1) lookup instead of O(n) array.includes()
  const primaryRole = useMemo(() => {
    if (!userWithRoles?.roles?.length) return UserRole.EXHIBITOR;
    
    // Use Set for O(1) lookup performance
    const roleSet = new Set(userWithRoles.roles);
    const rolePriority = [
      UserRole.SITE_ADMIN,
      UserRole.SECRETARY,
      UserRole.CLUB_ADMIN,
      UserRole.JUDGE,
      UserRole.EXHIBITOR
    ];
    
    // Find first matching role with efficient lookup
    return rolePriority.find(role => roleSet.has(role)) || UserRole.EXHIBITOR;
  }, [userWithRoles?.roles]); // Only depend on roles array, not entire object

  // Registration state logic
  const registrationState = useMemo(() => {
    const now = new Date();
    const entriesOpen = isAfter(now, new Date(showData.entryOpenDate));
    const entriesClose = isBefore(now, new Date(showData.entryCloseDate));
    const canRegister = entriesOpen && entriesClose && showData.status?.toLowerCase() === 'published';
    
    const daysUntilClose = entriesClose 
      ? Math.ceil((new Date(showData.entryCloseDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    
    return {
      canRegister,
      entriesOpen,
      entriesClose,
      isPublished: showData.status?.toLowerCase() === 'published',
      daysUntilClose: Math.max(0, daysUntilClose)
    };
  }, [showData]);

  // Apple CSS status classes
  const getStatusClass = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'draft': return 'apple-show-status-draft';
      case 'unpublished': return 'apple-show-status-unpublished';
      case 'published': return 'apple-show-status-published';
      case 'cancelled': return 'apple-show-status-cancelled';
      default: return 'apple-show-status-published';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'upcoming': return <Clock className="w-3 h-3" />;
      case 'in progress': return <Play className="w-3 h-3" />;
      case 'completed': return <Check className="w-3 h-3" />;
      default: return <Clock className="w-3 h-3" />;
    }
  };

  // Optimized statistics calculations - separate computation from rendering
  const trialStats = useMemo(() => {
    const total = associatedTrials.length;
    const upcoming = associatedTrials.filter(trial => trial.status === 'Upcoming').length;
    const completed = associatedTrials.filter(trial => trial.status === 'Completed').length;
    return { total, upcoming, completed };
  }, [associatedTrials]);

  const derivedStats = useMemo(() => {
    const totalClasses = trialStats.total * 8;
    const totalEntries = trialStats.total * 32;
    return { totalClasses, totalEntries };
  }, [trialStats.total]);

  const stats = useMemo(() => [
    {
      title: "Total Trials",
      value: trialStats.total.toString(),
      trend: "+12%",
      detail1: `Upcoming: ${trialStats.upcoming}`,
      detail2: `Completed: ${trialStats.completed}`,
      progress: trialStats.total > 0 ? Math.round((trialStats.completed / trialStats.total) * 100) : 0,
      type: "trials"
    },
    {
      title: "Total Classes", 
      value: derivedStats.totalClasses.toString(),
      trend: "+8%",
      detail1: `Active: ${trialStats.upcoming * 8}`,
      detail2: `Finished: ${trialStats.completed * 8}`,
      progress: derivedStats.totalClasses > 0 ? Math.round(((trialStats.completed * 8) / derivedStats.totalClasses) * 100) : 0,
      type: "classes"
    },
    {
      title: "Total Entries",
      value: derivedStats.totalEntries.toString(),
      trend: "+15%", 
      detail1: `Registered: ${trialStats.upcoming * 32}`,
      detail2: `Judged: ${trialStats.completed * 32}`,
      progress: derivedStats.totalEntries > 0 ? Math.round(((trialStats.completed * 32) / derivedStats.totalEntries) * 100) : 0,
      type: "entries"
    },
  ], [trialStats, derivedStats]);

  // Memoized role-based dashboard components for performance
  const ExhibitorView = React.memo(() => (
    <div className="apple-show-info-card">
      <div className="apple-show-info-header">
        <div>
          <div className="apple-show-info-title">Registration Information</div>
          <div className="apple-show-subtitle">
            {!registrationState.isPublished ? 'Show not yet published' :
             !registrationState.entriesOpen ? 'Registration not yet open' :
             !registrationState.entriesClose ? 'Registration is closed' :
             `Entries close in ${registrationState.daysUntilClose} days`}
          </div>
        </div>
        {registrationState.canRegister ? (
          <Button onClick={onRegisterForShow} className="apple-action-button apple-action-button-primary">
            <UserPlus className="w-4 h-4" />
            Register Now
          </Button>
        ) : (
          <Button disabled className="apple-action-button">
            <UserPlus className="w-4 h-4" />
            {!registrationState.isPublished ? 'Not Published' :
             !registrationState.entriesOpen ? 'Not Open Yet' : 'Registration Closed'}
          </Button>
        )}
      </div>
      
      <div className="apple-show-info-grid">
        <div className="apple-show-info-item">
          <div className="apple-show-info-label">Entries Open</div>
          <div className="apple-show-info-value">{new Date(showData.entryOpenDate).toLocaleDateString()}</div>
        </div>
        <div className="apple-show-info-item">
          <div className="apple-show-info-label">Entries Close</div>
          <div className="apple-show-info-value">
            {new Date(showData.entryCloseDate).toLocaleDateString()}
            {registrationState.daysUntilClose <= 7 && registrationState.daysUntilClose > 0 && (
              <span className="apple-show-status apple-show-status-cancelled ml-2">
                <AlertCircle className="w-3 h-3" />
                Urgent
              </span>
            )}
          </div>
        </div>
        <div className="apple-show-info-item">
          <div className="apple-show-info-label">Pre-Entry Fee</div>
          <div className="apple-show-info-value">${showData.preEntryFee}</div>
        </div>
        <div className="apple-show-info-item">
          <div className="apple-show-info-label">Day of Show Fee</div>
          <div className="apple-show-info-value">${showData.dayOfShowFee || showData.preEntryFee}</div>
        </div>
      </div>
    </div>
  ));

  const SecretaryView = React.memo(() => (
    <div className="apple-show-info-card">
      <div className="apple-show-info-header">
        <div>
          <div className="apple-show-info-title">Show Management</div>
          <div className="apple-show-subtitle">Administrative tools and quick actions</div>
        </div>
      </div>
      
      <div className="apple-show-info-grid">
        <div className="apple-show-info-item">
          <Button onClick={onManageEntries} className="apple-action-button" variant="outline">
            <Users className="w-4 h-4" />
            Manage Entries
          </Button>
        </div>
        <div className="apple-show-info-item">
          <Button className="apple-action-button" variant="outline">
            <Trophy className="w-4 h-4" />
            Export Reports
          </Button>
        </div>
        <div className="apple-show-info-item">
          <Button className="apple-action-button" variant="outline">
            <CheckCircle className="w-4 h-4" />
            Payment Status
          </Button>
        </div>
        <div className="apple-show-info-item">
          <Button onClick={onEditShow} className="apple-action-button apple-action-button-primary">
            <Settings className="w-4 h-4" />
            Edit Show
          </Button>
        </div>
      </div>
    </div>
  ));

  const JudgeView = React.memo(() => {
    const myAssignments = showData.assignedJudges || [];
    
    return (
      <div className="apple-show-info-card">
        <div className="apple-show-info-header">
          <div>
            <div className="apple-show-info-title">My Assignments</div>
            <div className="apple-show-subtitle">
              {myAssignments.length > 0 ? 'Your judging assignments for this show' : 'No assignments yet'}
            </div>
          </div>
        </div>
        
        {myAssignments.length > 0 ? (
          <div className="apple-show-info-grid">
            {myAssignments.map((assignment, index) => (
              <div key={index} className="apple-show-info-item">
                <div className="apple-show-info-label">Judge Assignment</div>
                <div className="apple-show-info-value">{assignment.judgeName}</div>
                <div className="text-sm text-muted-foreground">
                  {assignment.assignedClasses?.length || 0} classes assigned
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <UserCheck className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <div>No assignments yet</div>
            <div className="text-sm">You'll see your judging assignments here when they're made</div>
          </div>
        )}
      </div>
    );
  });

  // Create tabs configuration based on user role
  const tabsConfig = useMemo(() => {
    const tabs = [
      {
        id: 'overview',
        label: 'Overview',
        description: 'Show statistics and general information',
        content: (
          <div className="space-y-6">
            {/* Statistics Cards */}
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
                          <div className="apple-show-stat-trend">{stat.trend}</div>
                        </div>
                        <div className="apple-show-stat-number">{stat.value}</div>
                      </div>
                    </div>
                    
                    <div className="apple-show-stat-details">
                      <span>{stat.detail1}</span>
                      <span>{stat.detail2}</span>
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

            {/* Show Information Card */}
            <div className="apple-show-info-card">
              <div className="apple-show-info-header">
                <div>
                  <div className="apple-show-info-title">Show Details</div>
                </div>
              </div>
              
              <div className="apple-show-info-grid-4col">
                <div className="apple-show-info-item">
                  <div className="apple-show-info-label">Show Type</div>
                  <div className="apple-show-info-value">{showData.type}</div>
                </div>
                <div className="apple-show-info-item">
                  <div className="apple-show-info-label">Chairman</div>
                  <div className="apple-show-info-value">{showData.chairman}</div>
                </div>
                <div className="apple-show-info-item">
                  <div className="apple-show-info-label">Secretary</div>
                  <div className="apple-show-info-value">{showData.secretary}</div>
                </div>
                <div className="apple-show-info-item">
                  <div className="apple-show-info-label">Entry Fees</div>
                  <div className="apple-show-info-value">${showData.preEntryFee} / ${showData.dayOfShowFee || showData.preEntryFee}</div>
                </div>
              </div>
            </div>
          </div>
        )
      }
    ];

    // Add role-specific tabs
    if (primaryRole === UserRole.EXHIBITOR) {
      tabs.push({
        id: 'registration',
        label: 'Registration',
        description: 'Entry information and registration status',
        content: <ExhibitorView />
      });
    }

    if (primaryRole === UserRole.SECRETARY || primaryRole === UserRole.CLUB_ADMIN || primaryRole === UserRole.SITE_ADMIN) {
      tabs.push({
        id: 'management',
        label: 'Management',
        description: 'Show administration and management tools',
        content: <SecretaryView />
      });
    }

    if (primaryRole === UserRole.JUDGE) {
      tabs.push({
        id: 'assignments',
        label: 'My Assignments',
        description: 'Your judging assignments for this show',
        content: <JudgeView />
      });
    }

    // Add trials tab for everyone
    tabs.push({
      id: 'trials',
      label: 'Trials & Schedule',
      description: 'Show trials and scheduling information',
      content: (
        <div className="apple-trials-section">
          <div className="apple-trials-header">
            <div className="apple-trials-title">
              <div className="apple-trials-icon">
                <Calendar className="w-4 h-4" />
              </div>
              Trials ({trialStats.total})
            </div>
          </div>

          {associatedTrials.length > 0 ? (
            <div className="apple-trials-grid">
              {associatedTrials.map((trial, index) => (
                <div key={trial.id || index} className="apple-trial-card">
                  <div className="apple-trial-header">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="apple-trial-title">{trial.type}</div>
                        <div className={`apple-trial-status apple-trial-status-${trial.status.toLowerCase().replace(' ', '-')}`}>
                          {getStatusIcon(trial.status)}
                          {trial.status}
                        </div>
                      </div>
                      <div className="apple-trial-date mb-3">
                        <div className="font-medium text-foreground">
                          {new Date(trial.trialDate).toLocaleDateString('en-US', { 
                            weekday: 'short', 
                            year: 'numeric', 
                            month: 'short', 
                            day: 'numeric' 
                          })}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(trial.trialDate), { addSuffix: true })}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        <div>
                          <div className="apple-show-info-label">Trial Number</div>
                          <div className="apple-show-info-value text-sm">{trial.trialNumber}</div>
                        </div>
                        <div>
                          <div className="apple-show-info-label">Planned Start</div>
                          <div className="apple-show-info-value text-sm">{trial.plannedStartTime}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="apple-trial-actions">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => navigate(`/trials/${trial.id}`)}
                      className="h-8 w-8 p-0"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="apple-trials-empty">
              <Calendar className="apple-trials-empty-icon" />
              <div className="apple-trials-empty-title">No trials yet</div>
              <div className="apple-trials-empty-description">
                Trials will appear here once they're added to the show.
              </div>
            </div>
          )}
        </div>
      )
    });

    return tabs;
  }, [primaryRole, stats, showData, trialStats.total, associatedTrials, navigate, ExhibitorView, JudgeView, SecretaryView]);

  // Memoized tab change handler to prevent unnecessary re-renders
  const handleTabChange = useCallback((tabId: string) => {
    setActiveTab(tabId);
  }, []);

  return (
    <div className="apple-show-container">
      {/* Breadcrumb Navigation */}
      <div className="apple-breadcrumb">
        <Breadcrumb items={breadcrumbItems} showHomeIcon={true} />
      </div>

      {/* Show Header */}
      <div className="apple-show-header">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-3">
            <div className="apple-show-title">{showData.name}</div>
            <div className={`apple-show-status ${getStatusClass(showData.status)}`}>
              {getStatusIcon(showData.status)}
              {showData.status || 'Published'}
            </div>
          </div>
          
          <div className="apple-show-subtitle mb-6">
            {showData.events && showData.events.length > 0 
              ? showData.events.join(', ')
              : 'Dog show competition with various events and classes.'}
          </div>
          
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              {new Date(showData.startDate).toLocaleDateString()} - {new Date(showData.endDate).toLocaleDateString()}
            </div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              {showData.clubName}
            </div>
          </div>
        </div>

        {/* Primary Action Button - Role-based */}
        <div className="flex items-center gap-3">
          {primaryRole === UserRole.EXHIBITOR && onRegisterForShow && (
            registrationState.canRegister ? (
              <Button 
                onClick={onRegisterForShow} 
                className="apple-action-button apple-action-button-primary"
              >
                <UserPlus className="w-4 h-4" />
                Register for Show
              </Button>
            ) : (
              <Button 
                disabled 
                className="apple-action-button"
                variant="outline"
              >
                <UserPlus className="w-4 h-4" />
                {!registrationState.isPublished ? 'Not Published' :
                 !registrationState.entriesOpen ? 'Not Open Yet' : 'Registration Closed'}
              </Button>
            )
          )}
          
          {(primaryRole === UserRole.SECRETARY || primaryRole === UserRole.CLUB_ADMIN || primaryRole === UserRole.SITE_ADMIN) && (
            <PermissionGuard permission={PERMISSIONS.SHOW_UPDATE}>
              <Button 
                onClick={onEditShow} 
                className="apple-action-button"
                variant="outline"
              >
                <Settings className="w-4 h-4" />
                Manage Show
              </Button>
            </PermissionGuard>
          )}
        </div>
      </div>

      {/* Apple-styled Tabs */}
      <AppleTabs
        tabs={tabsConfig}
        value={activeTab}
        onValueChange={handleTabChange}
      />
    </div>
  );
};

export default ShowDetailsEnhancedApple;