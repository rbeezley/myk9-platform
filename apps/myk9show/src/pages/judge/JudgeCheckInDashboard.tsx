import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { JudgeCheckInInterface } from '@/components/judges/JudgeCheckInInterface';
import { GateStewardInterface } from '@/components/stewards/GateStewardInterface';
import { useAuthContext } from '@/hooks/useAuthContext';
import { Breadcrumb } from '@/components/common/Breadcrumb';
import { 
  Users, 
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  MapPin,
  Calendar,
  Eye
} from 'lucide-react';

interface RingAssignment {
  ringNumber: string;
  judgeName: string;
  className: string;
  startTime: Date;
  totalEntries: number;
  checkedInCount: number;
  conflictCount: number;
  atGateCount: number;
  isActive: boolean;
}

const JudgeCheckInDashboard: React.FC = () => {
  const { user } = useAuthContext();
  const navigate = useNavigate();
  const [selectedRing, setSelectedRing] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'overview' | 'ring-detail' | 'multi-ring'>('overview');
  const [ringAssignments, setRingAssignments] = useState<RingAssignment[]>([]);

  // Generate breadcrumb items
  const breadcrumbItems = [
    { label: 'Dashboard', href: '/judge/dashboard' },
    { label: 'Check-In Management', href: '/judge/check-in', isCurrentPage: true }
  ];

  const loadRingAssignments = useCallback(async () => {
    // Mock data - in real implementation, this would fetch judge's ring assignments
    const mockAssignments: RingAssignment[] = [
      {
        ringNumber: '1',
        judgeName: user?.email || 'Judge Smith',
        className: 'Open Standard',
        startTime: new Date(2024, 6, 15, 9, 0),
        totalEntries: 24,
        checkedInCount: 18,
        conflictCount: 2,
        atGateCount: 3,
        isActive: true
      },
      {
        ringNumber: '3',
        judgeName: user?.email || 'Judge Smith',
        className: 'Excellent JWW',
        startTime: new Date(2024, 6, 15, 11, 30),
        totalEntries: 16,
        checkedInCount: 12,
        conflictCount: 1,
        atGateCount: 1,
        isActive: false
      }
    ];

    setRingAssignments(mockAssignments);
  }, [user?.email]);

  useEffect(() => {
    loadRingAssignments();
  }, [loadRingAssignments]);

  const handleRingSelect = (ringNumber: string) => {
    setSelectedRing(ringNumber);
    setViewMode('ring-detail');
  };

  const handleBackToOverview = () => {
    setSelectedRing(null);
    setViewMode('overview');
  };

  const getStatusColor = (checked: number, total: number, conflicts: number) => {
    const percentage = (checked / total) * 100;
    if (conflicts > 0) return 'border-red-200 bg-red-50 dark:bg-red-950/20';
    if (percentage >= 80) return 'border-green-200 bg-green-50 dark:bg-green-950/20';
    if (percentage >= 50) return 'border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20';
    return 'border-gray-200 bg-gray-50 dark:bg-gray-950/20';
  };

  // Calculate overall stats
  const overallStats = ringAssignments.reduce(
    (acc, ring) => ({
      totalEntries: acc.totalEntries + ring.totalEntries,
      checkedIn: acc.checkedIn + ring.checkedInCount,
      conflicts: acc.conflicts + ring.conflictCount,
      atGate: acc.atGate + ring.atGateCount
    }),
    { totalEntries: 0, checkedIn: 0, conflicts: 0, atGate: 0 }
  );

  if (viewMode === 'ring-detail' && selectedRing) {
    const ringAssignment = ringAssignments.find(r => r.ringNumber === selectedRing);
    
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-6 py-20 max-w-7xl">
          <div className="space-y-6">
            {/* Breadcrumb */}
            <Breadcrumb 
              items={[
                ...breadcrumbItems,
                { label: `Ring ${selectedRing}`, href: '', isCurrentPage: true }
              ]}
              showHomeIcon={true}
              className="apple-breadcrumb"
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
              ringNumber={selectedRing}
              judgeName={ringAssignment?.judgeName || 'Judge'}
            />
          </div>
        </div>
      </div>
    );
  }

  if (viewMode === 'multi-ring') {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-6 py-20 max-w-7xl">
          <div className="space-y-6">
            {/* Breadcrumb */}
            <Breadcrumb 
              items={[
                ...breadcrumbItems,
                { label: 'Multi-Ring View', href: '', isCurrentPage: true }
              ]}
              showHomeIcon={true}
              className="apple-breadcrumb"
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
            <GateStewardInterface
              assignedRings={ringAssignments.map(r => r.ringNumber)}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-20 max-w-7xl">
        <div className="space-y-8">
          {/* Breadcrumb */}
          <Breadcrumb 
            items={breadcrumbItems} 
            showHomeIcon={true}
            className="apple-breadcrumb"
          />

          {/* Header */}
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">
              Check-In Management
            </h1>
            <p className="text-muted-foreground text-lg">
              Manage exhibitor check-in status for your assigned rings
            </p>
          </div>

          {/* Overall Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Entries</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overallStats.totalEntries}</div>
                <p className="text-xs text-muted-foreground">
                  Across {ringAssignments.length} rings
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Checked In</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overallStats.checkedIn}</div>
                <p className="text-xs text-muted-foreground">
                  {Math.round((overallStats.checkedIn / overallStats.totalEntries) * 100)}% ready
                </p>
              </CardContent>
            </Card>

            <Card className={overallStats.conflicts > 0 ? "border-red-200 bg-red-50/50" : ""}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Conflicts</CardTitle>
                <AlertTriangle className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overallStats.conflicts}</div>
                <p className="text-xs text-muted-foreground">
                  Need attention
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">At Gate</CardTitle>
                <Eye className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overallStats.atGate}</div>
                <p className="text-xs text-muted-foreground">
                  Ready to run
                </p>
              </CardContent>
            </Card>
          </div>

          {/* View Options */}
          <div className="flex gap-4">
            <Button
              onClick={() => setViewMode('multi-ring')}
              className="bg-gradient-to-r from-primary to-[#5856D6] text-primary-foreground"
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

          {/* Ring Assignments */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Your Ring Assignments</h2>
            
            <div className="grid gap-4">
              {ringAssignments.map((ring) => (
                <Card 
                  key={ring.ringNumber}
                  className={`transition-all duration-200 hover:shadow-md cursor-pointer ${
                    getStatusColor(ring.checkedInCount, ring.totalEntries, ring.conflictCount)
                  }`}
                  onClick={() => handleRingSelect(ring.ringNumber)}
                >
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono text-lg px-3 py-1">
                            Ring {ring.ringNumber}
                          </Badge>
                          {ring.isActive && (
                            <Badge className="bg-green-500">
                              Active
                            </Badge>
                          )}
                          {ring.conflictCount > 0 && (
                            <Badge variant="destructive" className="animate-pulse">
                              {ring.conflictCount} Conflicts
                            </Badge>
                          )}
                        </div>
                        
                        <div>
                          <div className="font-medium text-lg">{ring.className}</div>
                          <div className="text-sm text-muted-foreground flex items-center gap-4">
                            <span className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              {ring.startTime.toLocaleTimeString()}
                            </span>
                            <span className="flex items-center gap-1">
                              <Users className="h-4 w-4" />
                              {ring.totalEntries} entries
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        {/* Quick Stats */}
                        <div className="grid grid-cols-3 gap-4 text-center">
                          <div>
                            <div className="text-lg font-bold text-green-600">
                              {ring.checkedInCount}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Checked In
                            </div>
                          </div>
                          <div>
                            <div className="text-lg font-bold text-blue-600">
                              {ring.atGateCount}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              At Gate
                            </div>
                          </div>
                          <div>
                            <div className={`text-lg font-bold ${
                              ring.conflictCount > 0 ? 'text-red-600' : 'text-gray-400'
                            }`}>
                              {ring.conflictCount}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Conflicts
                            </div>
                          </div>
                        </div>

                        <ArrowRight className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {ringAssignments.length === 0 && (
              <Card>
                <CardContent className="p-8 text-center">
                  <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Ring Assignments</h3>
                  <p className="text-muted-foreground mb-4">
                    You don't have any ring assignments for today.
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