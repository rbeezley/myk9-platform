import React, { startTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole } from '@/types/auth-types';
import { 
  Trophy, 
  ClipboardList, 
  Users, 
  Timer, 
  FileText, 
  TrendingUp,
  Calendar,
  Settings
} from 'lucide-react';

const ResultEntryDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { userWithRoles, hasRole } = useAuthContext();

  // Define role-based quick access cards
  const getQuickAccessCards = () => {
    const cards = [];

    // Judge-specific cards
    if (hasRole(UserRole.SITE_ADMIN)) {
      cards.push({
        title: 'Judge Scoring',
        description: 'Access judge scoring interface',
        icon: Trophy,
        color: 'text-blue-600',
        bgColor: 'bg-blue-50',
        onClick: () => startTransition(() => navigate('/judge/dashboard')),
        stats: { label: 'Classes to Judge', value: '3' }
      });
    }

    // Secretary-specific cards
    if (hasRole(UserRole.SECRETARY) || hasRole(UserRole.SITE_ADMIN)) {
      cards.push({
        title: 'Secretary Dashboard',
        description: 'Manage results and placements',
        icon: ClipboardList,
        color: 'text-green-600',
        bgColor: 'bg-green-50',
        onClick: () => startTransition(() => navigate('/secretary/dashboard')),
        stats: { label: 'Active Trials', value: '5' }
      });
    }

    // All users can access exhibitor features
    cards.push({
      title: 'Exhibitor Portal',
      description: 'View entries and results',
      icon: Users,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      onClick: () => startTransition(() => navigate('/exhibitor/dashboard')),
      stats: { label: 'Your Entries', value: '8' }
    });

    // Additional common cards
    cards.push({
      title: 'Live Results',
      description: 'Real-time competition results',
      icon: TrendingUp,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      onClick: () => startTransition(() => navigate('/results/live')),
      stats: { label: 'Active Now', value: '12' }
    });

    return cards;
  };

  const quickAccessCards = getQuickAccessCards();

  return (
    <div className="container mx-auto pt-20 pb-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Result Entry System</h1>
          <p className="text-muted-foreground mt-1">
            Welcome back, {userWithRoles?.email}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Calendar className="h-4 w-4 mr-2" />
            Schedule
          </Button>
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </div>
      </div>

      {/* Quick Access Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {quickAccessCards.map((card, index) => (
          <Card 
            key={index} 
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={card.onClick}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className={`p-2 rounded-lg ${card.bgColor}`}>
                  <card.icon className={`h-6 w-6 ${card.color}`} />
                </div>
                {card.stats && (
                  <div className="text-right">
                    <p className="text-2xl font-bold">{card.stats.value}</p>
                    <p className="text-xs text-muted-foreground">{card.stats.label}</p>
                  </div>
                )}
              </div>
              <CardTitle className="mt-4">{card.title}</CardTitle>
              <CardDescription>{card.description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest updates from your events</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center space-x-4">
              <div className="flex-shrink-0">
                <Timer className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="flex-grow">
                <p className="text-sm font-medium">Interior Novice A - Started</p>
                <p className="text-sm text-muted-foreground">Ring 1 • Judge: Jane Doe</p>
              </div>
              <div className="text-sm text-muted-foreground">2 min ago</div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex-shrink-0">
                <Trophy className="h-8 w-8 text-yellow-600" />
              </div>
              <div className="flex-grow">
                <p className="text-sm font-medium">Container Expert - Results Posted</p>
                <p className="text-sm text-muted-foreground">1st: Luna (95.5 pts)</p>
              </div>
              <div className="text-sm text-muted-foreground">15 min ago</div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex-shrink-0">
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="flex-grow">
                <p className="text-sm font-medium">Exterior Excellent - Check-in Open</p>
                <p className="text-sm text-muted-foreground">24 entries confirmed</p>
              </div>
              <div className="text-sm text-muted-foreground">1 hour ago</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Statistics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Today's Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">18 / 45</div>
            <p className="text-xs text-muted-foreground">Classes completed</p>
            <div className="mt-2 h-2 bg-gray-200 rounded-full">
              <div className="h-2 bg-primary rounded-full" style={{ width: '40%' }} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Active Competitors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">156</div>
            <p className="text-xs text-muted-foreground">Currently on grounds</p>
            <p className="text-xs text-green-600 mt-1">+12 from yesterday</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Results Published</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">89%</div>
            <p className="text-xs text-muted-foreground">Within 30 minutes</p>
            <p className="text-xs text-blue-600 mt-1">Above average</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ResultEntryDashboard;