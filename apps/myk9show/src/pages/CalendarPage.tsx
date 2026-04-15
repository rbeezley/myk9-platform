import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShowCalendar } from '@/components/common/LazyComponents';
import { CalendarSkeleton } from '@/components/common/CalendarSkeleton';
import { Button } from '@/components/ui/button';
import { useShowStore } from '@/store/showStore';
import { Plus, Calendar as CalendarIcon, Trophy, Users, Clock, Copy } from 'lucide-react';
import { StatCard, StatsGrid } from '@myk9/ui';
import { ShowCloneDialog } from '@/components/shows/cloning';
import '@/styles/myk9-show-details.css';
import '@/styles/calendar-performance.css';
import { getShowStats } from '@/utils/showFilters';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { PERMISSIONS } from '@/types/auth-types';

export default function CalendarPage() {
  const navigate = useNavigate();
  const { shows } = useShowStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showRegistrationHint, setShowRegistrationHint] = useState(false);
  const [showCloneDialog, setShowCloneDialog] = useState(false);
  const [isCalendarLoading, setIsCalendarLoading] = useState(true);

  // Check for registration intent from URL
  useEffect(() => {
    const intent = searchParams.get('intent');
    if (intent === 'register') {
      queueMicrotask(() => {
        setShowRegistrationHint(true);
        // Clear the URL parameter
        setSearchParams({});
      });
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

  // Navigate to registration wizard page
  const handleRegisterForShow = useCallback(
    (showId: string) => {
      navigate(`/shows/${showId}/register`);
    },
    [navigate]
  );

  return (
    <motion.div
      className="pt-6 pb-8 px-4 sm:px-6 lg:px-8"
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
              <Button onClick={() => navigate('/secretary/create-show/wizard')} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                New Show
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
                  <h3 className="font-medium text-blue-900 dark:text-blue-100">
                    Ready to Register?
                  </h3>
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
        <StatsGrid columns={4}>
          <StatCard
            icon={Trophy}
            title="Total Shows"
            value={showStats.total}
            color="primary"
            subtitle={`Active: ${showStats.upcoming} / Completed: ${showStats.total - showStats.upcoming}`}
            progress={
              showStats.total > 0 ? Math.round((showStats.upcoming / showStats.total) * 100) : 0
            }
          />
          <StatCard
            icon={Clock}
            title="Upcoming"
            value={showStats.upcoming}
            color="blue"
            subtitle={`This week: ${Math.min(showStats.upcoming, 2)}`}
            progress={showStats.upcoming > 0 ? 75 : 0}
          />
          <StatCard
            icon={CalendarIcon}
            title="This Month"
            value={showStats.thisMonth}
            color="amber"
            subtitle={`Scheduled: ${showStats.thisMonth}`}
            progress={showStats.thisMonth > 0 ? Math.round((showStats.thisMonth / 5) * 100) : 0}
          />
          <StatCard
            icon={Users}
            title="Registered"
            value={showStats.registered}
            color="emerald"
            subtitle={`Confirmed: ${showStats.registered}`}
            progress={showStats.registered > 0 ? 90 : 0}
          />
        </StatsGrid>

        {/* Main Content - Calendar View Only */}
        {isCalendarLoading ? (
          <CalendarSkeleton />
        ) : (
          <Suspense fallback={<CalendarSkeleton />}>
            <ShowCalendar onShowRegister={handleRegisterForShow} />
          </Suspense>
        )}

        {/* Show Clone Dialog */}
        <ShowCloneDialog open={showCloneDialog} onOpenChange={setShowCloneDialog} />
      </div>
    </motion.div>
  );
}
