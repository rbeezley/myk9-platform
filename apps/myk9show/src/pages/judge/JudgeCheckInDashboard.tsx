import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { JudgeCheckInInterface } from '@/components/judges/JudgeCheckInInterface';
import { GateStewardInterface } from '@/components/stewards/GateStewardInterface';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useJudgeCheckInStats } from '@/hooks/queries/useJudgeCheckInStats';
import { Breadcrumb } from '@/components/common/Breadcrumb';
import {
  Users,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  MapPin,
  Calendar,
  Eye,
} from 'lucide-react';

const JudgeCheckInDashboard: React.FC = () => {
  const { user } = useAuthContext();
  const navigate = useNavigate();
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'overview' | 'ring-detail' | 'multi-ring'>('overview');

  const { rings: ringAssignments, isLoading } = useJudgeCheckInStats();

  // Generate breadcrumb items
  const breadcrumbItems = [
    { label: 'Dashboard', href: '/judge/dashboard' },
    { label: 'Check-In Management', href: '/judge/check-in', isCurrentPage: true },
  ];

  const handleClassSelect = (classId: string) => {
    setSelectedClassId(classId);
    setViewMode('ring-detail');
  };

  const handleBackToOverview = () => {
    setSelectedClassId(null);
    setViewMode('overview');
  };

  const getStatusColor = (checkedIn: number, total: number, conflicts: number) => {
    if (total === 0) return 'border-gray-200 bg-gray-50 dark:bg-gray-950/20';
    const percentage = (checkedIn / total) * 100;
    if (conflicts > 0) return 'border-red-200 bg-red-50 dark:bg-red-950/20';
    if (percentage >= 80) return 'border-green-200 bg-green-50 dark:bg-green-950/20';
    if (percentage >= 50) return 'border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20';
    return 'border-gray-200 bg-gray-50 dark:bg-gray-950/20';
  };

  // Calculate overall stats
  const overallStats = ringAssignments.reduce(
    (acc, ring) => ({
      totalEntries: acc.totalEntries + ring.totalEntries,
      checkedIn: acc.checkedIn + ring.checkedIn,
      conflicts: acc.conflicts + ring.conflicts,
    }),
    { totalEntries: 0, checkedIn: 0, conflicts: 0 }
  );

  const selectedAssignment = ringAssignments.find(r => r.classId === selectedClassId);

  if (viewMode === 'ring-detail' && selectedClassId) {
    return (
      <div className="bg-background">
        <div className="container mx-auto px-6 py-6 max-w-7xl">
          <div className="space-y-6">
            {/* Breadcrumb */}
            <Breadcrumb
              items={[
                ...breadcrumbItems,
                {
                  label: selectedAssignment?.className ?? 'Class',
                  href: '',
                  isCurrentPage: true,
                },
              ]}
              showHomeIcon={true}
              className="myk9-breadcrumb"
            />

            {/* Back Button */}
            <Button
              variant="outline"
              onClick={handleBackToOverview}
              className="border-primary/20 text-primary hover:bg-primary/5"
            >
              <ArrowRight className="h-4 w-4 mr-2 rotate-180" />
              Back to Check-In Overview
            </Button>

            {/* Ring Check-In Interface */}
            <JudgeCheckInInterface
              ringNumber={selectedClassId}
              judgeName={user?.email ?? 'Judge'}
            />
          </div>
        </div>
      </div>
    );
  }

  if (viewMode === 'multi-ring') {
    return (
      <div className="bg-background">
        <div className="container mx-auto px-6 py-6 max-w-7xl">
          <div className="space-y-6">
            {/* Breadcrumb */}
            <Breadcrumb
              items={[
                ...breadcrumbItems,
                { label: 'Multi-Ring View', href: '', isCurrentPage: true },
              ]}
              showHomeIcon={true}
              className="myk9-breadcrumb"
            />

            {/* Back Button */}
            <Button
              variant="outline"
              onClick={handleBackToOverview}
              className="border-primary/20 text-primary hover:bg-primary/5"
            >
              <ArrowRight className="h-4 w-4 mr-2 rotate-180" />
              Back to Check-In Overview
            </Button>

            {/* Multi-Ring Gate Steward Interface */}
            <GateStewardInterface assignedRings={ringAssignments.map(r => r.classId)} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background">
      <div className="container mx-auto px-6 py-6 max-w-7xl">
        <div className="space-y-8">
          {/* Breadcrumb */}
          <Breadcrumb items={breadcrumbItems} showHomeIcon={true} className="myk9-breadcrumb" />

          {/* Header */}
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Check-In Management</h1>
            <p className="text-muted-foreground text-lg">
              Manage exhibitor check-in status for your assigned classes
            </p>
          </div>

          {/* Overall Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Entries</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold">{overallStats.totalEntries}</div>
                )}
                <p className="text-xs text-muted-foreground">
                  Across {ringAssignments.length} classes
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Checked In</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold">{overallStats.checkedIn}</div>
                )}
                <p className="text-xs text-muted-foreground">
                  {overallStats.totalEntries > 0
                    ? `${Math.round((overallStats.checkedIn / overallStats.totalEntries) * 100)}% ready`
                    : 'No entries yet'}
                </p>
              </CardContent>
            </Card>

            <Card className={overallStats.conflicts > 0 ? 'border-red-200 bg-red-50/50' : ''}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Conflicts</CardTitle>
                <AlertTriangle className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold">{overallStats.conflicts}</div>
                )}
                <p className="text-xs text-muted-foreground">Need attention</p>
              </CardContent>
            </Card>
          </div>

          {/* View Options */}
          <div className="flex gap-4">
            <Button
              onClick={() => setViewMode('multi-ring')}
              className="bg-primary text-primary-foreground"
              disabled={ringAssignments.length === 0}
            >
              <Users className="h-4 w-4 mr-2" />
              Multi-Ring View
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate('/judge/dashboard')}
              className="border-primary/20 text-primary hover:bg-primary/5"
            >
              <ArrowRight className="h-4 w-4 mr-2 rotate-180" />
              Back to Dashboard
            </Button>
          </div>

          {/* Class Assignments */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Your Class Assignments</h2>

            {isLoading && (
              <div className="grid gap-4">
                {[1, 2].map(i => (
                  <Skeleton key={i} className="h-24 w-full rounded-lg" />
                ))}
              </div>
            )}

            {!isLoading && (
              <div className="grid gap-4">
                {ringAssignments.map(ring => (
                  <Card
                    key={ring.classId}
                    className={`transition-all duration-200 hover:shadow-md cursor-pointer ${getStatusColor(
                      ring.checkedIn,
                      ring.totalEntries,
                      ring.conflicts
                    )}`}
                    onClick={() => handleClassSelect(ring.classId)}
                  >
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            {ring.conflicts > 0 && (
                              <Badge variant="destructive" className="animate-pulse">
                                {ring.conflicts} Conflicts
                              </Badge>
                            )}
                          </div>

                          <div>
                            <div className="font-medium text-lg">{ring.className}</div>
                            <div className="text-sm text-muted-foreground flex items-center gap-4">
                              <span className="flex items-center gap-1">
                                <Users className="h-4 w-4" />
                                {ring.totalEntries} entries
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-6">
                          {/* Quick Stats */}
                          <div className="grid grid-cols-2 gap-4 text-center">
                            <div>
                              <div className="text-lg font-bold text-green-600">
                                {ring.checkedIn}
                              </div>
                              <div className="text-xs text-muted-foreground">Checked In</div>
                            </div>
                            <div>
                              <div
                                className={`text-lg font-bold ${
                                  ring.conflicts > 0 ? 'text-red-600' : 'text-gray-400'
                                }`}
                              >
                                {ring.conflicts}
                              </div>
                              <div className="text-xs text-muted-foreground">Conflicts</div>
                            </div>
                          </div>

                          <ArrowRight className="h-5 w-5 text-muted-foreground" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {!isLoading && ringAssignments.length === 0 && (
              <Card>
                <CardContent className="p-8 text-center">
                  <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Class Assignments</h3>
                  <p className="text-muted-foreground mb-4">
                    You don&apos;t have any class assignments for today.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => navigate('/shows')}
                    className="border-primary/20 text-primary hover:bg-primary/5"
                  >
                    <Calendar className="h-4 w-4 mr-2" />
                    View All Shows
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default JudgeCheckInDashboard;
