/**
 * Exhibitor Dashboard Page
 *
 * Main dashboard for exhibitors with entry management, show discovery,
 * and dog portfolio features focused on exhibitor workflow
 */

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRoleRedirect } from '@/hooks/useRoleRedirect';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Heart,
  FileText,
  Calendar,
  Search,
  Activity,
  MapPin,
  DollarSign,
  Award,
  ChevronRight,
  FolderOpen,
} from 'lucide-react';
import { ExhibitorLayout } from '@/components/exhibitor/ExhibitorLayout';
import { useEntriesQuery, useEntryStatisticsQuery } from '@/hooks/queries/useEntriesDatabase';
import { useDogsQuery } from '@/hooks/queries/useDogsDatabase';
import { useExhibitorResults, type ExhibitorResult } from '@/hooks/queries/useExhibitorResults';
import { useAuthContext } from '@/hooks/useAuthContext';
import { format } from 'date-fns';
import { Clock, AlertTriangle } from 'lucide-react';

interface DashboardEntry {
  id: string;
  showId: string;
  showName: string;
  dogId: string;
  dogName: string;
  className: string;
  entryFee: number;
  status: string;
  showDate: Date | null;
  location: string;
  classId: string;
}

const ExhibitorDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [selectedTab, setSelectedTab] = useState('entries');

  // Redirect if user switches to a different role while on this dashboard
  useRoleRedirect({
    enabled: false, // Don't redirect on page load
    redirectOnRoleChange: true, // Only redirect when roles change
  });

  // Real data from React Query hooks
  const { user } = useAuthContext();
  const {
    data: rawEntries = [],
    isLoading: entriesLoading,
    error: entriesError,
  } = useEntriesQuery();
  const { data: stats } = useEntryStatisticsQuery();
  const { data: dogs = [] } = useDogsQuery();
  const { data: recentResults = [] } = useExhibitorResults();

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Exhibitor';

  // Map DB entries to dashboard display shape
  const entries: DashboardEntry[] = useMemo(
    () =>
      rawEntries.map((entry: Record<string, unknown>) => ({
        id: (entry.id as string) || '',
        showId: (entry.show_id as string) || '',
        showName: ((entry.show as Record<string, unknown>)?.name as string) || 'Unknown Show',
        dogId: (entry.dog_id as string) || '',
        dogName:
          ((entry.dog as Record<string, unknown>)?.call_name as string) ||
          ((entry.dog as Record<string, unknown>)?.name as string) ||
          'Unknown Dog',
        className: ((entry.class as Record<string, unknown>)?.name as string) || 'Unknown Class',
        entryFee:
          ((entry.class as Record<string, unknown>)?.entry_fee as number) ??
          (entry.entry_fee as number) ??
          0,
        status: (entry.entry_status as string) || 'pending',
        showDate: (entry.show as Record<string, unknown>)?.start_date
          ? new Date((entry.show as Record<string, unknown>).start_date as string)
          : null,
        location: ((entry.show as Record<string, unknown>)?.location as string) || 'TBD',
        classId: (entry.class_id as string) || '',
      })),
    [rawEntries]
  );

  // Calculate statistics from real data
  const statistics = useMemo(() => {
    const activeEntries = entries.filter(e => e.status === 'confirmed').length;
    const pendingEntries = entries.filter(
      e => e.status === 'pending' || e.status === 'draft'
    ).length;
    const totalFees =
      stats?.totalRevenue ?? entries.reduce((sum, entry) => sum + entry.entryFee, 0);
    const upcomingShows = entries.filter(e => e.showDate && e.showDate > new Date()).length;

    return {
      activeEntries,
      pendingEntries,
      totalFees,
      upcomingShows,
      totalDogs: dogs.length,
    };
  }, [entries, stats, dogs]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return (
          <Badge className="bg-success-green/10 text-success-green border-success-green/20">
            Confirmed
          </Badge>
        );
      case 'pending':
        return (
          <Badge className="bg-warning-orange/10 text-warning-orange border-warning-orange/20">
            Pending
          </Badge>
        );
      case 'cancelled':
        return (
          <Badge className="bg-error-red/10 text-error-red border-error-red/20">Cancelled</Badge>
        );
      default:
        return <Badge className="bg-muted text-muted-foreground border-border">Unknown</Badge>;
    }
  };

  const getResultBadge = (resultText: ExhibitorResult['resultText']) => {
    switch (resultText) {
      case 'Q':
        return (
          <Badge className="bg-success-green/10 text-success-green border-success-green/20 font-bold text-base px-3 py-1">
            Q
          </Badge>
        );
      case 'NQ':
        return (
          <Badge className="bg-error-red/10 text-error-red border-error-red/20 font-bold text-base px-3 py-1">
            NQ
          </Badge>
        );
      default:
        return (
          <Badge className="bg-muted text-muted-foreground border-border font-bold text-base px-3 py-1">
            {resultText}
          </Badge>
        );
    }
  };

  const handleViewEntry = (entry: DashboardEntry) => {
    navigate(`/shows/${entry.showId}`);
  };

  const handleEditEntry = (entry: DashboardEntry) => {
    navigate(`/shows/${entry.showId}`);
  };

  const upcomingEntries = entries.filter(e => e.showDate && e.showDate > new Date());

  // Loading state
  if (entriesLoading) {
    return (
      <ExhibitorLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        </div>
      </ExhibitorLayout>
    );
  }

  // Error state
  if (entriesError) {
    return (
      <ExhibitorLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-muted-foreground">
                Unable to load entries. Please try again later.
              </p>
              <Button onClick={() => window.location.reload()} variant="outline" className="mt-4">
                Retry
              </Button>
            </CardContent>
          </Card>
        </div>
      </ExhibitorLayout>
    );
  }

  return (
    <ExhibitorLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Avatar className="h-12 w-12 border-2 border-primary/20">
                  <AvatarFallback className="bg-gradient-to-br from-primary/20 to-secondary/20 text-primary font-semibold text-lg">
                    {displayName.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute -top-1 -right-1 h-4 w-4 bg-success-green rounded-full border-2 border-background flex items-center justify-center">
                  <div className="h-2 w-2 bg-white rounded-full" />
                </div>
              </div>
              <div>
                <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                  Exhibitor Dashboard
                </h1>
                <p className="text-muted-foreground text-lg font-medium">
                  Welcome back, {displayName} • {statistics.totalDogs} dog
                  {statistics.totalDogs !== 1 ? 's' : ''} registered
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div className="flex items-center gap-1 px-2 py-1 bg-success-green/10 text-success-green rounded-full">
                <Activity className="h-4 w-4" />
                <span className="font-medium">Active</span>
              </div>
              {entries.length > 0 && (
                <span className="text-muted-foreground">{entries.length} total entries</span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => navigate('/shows')}>
              <Calendar className="h-4 w-4 mr-2" />
              Enter a Show
            </Button>
            <Button
              onClick={() => navigate('/dogs')}
              variant="outline"
              className="border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-300 shadow-sm"
            >
              <Heart className="h-4 w-4 mr-2" />
              Manage Dogs
            </Button>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2 active:scale-[0.98]">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <CardHeader className="pb-4 relative">
              <CardTitle className="text-sm font-semibold flex items-center justify-between text-muted-foreground">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl shadow-sm group-hover:shadow-xl group-hover:scale-110 transition-all duration-300">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  Active Entries
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 relative">
              <div className="text-4xl font-bold mb-2 bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                {statistics.activeEntries}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground font-medium">
                  {statistics.pendingEntries} pending review
                </p>
                {statistics.activeEntries > 0 && (
                  <div className="flex items-center gap-1">
                    <div className="h-2 w-2 bg-success-green rounded-full animate-pulse" />
                    <span className="text-sm text-success-green font-medium">Active</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2 active:scale-[0.98]">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <CardHeader className="pb-4 relative">
              <CardTitle className="text-sm font-semibold flex items-center justify-between text-muted-foreground">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-gradient-to-br from-blue-500/20 to-blue-500/10 rounded-xl shadow-sm group-hover:shadow-xl group-hover:scale-110 transition-all duration-300">
                    <Calendar className="h-5 w-5 text-blue-500" />
                  </div>
                  Upcoming Shows
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 relative">
              <div className="text-4xl font-bold mb-2 bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                {statistics.upcomingShows}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground font-medium">
                  {upcomingEntries[0]?.showDate
                    ? `Next in ${Math.ceil(
                        (upcomingEntries[0].showDate.getTime() - new Date().getTime()) /
                          (1000 * 3600 * 24)
                      )} days`
                    : 'No upcoming shows'}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2 active:scale-[0.98]">
            <div className="absolute inset-0 bg-gradient-to-br from-success-green/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <CardHeader className="pb-4 relative">
              <CardTitle className="text-sm font-semibold flex items-center justify-between text-muted-foreground">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-gradient-to-br from-success-green/20 to-success-green/10 rounded-xl shadow-sm group-hover:shadow-xl group-hover:scale-110 transition-all duration-300">
                    <Heart className="h-5 w-5 text-success-green" />
                  </div>
                  My Dogs
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 relative">
              <div className="text-4xl font-bold mb-2 bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                {statistics.totalDogs}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground font-medium">Registered dogs</p>
              </div>
            </CardContent>
          </Card>

          <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2 active:scale-[0.98]">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <CardHeader className="pb-4 relative">
              <CardTitle className="text-sm font-semibold flex items-center justify-between text-muted-foreground">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-gradient-to-br from-purple-500/20 to-purple-500/10 rounded-xl shadow-sm group-hover:shadow-xl group-hover:scale-110 transition-all duration-300">
                    <DollarSign className="h-5 w-5 text-purple-500" />
                  </div>
                  Entry Fees
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 relative">
              <div className="text-4xl font-bold mb-2 bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                ${statistics.totalFees}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground font-medium">This month's entries</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Card className="bg-card border border-border rounded-xl shadow-sm backdrop-blur-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-semibold">Entry Management</CardTitle>
            <CardDescription className="text-muted-foreground">
              Manage your show entries and track progress
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <Tabs value={selectedTab} onValueChange={setSelectedTab}>
              <TabsList className="grid w-full grid-cols-2 bg-gradient-to-r from-muted/50 to-muted/30 border border-border/30 rounded-xl p-1">
                <TabsTrigger
                  value="entries"
                  className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
                >
                  Upcoming Entries
                </TabsTrigger>
                <TabsTrigger
                  value="recent"
                  className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
                >
                  Recent Results
                </TabsTrigger>
              </TabsList>

              <TabsContent value="entries" className="space-y-6 mt-6">
                {upcomingEntries.map(entry => (
                  <div
                    key={entry.id}
                    className="group relative overflow-hidden p-6 border border-border rounded-2xl bg-gradient-to-r from-card to-card/80 hover:from-card/95 hover:to-card/90 transition-all duration-500 hover:shadow-xl hover:-translate-y-1 active:scale-[0.99]"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                    <div className="relative flex items-center justify-between">
                      <div className="flex-grow space-y-4">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors duration-300">
                            <Heart className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <h3 className="font-bold text-xl text-foreground group-hover:text-primary transition-colors duration-300">
                              {entry.showName}
                            </h3>
                            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <MapPin className="h-4 w-4" />
                                <span>{entry.location}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Calendar className="h-4 w-4" />
                                <span>
                                  {entry.showDate ? format(entry.showDate, 'MMM d, yyyy') : 'TBD'}
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <DollarSign className="h-4 w-4" />
                                <span>${entry.entryFee}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-muted-foreground">Dog</p>
                            <p className="font-semibold">{entry.dogName}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-muted-foreground">Class</p>
                            <p className="font-semibold">{entry.className}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-muted-foreground">Status</p>
                            {getStatusBadge(entry.status)}
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-muted-foreground">Days Until</p>
                            <p className="font-semibold text-primary">
                              {entry.showDate
                                ? `${Math.ceil(
                                    (entry.showDate.getTime() - new Date().getTime()) /
                                      (1000 * 3600 * 24)
                                  )} days`
                                : '—'}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="ml-8 flex flex-col gap-3">
                        <Button onClick={() => handleViewEntry(entry)}>
                          View Details
                          <ChevronRight className="h-4 w-4 ml-2" />
                        </Button>
                        <Button
                          variant="outline"
                          className="border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-300"
                          onClick={() => handleEditEntry(entry)}
                        >
                          Edit Entry
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}

                {upcomingEntries.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12">
                    <div className="bg-muted/50 rounded-full p-6 mb-4">
                      <FolderOpen className="h-12 w-12 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">No Upcoming Entries</h3>
                    <p className="text-muted-foreground mb-6 max-w-sm text-center">
                      You don't have any upcoming show entries. Browse shows to find your next
                      competition.
                    </p>
                    <Button onClick={() => navigate('/shows')}>
                      <Search className="h-4 w-4 mr-2" />
                      Browse Shows
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="recent" className="space-y-6 mt-6">
                {recentResults.map(result => (
                  <div
                    key={result.id}
                    className="group relative overflow-hidden p-6 border border-border rounded-2xl bg-gradient-to-r from-card to-card/80 hover:from-card/95 hover:to-card/90 transition-all duration-500 hover:shadow-xl hover:-translate-y-1 active:scale-[0.99]"
                  >
                    <div
                      className={`absolute inset-0 bg-gradient-to-r ${result.resultText === 'Q' ? 'from-success-green/5' : 'from-error-red/5'} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
                    />

                    <div className="relative flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1">
                        {getResultBadge(result.resultText)}
                        <div className="flex-1">
                          <h3 className="font-bold text-lg text-foreground">{result.showName}</h3>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
                            <span className="font-medium text-foreground">
                              {result.dogCallName}
                            </span>
                            <span>
                              {result.className}
                              {result.classElement ? ` — ${result.classElement}` : ''}
                              {result.classLevel ? ` ${result.classLevel}` : ''}
                            </span>
                            <span>
                              {result.showDate
                                ? format(new Date(result.showDate), 'MMM d, yyyy')
                                : ''}
                            </span>
                          </div>
                          {/* Result details row */}
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm">
                            {result.searchTimeSeconds != null && (
                              <span className="flex items-center gap-1 text-muted-foreground">
                                <Clock className="h-3.5 w-3.5" />
                                {result.searchTimeSeconds.toFixed(1)}s
                              </span>
                            )}
                            {result.totalFaults != null && result.totalFaults > 0 && (
                              <span className="flex items-center gap-1 text-warning-orange">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                {result.totalFaults} fault
                                {result.totalFaults !== 1 ? 's' : ''}
                              </span>
                            )}
                            {result.finalPlacement != null && result.finalPlacement > 0 && (
                              <span className="text-muted-foreground">
                                Placement: {result.finalPlacement}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-3 ml-4">
                        <Button
                          variant="outline"
                          className="border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40"
                          onClick={() =>
                            navigate(
                              result.classId
                                ? `/classes/${result.classId}`
                                : `/shows/${result.showId}`
                            )
                          }
                        >
                          View Details
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}

                {recentResults.length === 0 && (
                  <div className="text-center py-16">
                    <div className="mx-auto w-24 h-24 bg-gradient-to-br from-success-green/20 to-success-green/10 rounded-full flex items-center justify-center mb-6">
                      <Award className="h-12 w-12 text-success-green" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">
                      No Recent Results
                    </h3>
                    <p className="text-muted-foreground mb-6">
                      Your competition results will appear here after shows.
                    </p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2 active:scale-[0.98]">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <CardHeader className="pb-6 relative">
              <CardTitle className="text-xl font-bold flex items-center gap-4">
                <div className="p-4 bg-gradient-to-br from-primary/20 to-primary/10 rounded-2xl shadow-sm group-hover:shadow-xl group-hover:scale-110 transition-all duration-300">
                  <Search className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <div className="text-foreground group-hover:text-primary transition-colors duration-300">
                    Find Shows
                  </div>
                  <div className="text-sm font-normal text-muted-foreground mt-1">
                    Discover upcoming competitions
                  </div>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="relative">
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Upcoming entries</span>
                  <Badge className="bg-primary/10 text-primary border-primary/20">
                    {statistics.upcomingShows}
                  </Badge>
                </div>
              </div>
              <Button onClick={() => navigate('/shows')} className="w-full mt-6 font-semibold py-3">
                <Search className="h-4 w-4 mr-2" />
                Browse Shows
              </Button>
            </CardContent>
          </Card>

          <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2 active:scale-[0.98]">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <CardHeader className="pb-6 relative">
              <CardTitle className="text-xl font-bold flex items-center gap-4">
                <div className="p-4 bg-gradient-to-br from-blue-500/20 to-blue-500/10 rounded-2xl shadow-sm group-hover:shadow-xl group-hover:scale-110 transition-all duration-300">
                  <Heart className="h-6 w-6 text-blue-500" />
                </div>
                <div>
                  <div className="text-foreground group-hover:text-blue-600 transition-colors duration-300">
                    My Dogs
                  </div>
                  <div className="text-sm font-normal text-muted-foreground mt-1">
                    Manage dog profiles and health
                  </div>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="relative">
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Registered dogs</span>
                  <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">
                    {statistics.totalDogs}
                  </Badge>
                </div>
              </div>
              <Button onClick={() => navigate('/dogs')} className="w-full mt-6 font-semibold py-3">
                <Heart className="h-4 w-4 mr-2" />
                Manage Dogs
              </Button>
            </CardContent>
          </Card>

          <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2 active:scale-[0.98]">
            <div className="absolute inset-0 bg-gradient-to-br from-warning-orange/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <CardHeader className="pb-6 relative">
              <CardTitle className="text-xl font-bold flex items-center gap-4">
                <div className="p-4 bg-gradient-to-br from-warning-orange/20 to-warning-orange/10 rounded-2xl shadow-sm group-hover:shadow-xl group-hover:scale-110 transition-all duration-300">
                  <FileText className="h-6 w-6 text-warning-orange" />
                </div>
                <div>
                  <div className="text-foreground group-hover:text-warning-orange transition-colors duration-300">
                    My Entries
                  </div>
                  <div className="text-sm font-normal text-muted-foreground mt-1">
                    Track and manage entries
                  </div>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="relative">
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total entries</span>
                  <Badge className="bg-warning-orange/10 text-warning-orange border-warning-orange/20">
                    {entries.length}
                  </Badge>
                </div>
              </div>
              <Button
                onClick={() => navigate('/exhibitor/entries')}
                className="w-full mt-6 font-semibold py-3"
              >
                <FileText className="h-4 w-4 mr-2" />
                View Entries
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </ExhibitorLayout>
  );
};

export default ExhibitorDashboard;
