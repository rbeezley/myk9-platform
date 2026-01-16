import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Calendar, 
  Users, 
  Trophy, 
  Clock, 
  DollarSign, 
  UserPlus, 
  AlertCircle,
  CheckCircle,
  Settings,
  BarChart3,
  Eye,
  UserCheck,
  MapPin,
  Mail,
  Star,
  ArrowRight
} from 'lucide-react';
import { formatDistanceToNow, isBefore, isAfter } from 'date-fns';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole, PERMISSIONS } from '@/types/auth-types';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import Breadcrumb from '@/components/common/Breadcrumb';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';

interface ShowDetailsEnhancedProps {
  showData: Show;
  associatedTrials: Trial[];
  onEditShow: () => void;
  onDeleteShow: () => void;
  onRegisterForShow?: () => void;
  onManageEntries?: () => void;
  onViewResults?: () => void;
}

interface ExhibitorDashboardProps {
  show: Show;
  onRegister: () => void;
}

interface SecretaryDashboardProps {
  show: Show;
  trials: Trial[];
  onManageEntries: () => void;
}

interface JudgeDashboardProps {
  show: Show;
  trials: Trial[];
}

// Exhibitor-focused component
const ExhibitorDashboard: React.FC<ExhibitorDashboardProps> = ({ show, onRegister }) => {
  const now = new Date();
  const entriesOpen = isAfter(now, new Date(show.entryOpenDate));
  const entriesClose = isBefore(now, new Date(show.entryCloseDate));
  const canRegister = entriesOpen && entriesClose && show.status?.toLowerCase() === 'published';
  
  const daysUntilClose = entriesClose 
    ? Math.ceil((new Date(show.entryCloseDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  return (
    <div className="space-y-6">
      {/* Registration Status Card */}
      <Card className="group relative overflow-hidden border-0 bg-gradient-to-br from-blue-50/50 via-white to-purple-50/30 backdrop-blur-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-blue-500 to-purple-600" />
        <CardHeader className="relative">
          <div className="flex items-center justify-between">
            <div className="space-y-3">
              <CardTitle className="flex items-center gap-3 text-xl font-semibold text-gray-900">
                <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg text-white shadow-lg">
                  <UserPlus className="w-5 h-5" />
                </div>
                Registration Status
              </CardTitle>
              <CardDescription className="text-base text-gray-600 leading-relaxed">
                {show.status?.toLowerCase() !== 'published' ? 'Show not yet published for entries' :
                 !entriesOpen ? 'Registration opens soon - stay tuned!' :
                 !entriesClose ? 'Registration period has ended' :
                 `Registration closes in ${Math.max(0, daysUntilClose)} days`}
              </CardDescription>
            </div>
            {canRegister ? (
              <Button 
                onClick={onRegister} 
                size="lg"
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5 hover:scale-105 font-medium px-6"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Register Now
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button disabled size="lg" variant="outline" className="bg-gray-50 border-gray-200 text-gray-500">
                <UserPlus className="w-4 h-4 mr-2" />
                {show.status?.toLowerCase() !== 'published' ? 'Not Published' :
                 !entriesOpen ? 'Opens Soon' : 'Registration Closed'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="relative pt-0">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-500 uppercase tracking-wide">Entries Open</div>
              <div className="text-lg font-semibold text-gray-900">
                {new Date(show.entryOpenDate).toLocaleDateString('en-US', { 
                  weekday: 'short', 
                  month: 'short', 
                  day: 'numeric' 
                })}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-500 uppercase tracking-wide">Entries Close</div>
              <div className="flex items-center gap-3">
                <div className="text-lg font-semibold text-gray-900">
                  {new Date(show.entryCloseDate).toLocaleDateString('en-US', { 
                    weekday: 'short', 
                    month: 'short', 
                    day: 'numeric' 
                  })}
                </div>
                {daysUntilClose <= 7 && daysUntilClose > 0 && (
                  <Badge className="bg-gradient-to-r from-orange-500 to-red-500 text-white text-xs font-medium px-2 py-1 rounded-full shadow-md animate-pulse">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    {daysUntilClose}d left
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Entry Fees Card */}
      <Card className="group overflow-hidden border-0 bg-gradient-to-br from-green-50/50 via-white to-emerald-50/30 backdrop-blur-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
        <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-green-500 to-emerald-600" />
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-xl font-semibold text-gray-900">
            <div className="p-2 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg text-white shadow-lg">
              <DollarSign className="w-5 h-5" />
            </div>
            Entry Fees
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6">
            <div className="relative p-6 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border border-green-100 shadow-sm">
              <div className="absolute top-2 right-2">
                <Star className="w-4 h-4 text-green-500" />
              </div>
              <div className="text-3xl font-bold text-green-700 mb-2">${show.preEntryFee}</div>
              <div className="text-sm font-medium text-green-800 mb-1">Pre-Entry Fee</div>
              <div className="text-xs text-green-600">
                Save by registering early!
              </div>
            </div>
            <div className="p-6 bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl border border-orange-100 shadow-sm">
              <div className="text-3xl font-bold text-orange-700 mb-2">
                ${show.dayOfShowFee || show.preEntryFee}
              </div>
              <div className="text-sm font-medium text-orange-800 mb-1">Day of Show</div>
              <div className="text-xs text-orange-600">
                Subject to availability
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Show Information Card */}
      <Card className="group overflow-hidden border-0 bg-gradient-to-br from-slate-50/50 via-white to-gray-50/30 backdrop-blur-xl shadow-lg hover:shadow-xl transition-all duration-300">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-xl font-semibold text-gray-900">
            <div className="p-2 bg-gradient-to-br from-slate-600 to-gray-700 rounded-lg text-white shadow-lg">
              <Calendar className="w-5 h-5" />
            </div>
            Show Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-500 uppercase tracking-wide flex items-center gap-2">
                <Calendar className="w-3 h-3" />
                Show Dates
              </div>
              <div className="text-base font-semibold text-gray-900">
                {new Date(show.startDate).toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })} 
                {show.startDate !== show.endDate && (
                  <span className="text-gray-600"> - {new Date(show.endDate).toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    month: 'long', 
                    day: 'numeric' 
                  })}</span>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-500 uppercase tracking-wide flex items-center gap-2">
                <Users className="w-3 h-3" />
                Host Club
              </div>
              <div className="text-base font-semibold text-gray-900">{show.clubName}</div>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-500 uppercase tracking-wide">Show Type</div>
              <div className="text-base font-semibold text-gray-900">{show.type}</div>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-500 uppercase tracking-wide flex items-center gap-2">
                <Mail className="w-3 h-3" />
                Secretary
              </div>
              <div className="text-base font-semibold text-gray-900">{show.secretary}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// Secretary-focused component
const SecretaryDashboard: React.FC<SecretaryDashboardProps> = ({ show: _show, trials, onManageEntries }) => {
  const totalTrials = trials.length;
  const completedTrials = trials.filter(t => t.status === 'Completed').length;
  const upcomingTrials = trials.filter(t => t.status === 'Upcoming').length;

  return (
    <div className="space-y-6">
      {/* Management Actions */}
      <Card className="group overflow-hidden border-0 bg-gradient-to-br from-blue-50/50 via-white to-indigo-50/30 backdrop-blur-xl shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-xl font-semibold text-gray-900">
            <div className="p-2 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg text-white shadow-lg">
              <Settings className="w-5 h-5" />
            </div>
            Show Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Button 
              onClick={onManageEntries} 
              variant="outline" 
              className="h-auto p-6 border-2 border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg group"
            >
              <div className="text-center space-y-3">
                <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl text-white mx-auto w-fit group-hover:scale-110 transition-transform duration-300">
                  <Users className="w-6 h-6" />
                </div>
                <div className="font-semibold text-gray-900">Manage Entries</div>
                <div className="text-sm text-gray-600">View & process entries</div>
              </div>
            </Button>
            <Button 
              variant="outline" 
              className="h-auto p-6 border-2 border-gray-200 hover:border-green-300 hover:bg-green-50/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg group"
            >
              <div className="text-center space-y-3">
                <div className="p-3 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl text-white mx-auto w-fit group-hover:scale-110 transition-transform duration-300">
                  <BarChart3 className="w-6 h-6" />
                </div>
                <div className="font-semibold text-gray-900">Export Reports</div>
                <div className="text-sm text-gray-600">Generate entry reports</div>
              </div>
            </Button>
            <Button 
              variant="outline" 
              className="h-auto p-6 border-2 border-gray-200 hover:border-purple-300 hover:bg-purple-50/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg group"
            >
              <div className="text-center space-y-3">
                <div className="p-3 bg-gradient-to-br from-purple-500 to-violet-600 rounded-xl text-white mx-auto w-fit group-hover:scale-110 transition-transform duration-300">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <div className="font-semibold text-gray-900">Payment Status</div>
                <div className="text-sm text-gray-600">Track payments</div>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Show Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="group overflow-hidden border-0 bg-gradient-to-br from-slate-50 to-gray-50 backdrop-blur-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="text-3xl font-bold text-gray-900">{totalTrials}</div>
                <div className="text-sm font-medium text-gray-500 uppercase tracking-wide">Total Trials</div>
              </div>
              <div className="p-3 bg-gradient-to-br from-slate-500 to-gray-600 rounded-xl text-white shadow-lg group-hover:scale-110 transition-transform duration-300">
                <Calendar className="w-8 h-8" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="group overflow-hidden border-0 bg-gradient-to-br from-blue-50 to-indigo-50 backdrop-blur-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="text-3xl font-bold text-blue-900">{upcomingTrials}</div>
                <div className="text-sm font-medium text-blue-600 uppercase tracking-wide">Upcoming</div>
              </div>
              <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl text-white shadow-lg group-hover:scale-110 transition-transform duration-300">
                <Clock className="w-8 h-8" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="group overflow-hidden border-0 bg-gradient-to-br from-green-50 to-emerald-50 backdrop-blur-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="text-3xl font-bold text-green-900">{completedTrials}</div>
                <div className="text-sm font-medium text-green-600 uppercase tracking-wide">Completed</div>
              </div>
              <div className="p-3 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl text-white shadow-lg group-hover:scale-110 transition-transform duration-300">
                <CheckCircle className="w-8 h-8" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

// Judge-focused component
const JudgeDashboard: React.FC<JudgeDashboardProps> = ({ show, trials }) => {
  const myAssignments = show.assignedJudges || [];
  const upcomingTrials = trials.filter(t => t.status === 'Upcoming');

  return (
    <div className="space-y-6">
      {/* Judge Assignments */}
      <Card className="group overflow-hidden border-0 bg-gradient-to-br from-orange-50/50 via-white to-amber-50/30 backdrop-blur-xl shadow-lg hover:shadow-xl transition-all duration-300">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-xl font-semibold text-gray-900">
            <div className="p-2 bg-gradient-to-br from-orange-500 to-amber-600 rounded-lg text-white shadow-lg">
              <UserCheck className="w-5 h-5" />
            </div>
            My Assignments
          </CardTitle>
        </CardHeader>
        <CardContent>
          {myAssignments.length > 0 ? (
            <div className="space-y-6">
              {myAssignments.map((assignment, index) => (
                <div key={index} className="group p-6 bg-gradient-to-br from-white to-orange-50/30 border border-orange-100 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-1">
                  <div className="flex items-start gap-4">
                    <div className="p-2 bg-gradient-to-br from-orange-400 to-amber-500 rounded-lg text-white shadow-md group-hover:scale-110 transition-transform duration-300">
                      <UserCheck className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-lg text-gray-900 mb-2">{assignment.judgeName}</div>
                      <div className="text-gray-600 mb-4">
                        <span className="font-medium">{assignment.assignedClasses?.length || 0}</span> classes assigned
                      </div>
                      {assignment.assignedClasses && assignment.assignedClasses.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {assignment.assignedClasses.slice(0, 4).map((className, idx) => (
                            <Badge key={idx} className="bg-gradient-to-r from-orange-100 to-amber-100 text-orange-800 border border-orange-200 text-sm font-medium px-3 py-1">
                              {className}
                            </Badge>
                          ))}
                          {assignment.assignedClasses.length > 4 && (
                            <Badge className="bg-gradient-to-r from-gray-100 to-slate-100 text-gray-700 border border-gray-200 text-sm font-medium px-3 py-1">
                              +{assignment.assignedClasses.length - 4} more
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="max-w-sm mx-auto space-y-6">
                <div className="p-6 bg-gradient-to-br from-orange-100 to-amber-100 rounded-full w-fit mx-auto">
                  <UserCheck className="w-16 h-16 text-orange-400" />
                </div>
                <div className="space-y-2">
                  <div className="text-xl font-bold text-gray-900">No assignments yet</div>
                  <div className="text-gray-600 leading-relaxed">
                    Your judging assignments will appear here when they're made by the show committee.
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upcoming Trials Schedule */}
      <Card className="group overflow-hidden border-0 bg-gradient-to-br from-teal-50/50 via-white to-cyan-50/30 backdrop-blur-xl shadow-lg hover:shadow-xl transition-all duration-300">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-xl font-semibold text-gray-900">
            <div className="p-2 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-lg text-white shadow-lg">
              <Calendar className="w-5 h-5" />
            </div>
            Upcoming Schedule
          </CardTitle>
        </CardHeader>
        <CardContent>
          {upcomingTrials.length > 0 ? (
            <div className="space-y-4">
              {upcomingTrials.map((trial, index) => (
                <div key={index} className="group flex items-center justify-between p-6 bg-gradient-to-br from-white to-teal-50/30 border border-teal-100 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-1">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-gradient-to-br from-teal-400 to-cyan-500 rounded-lg text-white shadow-md group-hover:scale-110 transition-transform duration-300">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-lg text-gray-900">{trial.type}</div>
                      <div className="text-gray-600 flex items-center gap-2 mt-1">
                        <Clock className="w-4 h-4" />
                        <span>
                          {new Date(trial.trialDate).toLocaleDateString('en-US', { 
                            weekday: 'short', 
                            month: 'short', 
                            day: 'numeric' 
                          })} at {trial.plannedStartTime}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Badge className="bg-gradient-to-r from-teal-100 to-cyan-100 text-teal-800 border border-teal-200 px-3 py-1.5 rounded-full font-medium">
                    {formatDistanceToNow(new Date(trial.trialDate), { addSuffix: true })}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="max-w-sm mx-auto space-y-6">
                <div className="p-6 bg-gradient-to-br from-teal-100 to-cyan-100 rounded-full w-fit mx-auto">
                  <Calendar className="w-16 h-16 text-teal-400" />
                </div>
                <div className="space-y-2">
                  <div className="text-xl font-bold text-gray-900">No upcoming trials</div>
                  <div className="text-gray-600 leading-relaxed">
                    Trial schedules will appear here when available.
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const ShowDetailsEnhanced: React.FC<ShowDetailsEnhancedProps> = ({
  showData,
  associatedTrials,
  onEditShow,
  onDeleteShow: _onDeleteShow,
  onRegisterForShow,
  onManageEntries,
  onViewResults: _onViewResults
}) => {
  const navigate = useNavigate();
  const { userWithRoles } = useAuthContext();
  const [activeTab, setActiveTab] = useState('overview');

  // Generate breadcrumb items
  const breadcrumbItems = useBreadcrumb({
    currentPage: 'show',
    show: showData
  });

  // Determine user's primary role for interface adaptation
  const primaryRole = useMemo(() => {
    if (!userWithRoles?.roles?.length) return UserRole.EXHIBITOR;
    
    // Priority order for role selection
    const rolePriority = [
      UserRole.SITE_ADMIN,
      UserRole.SECRETARY,
      UserRole.CLUB_ADMIN,
      UserRole.JUDGE,
      UserRole.EXHIBITOR
    ];
    
    for (const role of rolePriority) {
      if (userWithRoles.roles.includes(role)) {
        return role;
      }
    }
    
    return UserRole.EXHIBITOR;
  }, [userWithRoles]);

  // Determine default tab based on user role
  const defaultTab = useMemo(() => {
    switch (primaryRole) {
      case UserRole.SECRETARY:
      case UserRole.CLUB_ADMIN:
      case UserRole.SITE_ADMIN:
        return 'management';
      case UserRole.JUDGE:
        return 'assignments';
      default:
        return 'overview';
    }
  }, [primaryRole]);

  // Registration state logic for header button
  const registrationState = useMemo(() => {
    const now = new Date();
    const entriesOpen = isAfter(now, new Date(showData.entryOpenDate));
    const entriesClose = isBefore(now, new Date(showData.entryCloseDate));
    const canRegister = entriesOpen && entriesClose && showData.status?.toLowerCase() === 'published';
    
    return {
      canRegister,
      entriesOpen,
      entriesClose,
      isPublished: showData.status?.toLowerCase() === 'published'
    };
  }, [showData]);

  // Set initial tab based on role
  React.useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      'published': { 
        className: 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg', 
        dotColor: 'bg-white', 
        icon: CheckCircle 
      },
      'draft': { 
        className: 'bg-gradient-to-r from-gray-400 to-slate-500 text-white shadow-lg', 
        dotColor: 'bg-white', 
        icon: Clock 
      },
      'cancelled': { 
        className: 'bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-lg', 
        dotColor: 'bg-white', 
        icon: AlertCircle 
      }
    };
    
    const config = statusConfig[status?.toLowerCase() as keyof typeof statusConfig] || statusConfig.published;
    const Icon = config.icon;
    
    return (
      <Badge className={`flex items-center gap-2 px-3 py-1.5 rounded-full font-medium text-sm transition-all duration-300 hover:scale-105 ${config.className}`}>
        <Icon className="w-3 h-3" />
        {status || 'Published'}
      </Badge>
    );
  };

  return (
    <div className="container mx-auto px-6 py-8 max-w-7xl">
      {/* Header Section */}
      <div className="mb-12">
        <Breadcrumb items={breadcrumbItems} showHomeIcon={true} />
        
        {/* Enhanced Header */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-50/50 via-white to-purple-50/30 backdrop-blur-xl border border-gray-200/50 shadow-xl mt-8">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-500/5" />
          <div className="relative p-8">
            <div className="flex items-start justify-between">
              <div className="flex-1 space-y-6">
                <div className="flex items-start gap-6">
                  <div className="flex-1">
                    <div className="flex items-center gap-4 mb-4">
                      <h1 className="text-4xl font-bold text-gray-900 leading-tight">{showData.name}</h1>
                      {getStatusBadge(showData.status)}
                    </div>
                    
                    <div className="text-xl text-gray-700 mb-6 leading-relaxed">
                      {showData.events && showData.events.length > 0 
                        ? showData.events.join(' • ')
                        : 'Professional dog show competition featuring multiple events and conformation classes'}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-8 text-gray-600">
                  <div className="flex items-center gap-3 bg-white/60 backdrop-blur-sm rounded-lg px-4 py-2 shadow-sm">
                    <Calendar className="w-5 h-5 text-blue-600" />
                    <span className="font-medium">
                      {new Date(showData.startDate).toLocaleDateString('en-US', { 
                        weekday: 'short', 
                        month: 'short', 
                        day: 'numeric' 
                      })} - {new Date(showData.endDate).toLocaleDateString('en-US', { 
                        weekday: 'short', 
                        month: 'short', 
                        day: 'numeric' 
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 bg-white/60 backdrop-blur-sm rounded-lg px-4 py-2 shadow-sm">
                    <Users className="w-5 h-5 text-purple-600" />
                    <span className="font-medium">{showData.clubName}</span>
                  </div>
                  {showData.location && (
                    <div className="flex items-center gap-3 bg-white/60 backdrop-blur-sm rounded-lg px-4 py-2 shadow-sm">
                      <MapPin className="w-5 h-5 text-green-600" />
                      <span className="font-medium">{showData.location}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Primary Action Button - Role-based */}
              <div className="flex items-center gap-4 mt-6">
                {primaryRole === UserRole.EXHIBITOR && onRegisterForShow && (
                  registrationState.canRegister ? (
                    <Button 
                      onClick={onRegisterForShow} 
                      size="lg" 
                      className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5 hover:scale-105 px-8 py-3 text-base font-semibold"
                    >
                      <UserPlus className="w-5 h-5 mr-3" />
                      Register for Show
                      <ArrowRight className="w-5 h-5 ml-3" />
                    </Button>
                  ) : (
                    <Button disabled size="lg" variant="outline" className="px-8 py-3 text-base bg-gray-50 border-gray-200">
                      <UserPlus className="w-5 h-5 mr-3" />
                      {!registrationState.isPublished ? 'Not Published' :
                       !registrationState.entriesOpen ? 'Opens Soon' : 'Registration Closed'}
                    </Button>
                  )
                )}
                
                {(primaryRole === UserRole.SECRETARY || primaryRole === UserRole.CLUB_ADMIN || primaryRole === UserRole.SITE_ADMIN) && (
                  <PermissionGuard permission={PERMISSIONS.SHOW_UPDATE}>
                    <Button 
                      onClick={onEditShow} 
                      variant="outline" 
                      size="lg" 
                      className="px-8 py-3 text-base border-2 border-gray-300 hover:border-blue-400 hover:bg-blue-50 transition-all duration-300 font-semibold"
                    >
                      <Settings className="w-5 h-5 mr-3" />
                      Manage Show
                    </Button>
                  </PermissionGuard>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Tabbed Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
        <TabsList className={`grid w-full bg-gradient-to-r from-gray-50/80 to-gray-100/50 backdrop-blur-sm border border-gray-200/50 rounded-xl p-1.5 shadow-lg ${
          primaryRole === UserRole.EXHIBITOR ? 'grid-cols-3' :
          primaryRole === UserRole.JUDGE ? 'grid-cols-3' :
          (primaryRole === UserRole.SECRETARY || primaryRole === UserRole.CLUB_ADMIN || primaryRole === UserRole.SITE_ADMIN) ? 'grid-cols-3' :
          'grid-cols-2'
        }`}>
          <TabsTrigger 
            value="overview" 
            className="rounded-lg text-base font-semibold py-3 px-6 transition-all duration-300 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg hover:bg-white/60"
          >
            Overview
          </TabsTrigger>
          {(primaryRole === UserRole.EXHIBITOR) && (
            <TabsTrigger 
              value="registration" 
              className="rounded-lg text-base font-semibold py-3 px-6 transition-all duration-300 data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500 data-[state=active]:to-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-lg hover:bg-white/60"
            >
              Registration
            </TabsTrigger>
          )}
          {(primaryRole === UserRole.SECRETARY || primaryRole === UserRole.CLUB_ADMIN || primaryRole === UserRole.SITE_ADMIN) && (
            <TabsTrigger 
              value="management" 
              className="rounded-lg text-base font-semibold py-3 px-6 transition-all duration-300 data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-500 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg hover:bg-white/60"
            >
              Management
            </TabsTrigger>
          )}
          {primaryRole === UserRole.JUDGE && (
            <TabsTrigger 
              value="assignments" 
              className="rounded-lg text-base font-semibold py-3 px-6 transition-all duration-300 data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500 data-[state=active]:to-red-600 data-[state=active]:text-white data-[state=active]:shadow-lg hover:bg-white/60"
            >
              My Assignments
            </TabsTrigger>
          )}
          <TabsTrigger 
            value="trials" 
            className="rounded-lg text-base font-semibold py-3 px-6 transition-all duration-300 data-[state=active]:bg-gradient-to-r data-[state=active]:from-teal-500 data-[state=active]:to-cyan-600 data-[state=active]:text-white data-[state=active]:shadow-lg hover:bg-white/60"
          >
            Trials & Schedule
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Enhanced Quick Stats */}
            <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="group overflow-hidden border-0 bg-gradient-to-br from-slate-50 to-gray-50 backdrop-blur-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="text-3xl font-bold text-gray-900">{associatedTrials.length}</div>
                      <div className="text-sm font-medium text-gray-500 uppercase tracking-wide">Total Trials</div>
                    </div>
                    <div className="p-3 bg-gradient-to-br from-slate-500 to-gray-600 rounded-xl text-white shadow-lg group-hover:scale-110 transition-transform duration-300">
                      <Calendar className="w-8 h-8" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="group overflow-hidden border-0 bg-gradient-to-br from-yellow-50 to-orange-50 backdrop-blur-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="text-3xl font-bold text-orange-900">{associatedTrials.length * 8}</div>
                      <div className="text-sm font-medium text-orange-600 uppercase tracking-wide">Classes</div>
                    </div>
                    <div className="p-3 bg-gradient-to-br from-yellow-500 to-orange-600 rounded-xl text-white shadow-lg group-hover:scale-110 transition-transform duration-300">
                      <Trophy className="w-8 h-8" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="group overflow-hidden border-0 bg-gradient-to-br from-purple-50 to-indigo-50 backdrop-blur-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="text-3xl font-bold text-purple-900">{associatedTrials.length * 32}</div>
                      <div className="text-sm font-medium text-purple-600 uppercase tracking-wide">Est. Entries</div>
                    </div>
                    <div className="p-3 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl text-white shadow-lg group-hover:scale-110 transition-transform duration-300">
                      <Users className="w-8 h-8" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Enhanced Show Details */}
            <Card className="group overflow-hidden border-0 bg-gradient-to-br from-blue-50/50 via-white to-indigo-50/30 backdrop-blur-xl shadow-lg hover:shadow-xl transition-all duration-300">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-xl font-semibold text-gray-900">
                  <div className="p-2 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg text-white shadow-lg">
                    <Eye className="w-5 h-5" />
                  </div>
                  Show Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-gray-500 uppercase tracking-wide">Show Type</div>
                    <div className="text-base font-semibold text-gray-900 bg-gray-50 rounded-lg px-3 py-2">{showData.type}</div>
                  </div>
                  {showData.chairman && (
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-gray-500 uppercase tracking-wide flex items-center gap-2">
                        <UserCheck className="w-3 h-3" />
                        Chairman
                      </div>
                      <div className="text-base font-semibold text-gray-900">{showData.chairman}</div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-gray-500 uppercase tracking-wide flex items-center gap-2">
                      <Mail className="w-3 h-3" />
                      Secretary
                    </div>
                    <div className="text-base font-semibold text-gray-900">{showData.secretary}</div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-gray-500 uppercase tracking-wide flex items-center gap-2">
                      <DollarSign className="w-3 h-3" />
                      Entry Fees
                    </div>
                    <div className="flex gap-3">
                      <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 flex-1">
                        <div className="text-lg font-bold text-green-700">${showData.preEntryFee}</div>
                        <div className="text-xs text-green-600">Pre-entry</div>
                      </div>
                      <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 flex-1">
                        <div className="text-lg font-bold text-orange-700">${showData.dayOfShowFee || showData.preEntryFee}</div>
                        <div className="text-xs text-orange-600">Day of show</div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {primaryRole === UserRole.EXHIBITOR && onRegisterForShow && (
          <TabsContent value="registration">
            <ExhibitorDashboard show={showData} onRegister={onRegisterForShow} />
          </TabsContent>
        )}

        {(primaryRole === UserRole.SECRETARY || primaryRole === UserRole.CLUB_ADMIN || primaryRole === UserRole.SITE_ADMIN) && (
          <TabsContent value="management">
            <SecretaryDashboard 
              show={showData} 
              trials={associatedTrials}
              onManageEntries={onManageEntries || (() => {})}
            />
          </TabsContent>
        )}

        {primaryRole === UserRole.JUDGE && (
          <TabsContent value="assignments">
            <JudgeDashboard show={showData} trials={associatedTrials} />
          </TabsContent>
        )}

        <TabsContent value="trials" className="space-y-8">
          {associatedTrials.length > 0 ? (
            <div className="grid gap-6">
              {associatedTrials.map((trial, index) => {
                const getTrialStatusBadge = (status: string) => {
                  const statusConfig = {
                    'upcoming': { className: 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white', icon: Clock },
                    'completed': { className: 'bg-gradient-to-r from-green-500 to-emerald-600 text-white', icon: CheckCircle },
                    'cancelled': { className: 'bg-gradient-to-r from-red-500 to-rose-600 text-white', icon: AlertCircle }
                  };
                  const config = statusConfig[status?.toLowerCase() as keyof typeof statusConfig] || statusConfig.upcoming;
                  const Icon = config.icon;
                  return (
                    <Badge className={`flex items-center gap-1.5 px-3 py-1 rounded-full font-medium text-sm ${config.className}`}>
                      <Icon className="w-3 h-3" />
                      {status}
                    </Badge>
                  );
                };
                
                return (
                  <Card key={trial.id || index} className="group overflow-hidden border-0 bg-gradient-to-br from-white via-gray-50/30 to-slate-50/50 backdrop-blur-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                    <CardContent className="p-8">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 space-y-4">
                          <div className="flex items-start gap-4">
                            <div className="p-3 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-xl text-white shadow-lg group-hover:scale-110 transition-transform duration-300">
                              <Calendar className="w-6 h-6" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-4 mb-3">
                                <h3 className="text-xl font-bold text-gray-900">{trial.type}</h3>
                                {getTrialStatusBadge(trial.status)}
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center gap-2 text-gray-700">
                                  <Calendar className="w-4 h-4 text-teal-600" />
                                  <span className="font-medium">
                                    {new Date(trial.trialDate).toLocaleDateString('en-US', { 
                                      weekday: 'long', 
                                      year: 'numeric', 
                                      month: 'long', 
                                      day: 'numeric' 
                                    })}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 text-gray-700">
                                  <Clock className="w-4 h-4 text-blue-600" />
                                  <span className="font-medium">{trial.plannedStartTime}</span>
                                </div>
                                <div className="flex items-center gap-2 text-gray-600">
                                  <span className="text-sm">Trial #{trial.trialNumber}</span>
                                  <span className="text-gray-400">•</span>
                                  <span className="text-sm">{formatDistanceToNow(new Date(trial.trialDate), { addSuffix: true })}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        <Button 
                          variant="outline" 
                          size="lg"
                          onClick={() => navigate(`/trials/${trial.id}`)}
                          className="ml-6 border-2 border-gray-200 hover:border-teal-400 hover:bg-teal-50 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg font-semibold px-6"
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          View Details
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="border-0 bg-gradient-to-br from-gray-50/50 via-white to-slate-50/30 backdrop-blur-xl shadow-lg">
              <CardContent className="p-16 text-center">
                <div className="max-w-md mx-auto space-y-6">
                  <div className="p-6 bg-gradient-to-br from-gray-100 to-slate-100 rounded-full w-fit mx-auto">
                    <Calendar className="w-16 h-16 text-gray-400" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-2xl font-bold text-gray-900">No Trials Scheduled</h3>
                    <p className="text-gray-600 text-lg leading-relaxed">
                      Trials and competition schedules will appear here once they're added to the show.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ShowDetailsEnhanced;