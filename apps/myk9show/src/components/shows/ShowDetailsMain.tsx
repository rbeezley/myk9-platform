import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Calendar, Users, Trophy, Plus, Edit, Trash2, MoreVertical, Play, Check, Clock, Eye, UserPlus, Wand2, Copy } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { clearMyK9ShowStorage } from '@/utils/clearStorage';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import Breadcrumb from '@/components/common/Breadcrumb';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import { ShowCreationWizard } from '@/components/shows/wizard';
import { ShowCloneDialog } from '@/components/shows/cloning';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { PERMISSIONS } from '@/types/auth-types';
import ShowDetailsEnhancedApple from './ShowDetails/ShowDetailsEnhancedApple';
import '@/styles/apple-show-details.css';
import { logger } from '@/services/LoggingService';

interface ShowDetailsMainProps {
  showData: Show;
  associatedTrials: Trial[];
  onEditShow: () => void;
  onDeleteShow: () => void;
  onEditTrial: (trial: Trial) => void;
  onDeleteTrial: (trial: Trial) => void;
  onRegisterForShow?: (() => void) | undefined;
  useEnhancedView?: boolean | undefined;
}

const ShowDetailsMain: React.FC<ShowDetailsMainProps> = ({
  showData,
  associatedTrials,
  onEditShow,
  onDeleteShow,
  onEditTrial,
  onDeleteTrial,
  onRegisterForShow,
  useEnhancedView = true,
}) => {
  const navigate = useNavigate();
  const [showWizard, setShowWizard] = useState(false);
  const [wizardEditMode, setWizardEditMode] = useState<{showId: string, mode: 'add-trials' | 'add-classes' | 'edit-show'} | undefined>();
  const [showCloneDialog, setShowCloneDialog] = useState(false);
  
  // Generate breadcrumb items
  const breadcrumbItems = useBreadcrumb({
    currentPage: 'show',
    show: showData
  });

  const handleViewTrial = (trial: Trial) => {
    navigate(`/trials/${trial.id}`);
  };

  const handleAddTrialViaWizard = () => {
    setWizardEditMode({
      showId: showData.id,
      mode: 'add-trials'
    });
    setShowWizard(true);
  };

  const handleAddClassesViaWizard = () => {
    setWizardEditMode({
      showId: showData.id,
      mode: 'add-classes'
    });
    setShowWizard(true);
  };
  // Calculate real statistics based on actual data
  const totalTrials = associatedTrials.length;
  const upcomingTrials = associatedTrials.filter(trial => trial.status === 'Upcoming').length;
  const completedTrials = associatedTrials.filter(trial => trial.status === 'Completed').length;
  
  // Mock class and entry data - in real app, this would come from trials
  const totalClasses = totalTrials * 8; // Approximate 8 classes per trial
  const totalEntries = totalTrials * 32; // Approximate 32 entries per trial
  
  const stats = [
    {
      title: "Total Trials",
      value: totalTrials.toString(),
      trend: "+12%",
      detail1: `Upcoming: ${upcomingTrials}`,
      detail2: `Completed: ${completedTrials}`,
      progress: totalTrials > 0 ? Math.round((completedTrials / totalTrials) * 100) : 0,
      type: "trials"
    },
    {
      title: "Total Classes", 
      value: totalClasses.toString(),
      trend: "+8%",
      detail1: `Active: ${upcomingTrials * 8}`,
      detail2: `Finished: ${completedTrials * 8}`,
      progress: totalClasses > 0 ? Math.round(((completedTrials * 8) / totalClasses) * 100) : 0,
      type: "classes"
    },
    {
      title: "Total Entries",
      value: totalEntries.toString(),
      trend: "+15%", 
      detail1: `Registered: ${upcomingTrials * 32}`,
      detail2: `Judged: ${completedTrials * 32}`,
      progress: totalEntries > 0 ? Math.round(((completedTrials * 32) / totalEntries) * 100) : 0,
      type: "entries"
    },
  ];

  const getStatusClass = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'draft': return 'apple-show-status-draft';
      case 'unpublished': return 'apple-show-status-unpublished';
      case 'published': return 'apple-show-status-published';
      case 'cancelled': return 'apple-show-status-cancelled';
      default: return 'apple-show-status-published';
    }
  };

  const getTrialStatusClass = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'upcoming': return 'apple-trial-status-upcoming';
      case 'in progress': return 'apple-trial-status-in-progress';
      case 'completed': return 'apple-trial-status-completed';
      default: return 'apple-trial-status-upcoming';
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

  // Use enhanced view if enabled
  if (useEnhancedView) {
    return (
      <>
        <ShowDetailsEnhancedApple
          showData={showData}
          associatedTrials={associatedTrials}
          onEditShow={onEditShow}
          onDeleteShow={onDeleteShow}
          onRegisterForShow={onRegisterForShow}
          onManageEntries={() => {
            // TODO: Implement manage entries functionality
            logger.debug('Manage entries clicked', 'shows', {});
          }}
          onViewResults={() => {
            // TODO: Implement view results functionality
            logger.debug('View results clicked', 'shows', {});
          }}
        />
        
        {/* Show Creation Wizard */}
        <ShowCreationWizard
          open={showWizard}
          onOpenChange={(open: boolean) => {
            setShowWizard(open);
            if (!open) {
              setWizardEditMode(undefined);
            }
          }}
          editMode={wizardEditMode}
        />

        {/* Show Clone Dialog */}
        <ShowCloneDialog
          open={showCloneDialog}
          onOpenChange={setShowCloneDialog}
        />
      </>
    );
  }

  return (
    <div className="apple-show-container">
      {/* Breadcrumb Navigation and Register Button */}
      <div className="flex items-center justify-between mb-6">
        <Breadcrumb items={breadcrumbItems} showHomeIcon={true} />
        {onRegisterForShow && (
          <Button
            onClick={onRegisterForShow}
            className="apple-action-button apple-action-button-primary"
          >
            <UserPlus className="w-4 h-4" />
            Register for Show
          </Button>
        )}
      </div>

      {/* Show Information Card */}
      <div className="apple-show-info-card">
        <div className="apple-show-info-header">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="apple-show-info-title">{showData.name}</div>
              <div className={`apple-show-status ${getStatusClass(showData.status)}`}>
                {getStatusIcon(showData.status)}
                {showData.status || 'Upcoming'}
              </div>
            </div>
            
            {/* Show Description/Events - matching Browse Shows cards */}
            <div className="apple-browse-card-description" style={{ 
              fontSize: '15px', 
              lineHeight: '1.5', 
              color: 'var(--muted-foreground)',
              marginBottom: '24px',
              maxWidth: '600px'
            }}>
              {showData.events && showData.events.length > 0 
                ? showData.events.join(', ')
                : 'Dog show competition with various events and classes.'}
            </div>
          </div>
          <PermissionGuard permission={PERMISSIONS.SHOW_UPDATE}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEditShow}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit Show
                </DropdownMenuItem>
                <PermissionGuard permission={PERMISSIONS.SHOW_CREATE}>
                  <DropdownMenuItem onClick={() => setShowWizard(true)}>
                    <Wand2 className="mr-2 h-4 w-4" />
                    Show Creation Wizard (Demo)
                  </DropdownMenuItem>
                </PermissionGuard>
                <PermissionGuard permission={PERMISSIONS.SHOW_CREATE}>
                  <DropdownMenuItem onClick={() => setShowCloneDialog(true)}>
                    <Copy className="mr-2 h-4 w-4" />
                    Clone This Show
                  </DropdownMenuItem>
                </PermissionGuard>
                <PermissionGuard permission={PERMISSIONS.SHOW_MANAGE}>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleAddTrialViaWizard}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Trials (Wizard)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleAddClassesViaWizard}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Classes (Wizard)
                  </DropdownMenuItem>
                </PermissionGuard>
                <PermissionGuard permission={PERMISSIONS.SHOW_DELETE}>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={onDeleteShow}
                    className="text-red-600"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Show
                  </DropdownMenuItem>
                </PermissionGuard>
                <PermissionGuard permission={PERMISSIONS.SYSTEM_ADMIN}>
                  <DropdownMenuItem 
                    onClick={() => {
                      clearMyK9ShowStorage();
                      window.location.reload();
                    }}
                    className="text-red-600"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Reset to Mock Data
                  </DropdownMenuItem>
                </PermissionGuard>
              </DropdownMenuContent>
            </DropdownMenu>
          </PermissionGuard>
        </div>
        
        <div className="apple-show-info-grid-4col">
          <div className="apple-show-info-item">
            <div className="apple-show-info-label">Show Type</div>
            <div className="apple-show-info-value">{showData.type}</div>
          </div>
          <div className="apple-show-info-item">
            <div className="apple-show-info-label">Start Date</div>
            <div className="apple-show-info-value">{new Date(showData.startDate).toLocaleDateString()}</div>
          </div>
          <div className="apple-show-info-item">
            <div className="apple-show-info-label">End Date</div>
            <div className="apple-show-info-value">{new Date(showData.endDate).toLocaleDateString()}</div>
          </div>
          <div className="apple-show-info-item">
            <div className="apple-show-info-label">Host Club</div>
            <div className="apple-show-info-value">{showData.clubName}</div>
          </div>
          <div className="apple-show-info-item">
            <div className="apple-show-info-label">Chairman</div>
            <div className="apple-show-info-value">{showData.chairman}</div>
          </div>
          <div className="apple-show-info-item">
            <div className="apple-show-info-label">Entries Open</div>
            <div className="apple-show-info-value">{new Date(showData.entryOpenDate).toLocaleDateString()}</div>
          </div>
          <div className="apple-show-info-item">
            <div className="apple-show-info-label">Entries Close</div>
            <div className="apple-show-info-value">{new Date(showData.entryCloseDate).toLocaleDateString()}</div>
          </div>
          {showData.assignedJudges && showData.assignedJudges.length > 0 ? (
            <div className="apple-show-info-item">
              <div className="apple-show-info-label">Assigned Judges</div>
              <div className="apple-show-info-value">
                {showData.assignedJudges.map((judge) => (
                  <div key={judge.judgeId} className="mb-1">
                    {judge.judgeName}
                    {judge.assignedClasses && judge.assignedClasses.length > 0 && (
                      <span className="text-sm text-muted-foreground ml-2">
                        ({judge.assignedClasses.length} classes)
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="apple-show-info-item">
              <div className="apple-show-info-label">Assigned Judges</div>
              <div className="apple-show-info-value">No judges assigned</div>
            </div>
          )}
          <div className="apple-show-info-item">
            <div className="apple-show-info-label">Secretary</div>
            <div className="apple-show-info-value">{showData.secretary}</div>
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

      {/* Trials Section */}
      <div className="apple-trials-section">
        <div className="apple-trials-header">
          <div className="apple-trials-title">
            <div className="apple-trials-icon">
              <Calendar className="w-4 h-4" />
            </div>
            Trials ({totalTrials})
          </div>
          <PermissionGuard permission={PERMISSIONS.SHOW_MANAGE}>
            <Button
              onClick={handleAddTrialViaWizard}
              className="apple-action-button apple-action-button-primary"
            >
              <Plus className="w-4 h-4" />
              Add Trial
            </Button>
          </PermissionGuard>
        </div>

        {associatedTrials.length > 0 ? (
          <div className="apple-trials-grid">
            {associatedTrials.map((trial, index) => (
              <div key={trial.id || index} className="apple-trial-card">
                <div className="apple-trial-header">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="apple-trial-title">{trial.type}</div>
                      <div className={`apple-trial-status ${getTrialStatusClass(trial.status)}`}>
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
                    
                    {/* Trial Details Grid */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <div>
                        <div className="apple-show-info-label">Trial Number</div>
                        <div className="apple-show-info-value text-sm">{trial.trialNumber}</div>
                      </div>
                      <div>
                        <div className="apple-show-info-label">Event Number</div>
                        <div className="apple-show-info-value text-sm">{trial.eventNumber}</div>
                      </div>
                      <div>
                        <div className="apple-show-info-label">Planned Start</div>
                        <div className="apple-show-info-value text-sm">{trial.plannedStartTime}</div>
                      </div>
                      <div>
                        <div className="apple-show-info-label">Order</div>
                        <div className="apple-show-info-value text-sm">{trial.order}</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="apple-trial-actions">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleViewTrial(trial)}>
                        <Eye className="mr-2 h-4 w-4" />
                        View Details
                      </DropdownMenuItem>
                      <PermissionGuard permission={PERMISSIONS.SHOW_MANAGE}>
                        <DropdownMenuItem onClick={() => onEditTrial(trial)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit Trial
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onClick={() => onDeleteTrial(trial)}
                          className="text-red-600"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </PermissionGuard>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="apple-trials-empty">
            <Calendar className="apple-trials-empty-icon" />
            <div className="apple-trials-empty-title">No trials yet</div>
            <div className="apple-trials-empty-description">
              Add your first trial to get started with organizing your show.
            </div>
            <PermissionGuard permission={PERMISSIONS.SHOW_MANAGE}>
              <Button
                onClick={handleAddTrialViaWizard}
                className="apple-action-button apple-action-button-primary"
              >
                <Plus className="w-4 h-4" />
                Add First Trial
              </Button>
            </PermissionGuard>
          </div>
        )}
      </div>

      {/* Show Creation Wizard */}
      <ShowCreationWizard
        open={showWizard}
        onOpenChange={(open: boolean) => {
          setShowWizard(open);
          if (!open) {
            setWizardEditMode(undefined);
          }
        }}
        editMode={wizardEditMode}
      />

      {/* Show Clone Dialog */}
      <ShowCloneDialog
        open={showCloneDialog}
        onOpenChange={setShowCloneDialog}
      />
    </div>
  );
};

export default ShowDetailsMain;
