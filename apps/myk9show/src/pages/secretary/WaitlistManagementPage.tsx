/**
 * Waitlist Management Page
 *
 * Allows trial secretaries to view and manage class waitlists.
 * Features: class selection, waitlist viewing, promote to accepted, remove from waitlist.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole } from '@/types/auth-types';
import { logger } from '@/services/LoggingService';
import { notificationService } from '@/services/NotificationService';
import { NotificationType } from '@/types/audit-types';
import {
  getClassesWithWaitlistCounts,
  getWaitlistByClass,
  offerWaitlistSpot,
  removeFromWaitlist,
  WaitlistEntry,
  ClassWithWaitlistCount,
} from '@/services/database/queries/waitlistQueries';
import { getSecretaryShows } from '@/services/database/queries/showQueries';
import {
  Search,
  Users,
  Clock,
  CheckCircle2,
  AlertCircle,
  ListOrdered,
  ArrowUpCircle,
  Trash2,
  Loader2,
  Trophy,
  Dog,
  Calendar,
  RefreshCw,
} from 'lucide-react';

interface Show {
  id: string;
  name: string | null;
  start_date: string | null;
  end_date: string | null;
}

const WaitlistManagementPage: React.FC = () => {
  const { user, hasRole } = useAuthContext();

  // Selection state
  const [shows, setShows] = useState<Show[]>([]);
  const [selectedShowId, setSelectedShowId] = useState<string>('');
  const [classes, setClasses] = useState<ClassWithWaitlistCount[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [waitlistEntries, setWaitlistEntries] = useState<WaitlistEntry[]>([]);

  // UI state
  const [isLoadingShows, setIsLoadingShows] = useState(true);
  const [isLoadingClasses, setIsLoadingClasses] = useState(false);
  const [isLoadingWaitlist, setIsLoadingWaitlist] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Dialog state
  const [actionDialog, setActionDialog] = useState<{
    open: boolean;
    action: 'offer' | 'remove' | null;
    entry: WaitlistEntry | null;
  }>({ open: false, action: null, entry: null });

  // Load shows on mount
  useEffect(() => {
    loadShows();
  }, []);

  // Load classes when show changes
  useEffect(() => {
    if (selectedShowId) {
      loadClasses(selectedShowId);
    } else {
      setClasses([]);
      setSelectedClassId('');
      setWaitlistEntries([]);
    }
  }, [selectedShowId]);

  // Load waitlist when class changes
  useEffect(() => {
    if (selectedClassId) {
      loadWaitlist(selectedClassId);
    } else {
      setWaitlistEntries([]);
    }
  }, [selectedClassId]);

  const loadShows = async () => {
    setIsLoadingShows(true);
    setError(null);

    try {
      const { data, error } = await getSecretaryShows(user?.id || '');
      if (error) {
        setError('Failed to load shows');
        logger.error('Error loading shows for waitlist:', 'secretary', {}, error as Error);
      } else {
        setShows(data || []);
      }
    } catch (err) {
      setError('Failed to load shows');
      logger.error('Error loading shows:', 'secretary', {}, err as Error);
    } finally {
      setIsLoadingShows(false);
    }
  };

  const loadClasses = async (showId: string) => {
    setIsLoadingClasses(true);
    setError(null);
    setSelectedClassId('');
    setWaitlistEntries([]);

    try {
      const { data, error } = await getClassesWithWaitlistCounts(showId);
      if (error) {
        setError('Failed to load classes');
        logger.error('Error loading classes for waitlist:', 'secretary', {}, error as Error);
      } else {
        setClasses(data || []);
      }
    } catch (err) {
      setError('Failed to load classes');
      logger.error('Error loading classes:', 'secretary', {}, err as Error);
    } finally {
      setIsLoadingClasses(false);
    }
  };

  const loadWaitlist = async (classId: string) => {
    setIsLoadingWaitlist(true);
    setError(null);

    try {
      const { data, error } = await getWaitlistByClass(classId);
      if (error) {
        setError('Failed to load waitlist');
        logger.error('Error loading waitlist:', 'secretary', {}, error as Error);
      } else {
        setWaitlistEntries(data || []);
      }
    } catch (err) {
      setError('Failed to load waitlist');
      logger.error('Error loading waitlist:', 'secretary', {}, err as Error);
    } finally {
      setIsLoadingWaitlist(false);
    }
  };

  const handleOfferSpot = async () => {
    if (!actionDialog.entry) return;

    setIsProcessing(true);
    setError(null);

    try {
      const { data, error } = await offerWaitlistSpot(actionDialog.entry.id);

      if (error) {
        setError('Failed to offer spot. Please try again.');
        logger.error('Error offering waitlist spot:', 'secretary', {}, error as Error);
      } else {
        // Send notification to exhibitor
        if (data?.entry?.created_by) {
          notificationService.publish({
            type: NotificationType.WAITLIST_OFFER,
            channel: `user:${data.entry.created_by}`,
            sender: {
              id: user?.id || 'secretary',
              name: user?.email || 'Secretary',
              role: 'secretary',
            },
            data: {
              type: 'waitlist_spot_offered',
              classEntryId: actionDialog.entry.id,
              className: actionDialog.entry.class?.name,
              dogName: actionDialog.entry.entry?.dog?.name,
              offeredAt: new Date().toISOString(),
            },
          });
        }

        // Refresh the waitlist and class counts
        if (selectedClassId) {
          await loadWaitlist(selectedClassId);
        }
        if (selectedShowId) {
          await loadClasses(selectedShowId);
        }
      }
    } catch (err) {
      setError('An unexpected error occurred');
      logger.error('Error offering spot:', 'secretary', {}, err as Error);
    } finally {
      setIsProcessing(false);
      setActionDialog({ open: false, action: null, entry: null });
    }
  };

  const handleRemoveFromWaitlist = async () => {
    if (!actionDialog.entry) return;

    setIsProcessing(true);
    setError(null);

    try {
      const { error } = await removeFromWaitlist(actionDialog.entry.id);

      if (error) {
        setError('Failed to remove from waitlist. Please try again.');
        logger.error('Error removing from waitlist:', 'secretary', {}, error as Error);
      } else {
        // Refresh the waitlist and class counts
        if (selectedClassId) {
          await loadWaitlist(selectedClassId);
        }
        if (selectedShowId) {
          await loadClasses(selectedShowId);
        }
      }
    } catch (err) {
      setError('An unexpected error occurred');
      logger.error('Error removing from waitlist:', 'secretary', {}, err as Error);
    } finally {
      setIsProcessing(false);
      setActionDialog({ open: false, action: null, entry: null });
    }
  };

  const handleRefresh = useCallback(() => {
    if (selectedClassId) {
      loadWaitlist(selectedClassId);
    }
    if (selectedShowId) {
      loadClasses(selectedShowId);
    }
  }, [selectedClassId, selectedShowId]);

  // Filter waitlist entries by search term
  const filteredEntries = waitlistEntries.filter((entry) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      entry.entry?.dog?.name?.toLowerCase().includes(search) ||
      entry.entry?.dog?.call_name?.toLowerCase().includes(search) ||
      entry.entry?.handler?.toLowerCase().includes(search)
    );
  });

  // Get selected class info
  const selectedClass = classes.find((c) => c.id === selectedClassId);

  // Format date for display
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'TBD';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Verify secretary role access
  if (!hasRole(UserRole.SECRETARY) && !hasRole(UserRole.CLUB_ADMIN) && !hasRole(UserRole.SITE_ADMIN)) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Access Restricted</h2>
            <p className="text-muted-foreground">
              This page is only accessible to users with secretary permissions.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <ListOrdered className="h-8 w-8" />
            Waitlist Management
          </h1>
          <p className="text-muted-foreground">
            Manage class waitlists, offer spots to exhibitors, and track capacity
          </p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={!selectedShowId}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Show and Class Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Select Show and Class</CardTitle>
          <CardDescription>Choose a show and class to manage its waitlist</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Show Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Show</label>
              <Select
                value={selectedShowId}
                onValueChange={setSelectedShowId}
                disabled={isLoadingShows}
              >
                <SelectTrigger>
                  <SelectValue placeholder={isLoadingShows ? 'Loading shows...' : 'Select a show'} />
                </SelectTrigger>
                <SelectContent>
                  {shows.map((show) => (
                    <SelectItem key={show.id} value={show.id}>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span>{show.name || 'Unnamed Show'}</span>
                        <span className="text-muted-foreground text-xs">
                          ({formatDate(show.start_date)})
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Class Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Class</label>
              <Select
                value={selectedClassId}
                onValueChange={setSelectedClassId}
                disabled={!selectedShowId || isLoadingClasses}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      !selectedShowId
                        ? 'Select a show first'
                        : isLoadingClasses
                          ? 'Loading classes...'
                          : 'Select a class'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>
                      <div className="flex items-center gap-2">
                        <Trophy className="h-4 w-4 text-muted-foreground" />
                        <span>
                          {cls.class_number ? `#${cls.class_number} - ` : ''}
                          {cls.name}
                        </span>
                        {cls.waitlist_count > 0 && (
                          <Badge variant="secondary" className="ml-2">
                            {cls.waitlist_count} waiting
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Class Stats */}
      {selectedClass && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Entry Limit</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {selectedClass.entry_limit || '∞'}
              </div>
              <p className="text-xs text-muted-foreground">Maximum entries</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Accepted</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{selectedClass.accepted_count}</div>
              <p className="text-xs text-muted-foreground">
                {selectedClass.entry_limit
                  ? `${Math.round((selectedClass.accepted_count / selectedClass.entry_limit) * 100)}% full`
                  : 'No limit set'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Waitlist</CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{selectedClass.waitlist_count}</div>
              <p className="text-xs text-muted-foreground">Waiting for spots</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Available</CardTitle>
              <ArrowUpCircle className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {selectedClass.entry_limit
                  ? Math.max(0, selectedClass.entry_limit - selectedClass.accepted_count)
                  : '∞'}
              </div>
              <p className="text-xs text-muted-foreground">Open spots</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Waitlist Table */}
      {selectedClassId && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Waitlist ({filteredEntries.length})
                </CardTitle>
                <CardDescription>
                  Entries are ordered by submission time (first come, first served)
                </CardDescription>
              </div>
              <div className="relative w-64">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by dog or handler..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingWaitlist ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredEntries.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No entries on waitlist</p>
                <p className="text-sm">
                  {searchTerm
                    ? 'No entries match your search'
                    : 'This class has no waitlisted entries'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredEntries.map((entry, index) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      {/* Position Badge */}
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary font-bold">
                        #{index + 1}
                      </div>

                      {/* Entry Info */}
                      <div>
                        <div className="flex items-center gap-2">
                          <Dog className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">
                            {entry.entry?.dog?.name || 'Unknown Dog'}
                          </span>
                          {entry.entry?.dog?.call_name && (
                            <span className="text-muted-foreground">
                              ({entry.entry.dog.call_name})
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-4">
                          <span>Handler: {entry.entry?.handler || 'Not specified'}</span>
                          {entry.jump_height && <span>Jump Height: {entry.jump_height}</span>}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Added:{' '}
                          {new Date(entry.created_at).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {/* Only show Offer Spot if there's available space */}
                      {selectedClass &&
                        (!selectedClass.entry_limit ||
                          selectedClass.accepted_count < selectedClass.entry_limit) && (
                          <Button
                            size="sm"
                            onClick={() =>
                              setActionDialog({ open: true, action: 'offer', entry })
                            }
                          >
                            <ArrowUpCircle className="h-4 w-4 mr-1" />
                            Offer Spot
                          </Button>
                        )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() =>
                          setActionDialog({ open: true, action: 'remove', entry })
                        }
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* No Selection State */}
      {!selectedShowId && !isLoadingShows && (
        <Card>
          <CardContent className="py-12 text-center">
            <ListOrdered className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-medium mb-2">Select a Show to Begin</h3>
            <p className="text-muted-foreground">
              Choose a show from the dropdown above to view and manage its waitlists.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Action Confirmation Dialog */}
      <AlertDialog
        open={actionDialog.open}
        onOpenChange={(open) => !open && setActionDialog({ open: false, action: null, entry: null })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionDialog.action === 'offer' ? 'Offer Spot?' : 'Remove from Waitlist?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionDialog.action === 'offer' ? (
                <>
                  Are you sure you want to offer a spot to{' '}
                  <strong>{actionDialog.entry?.entry?.dog?.name}</strong> in{' '}
                  <strong>{selectedClass?.name}</strong>? This will move them from the waitlist
                  to accepted entries. The exhibitor will be notified.
                </>
              ) : (
                <>
                  Are you sure you want to remove{' '}
                  <strong>{actionDialog.entry?.entry?.dog?.name}</strong> from the waitlist for{' '}
                  <strong>{selectedClass?.name}</strong>? This action cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={actionDialog.action === 'offer' ? handleOfferSpot : handleRemoveFromWaitlist}
              disabled={isProcessing}
              className={
                actionDialog.action === 'remove'
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : ''
              }
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : actionDialog.action === 'offer' ? (
                'Offer Spot'
              ) : (
                'Remove'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default WaitlistManagementPage;
