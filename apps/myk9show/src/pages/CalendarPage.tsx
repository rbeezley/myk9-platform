import React, { useState, useEffect, useMemo, useCallback, startTransition } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShowCalendar } from '@/components/shows/ShowCalendar';
import { CalendarSkeleton } from '@/components/common/CalendarSkeleton';
import { RegistrationWorkflow } from '@/components/shows/RegistrationWorkflow';
import { RegistrationProvider } from '@/context/RegistrationContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useShowStore } from '@/store/showStore';
import { useEntryStore } from '@/store/entryStore';
import { useDogStore } from '@/store/dogStore';
import { RegistrationFormData } from '@/types/show-registration-types';
import { logger } from '@/services/LoggingService';
import {
  Plus, 
  Calendar as CalendarIcon, 
  Trophy, 
  Users, 
  Clock,
  Copy
} from 'lucide-react';
import { ShowCreationWizard } from '@/components/shows/wizard';
import { ShowCloneDialog } from '@/components/shows/cloning';
import '@/styles/apple-show-details.css';
import '@/styles/calendar-performance.css';
import { getShowStats } from '@/utils/showFilters';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { PERMISSIONS } from '@/types/auth-types';

export default function CalendarPage() {
  const { shows } = useShowStore();
  const { createEntry, updateStatus } = useEntryStore();
  const { dogs } = useDogStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showRegistration, setShowRegistration] = useState(false);
  const [selectedShowId, setSelectedShowId] = useState<string | null>(null);
  const [showRegistrationHint, setShowRegistrationHint] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [showCloneDialog, setShowCloneDialog] = useState(false);
  const [isCalendarLoading, setIsCalendarLoading] = useState(true);

  // Check for registration intent from URL
  useEffect(() => {
    const intent = searchParams.get('intent');
    if (intent === 'register') {
      setShowRegistrationHint(true);
      // Clear the URL parameter
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  // Simulate calendar loading delay and set loading state
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsCalendarLoading(false);
    }, 100); // Short delay to show skeleton briefly
    
    return () => clearTimeout(timer);
  }, []);

  // Memoize expensive date operations for statistics using shared utility
  const showStats = useMemo(() => getShowStats(shows), [shows]);

  // Memoize event handlers to prevent unnecessary re-renders
  const handleRegisterForShow = useCallback((showId: string) => {
    setSelectedShowId(showId);
    setShowRegistration(true);
  }, []);

  const handleRegistrationComplete = useCallback((registrationData: RegistrationFormData) => {
    logger.debug('Registration completed:', 'pages', { data: registrationData });
    
    // Use startTransition to prevent blocking the main thread during heavy processing
    startTransition(() => {
      try {
        // Create entries directly in the new entry store
        if (registrationData.selectedDogs && registrationData._workflowState?.classSelections && selectedShowId) {
          registrationData.selectedDogs.forEach((dogId: string) => {
            registrationData._workflowState!.classSelections.forEach((classSelection) => {
              const dog = dogs.find(d => d.id === dogId);
              
              // Create entry with registration data for each selected class
              classSelection.selectedClasses.forEach(async (selectedClass) => {
                try {
                  const entry = await createEntry({
                    showId: selectedShowId,
                    classId: selectedClass.classId,
                    dogId: dogId,
                    registrationData: {
                      submittedAt: new Date().toISOString(),
                      handler: dog ? `${dog.name} Owner` : 'Unknown Handler',
                      entryFee: 25, // Default fee
                      paymentStatus: 'paid' // Mark as paid for demo
                    }
                  });
                  
                  // Update status to confirmed
                  await updateStatus(entry.id, 'confirmed', 'system', 'Registration completed');
                  
                  logger.debug(`Created entry for ${dog?.name} in class ${selectedClass.classId}`, 'pages', {});
                } catch (error) {
                  logger.error('Error creating entry:', 'pages', {}, error as Error);
                }
              });
            });
          });
          
          logger.debug('Successfully created entries from registration', 'pages', {});
        }
      } catch (error) {
        logger.error('Error creating entries from registration:', 'pages', {}, error as Error);
      }
    });
    
    setShowRegistration(false);
    setSelectedShowId(null);
  }, [selectedShowId, dogs, createEntry, updateStatus]);

  return (
    <motion.div 
      className="min-h-screen pt-20 pb-8 px-4 sm:px-6 lg:px-8"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <CalendarIcon className="h-8 w-8 text-blue-600" />
              Show Calendar
            </h1>
            <p className="text-muted-foreground mt-1">
              View upcoming shows, manage registrations, and track your schedule
            </p>
          </div>
          
          <div className="flex gap-2">
            <Link to="/shows/browse">
              <Button variant="outline" size="sm">
                <Trophy className="h-4 w-4 mr-2" />
                Browse All Shows
              </Button>
            </Link>
            
            <PermissionGuard permission={PERMISSIONS.SHOW_CREATE}>
              <Button onClick={() => setShowCloneDialog(true)} variant="outline" size="sm">
                <Copy className="h-4 w-4 mr-2" />
                Clone Show
              </Button>
            </PermissionGuard>
            
            <PermissionGuard permission={PERMISSIONS.SHOW_CREATE}>
              <Button onClick={() => setShowWizard(true)} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Create Show
              </Button>
            </PermissionGuard>
          </div>
        </div>

        {/* Registration Hint Banner */}
        {showRegistrationHint && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Trophy className="h-5 w-5 text-blue-600" />
                <div>
                  <h3 className="font-medium text-blue-900 dark:text-blue-100">Ready to Register?</h3>
                  <p className="text-sm text-blue-700 dark:text-blue-200">
                    Click on any show in the calendar below to view details and register your dogs.
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowRegistrationHint(false)}
                className="text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-800"
              >
                ✕
              </Button>
            </div>
          </motion.div>
        )}

        {/* Stats Cards */}
        <div className="apple-show-stats-section">
          <div className="apple-show-stats-grid">
            <div className="apple-show-stat-card">
              <div className="apple-show-stat-layout">
                <div className="apple-show-stat-icon trials">
                  <Trophy className="w-5 h-5" />
                </div>
                
                <div className="apple-show-stat-content">
                  <div className="apple-show-stat-header">
                    <div className="apple-show-stat-title">Total Shows</div>
                    <div className="apple-show-stat-trend">+12%</div>
                  </div>
                  <div className="apple-show-stat-number">{showStats.total}</div>
                </div>
              </div>
              
              <div className="apple-show-stat-details">
                <span>Active: {showStats.upcoming}</span>
                <span>Completed: {showStats.total - showStats.upcoming}</span>
              </div>
              
              <div className="apple-show-stat-progress">
                <div 
                  className="apple-show-stat-progress-bar trials"
                  style={{ width: `${showStats.total > 0 ? Math.round((showStats.upcoming / showStats.total) * 100) : 0}%` }}
                ></div>
              </div>
            </div>

            <div className="apple-show-stat-card">
              <div className="apple-show-stat-layout">
                <div className="apple-show-stat-icon classes">
                  <Clock className="w-5 h-5" />
                </div>
                
                <div className="apple-show-stat-content">
                  <div className="apple-show-stat-header">
                    <div className="apple-show-stat-title">Upcoming</div>
                    <div className="apple-show-stat-trend">+8%</div>
                  </div>
                  <div className="apple-show-stat-number">{showStats.upcoming}</div>
                </div>
              </div>
              
              <div className="apple-show-stat-details">
                <span>This week: {Math.min(showStats.upcoming, 2)}</span>
                <span>Next month: {showStats.upcoming}</span>
              </div>
              
              <div className="apple-show-stat-progress">
                <div 
                  className="apple-show-stat-progress-bar classes"
                  style={{ width: `${showStats.upcoming > 0 ? 75 : 0}%` }}
                ></div>
              </div>
            </div>

            <div className="apple-show-stat-card">
              <div className="apple-show-stat-layout">
                <div className="apple-show-stat-icon entries">
                  <CalendarIcon className="w-5 h-5" />
                </div>
                
                <div className="apple-show-stat-content">
                  <div className="apple-show-stat-header">
                    <div className="apple-show-stat-title">This Month</div>
                    <div className="apple-show-stat-trend">0%</div>
                  </div>
                  <div className="apple-show-stat-number">{showStats.thisMonth}</div>
                </div>
              </div>
              
              <div className="apple-show-stat-details">
                <span>Scheduled: {showStats.thisMonth}</span>
                <span>Available: {5 - showStats.thisMonth}</span>
              </div>
              
              <div className="apple-show-stat-progress">
                <div 
                  className="apple-show-stat-progress-bar entries"
                  style={{ width: `${showStats.thisMonth > 0 ? Math.round((showStats.thisMonth / 5) * 100) : 0}%` }}
                ></div>
              </div>
            </div>

            <div className="apple-show-stat-card">
              <div className="apple-show-stat-layout">
                <div className="apple-show-stat-icon judges">
                  <Users className="w-5 h-5" />
                </div>
                
                <div className="apple-show-stat-content">
                  <div className="apple-show-stat-header">
                    <div className="apple-show-stat-title">Registered</div>
                    <div className="apple-show-stat-trend">+15%</div>
                  </div>
                  <div className="apple-show-stat-number">{showStats.registered}</div>
                </div>
              </div>
              
              <div className="apple-show-stat-details">
                <span>Confirmed: {showStats.registered}</span>
                <span>Pending: 0</span>
              </div>
              
              <div className="apple-show-stat-progress">
                <div 
                  className="apple-show-stat-progress-bar judges"
                  style={{ width: `${showStats.registered > 0 ? 90 : 0}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content - Calendar View Only */}
        {isCalendarLoading ? (
          <CalendarSkeleton />
        ) : (
          <ShowCalendar onShowRegister={handleRegisterForShow} />
        )}

        {/* Registration Dialog */}
        <Dialog open={showRegistration} onOpenChange={setShowRegistration}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
            <DialogHeader>
              <DialogTitle className="text-gray-900 dark:text-gray-100">Show Registration</DialogTitle>
            </DialogHeader>
            <RegistrationProvider>
              <RegistrationWorkflow
                showId={selectedShowId || ''}
                onComplete={handleRegistrationComplete}
                onCancel={() => setShowRegistration(false)}
              />
            </RegistrationProvider>
          </DialogContent>
        </Dialog>

        {/* Show Creation Wizard */}
        <ShowCreationWizard
          open={showWizard}
          onOpenChange={setShowWizard}
        />

        {/* Show Clone Dialog */}
        <ShowCloneDialog
          open={showCloneDialog}
          onOpenChange={setShowCloneDialog}
        />
      </div>
    </motion.div>
  );
}