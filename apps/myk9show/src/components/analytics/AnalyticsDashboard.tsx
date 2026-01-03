import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart
} from 'recharts';
import { 
  TrendingUp, 
  Trophy, 
  DollarSign, 
  Calendar,
  Award,
  BarChart3,
  Download,
  RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface PerformanceData {
  month: string;
  shows: number;
  placements: number;
  earnings: number;
  expenses: number;
  firstPlace: number;
  secondPlace: number;
  thirdPlace: number;
}

interface DogPerformance {
  id: string;
  name: string;
  breed: string;
  shows: number;
  wins: number;
  winRate: number;
  earnings: number;
  lastShow: Date;
}

interface ShowStats {
  totalShows: number;
  totalPlacements: number;
  winRate: number;
  averageRating: number;
  totalEarnings: number;
  totalExpenses: number;
  netProfit: number;
}

const mockPerformanceData: PerformanceData[] = [
  { month: 'Jan', shows: 4, placements: 7, earnings: 2400, expenses: 1800, firstPlace: 2, secondPlace: 3, thirdPlace: 2 },
  { month: 'Feb', shows: 6, placements: 9, earnings: 3200, expenses: 2200, firstPlace: 3, secondPlace: 4, thirdPlace: 2 },
  { month: 'Mar', shows: 8, placements: 12, earnings: 4100, expenses: 2800, firstPlace: 4, secondPlace: 5, thirdPlace: 3 },
  { month: 'Apr', shows: 5, placements: 8, earnings: 2800, expenses: 2000, firstPlace: 2, secondPlace: 4, thirdPlace: 2 },
  { month: 'May', shows: 7, placements: 11, earnings: 3600, expenses: 2500, firstPlace: 3, secondPlace: 5, thirdPlace: 3 },
  { month: 'Jun', shows: 9, placements: 14, earnings: 4800, expenses: 3200, firstPlace: 5, secondPlace: 6, thirdPlace: 3 }
];

const mockDogPerformance: DogPerformance[] = [
  { id: '1', name: 'Champion Rex', breed: 'German Shepherd', shows: 15, wins: 8, winRate: 53.3, earnings: 4200, lastShow: new Date('2024-06-15') },
  { id: '2', name: 'Lady Belle', breed: 'Golden Retriever', shows: 12, wins: 6, winRate: 50.0, earnings: 3200, lastShow: new Date('2024-06-10') },
  { id: '3', name: 'Duke Thunder', breed: 'Rottweiler', shows: 18, wins: 12, winRate: 66.7, earnings: 5800, lastShow: new Date('2024-06-20') },
  { id: '4', name: 'Princess Luna', breed: 'Border Collie', shows: 10, wins: 4, winRate: 40.0, earnings: 2100, lastShow: new Date('2024-06-05') }
];


export function AnalyticsDashboard() {
  const [timeRange, setTimeRange] = useState<'3m' | '6m' | '1y'>('6m');
  const [selectedTab, setSelectedTab] = useState('overview');

  const stats: ShowStats = useMemo(() => {
    const totals = mockPerformanceData.reduce((acc, month) => ({
      shows: acc.shows + month.shows,
      placements: acc.placements + month.placements,
      earnings: acc.earnings + month.earnings,
      expenses: acc.expenses + month.expenses,
      firstPlace: acc.firstPlace + month.firstPlace,
      secondPlace: acc.secondPlace + month.secondPlace,
      thirdPlace: acc.thirdPlace + month.thirdPlace
    }), { shows: 0, placements: 0, earnings: 0, expenses: 0, firstPlace: 0, secondPlace: 0, thirdPlace: 0 });

    return {
      totalShows: totals.shows,
      totalPlacements: totals.placements,
      winRate: totals.shows > 0 ? (totals.placements / totals.shows * 100) : 0,
      averageRating: 4.2, // Mock rating
      totalEarnings: totals.earnings,
      totalExpenses: totals.expenses,
      netProfit: totals.earnings - totals.expenses
    };
  }, []);

  const placementData = [
    { name: '1st Place', value: 19, color: '#ffd700' },
    { name: '2nd Place', value: 27, color: '#c0c0c0' },
    { name: '3rd Place', value: 15, color: '#cd7f32' },
    { name: 'Other', value: 8, color: '#94a3b8' }
  ];

  const breedPerformance = useMemo(() => {
    const breedStats: Record<string, { shows: number; wins: number; earnings: number }> = {};
    
    mockDogPerformance.forEach(dog => {
      if (!breedStats[dog.breed]) {
        breedStats[dog.breed] = { shows: 0, wins: 0, earnings: 0 };
      }
      breedStats[dog.breed].shows += dog.shows;
      breedStats[dog.breed].wins += dog.wins;
      breedStats[dog.breed].earnings += dog.earnings;
    });

    return Object.entries(breedStats).map(([breed, stats]) => ({
      breed,
      ...stats,
      winRate: stats.shows > 0 ? (stats.wins / stats.shows * 100).toFixed(1) : '0'
    }));
  }, []);

  const StatCard = ({ title, value, subtitle, icon: Icon, trend, color = "default" }: {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: React.ComponentType<{ className?: string }>;
    trend?: { value: number; positive: boolean };
    color?: "default" | "success" | "warning" | "danger";
  }) => (
    <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <CardContent className="relative p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
            <div className="flex items-baseline gap-2 mt-2">
              <p className="text-2xl font-bold group-hover:text-primary transition-colors duration-300">{value}</p>
              {trend && (
                <Badge variant={trend.positive ? "default" : "destructive"} className="text-xs px-2 py-1 rounded-full">
                  {trend.positive ? '+' : ''}{trend.value}%
                </Badge>
              )}
            </div>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
          <div className={cn(
            "w-12 h-12 rounded-xl flex items-center justify-center shadow-sm group-hover:shadow-xl group-hover:scale-110 transition-all duration-300",
            color === "success" && "bg-gradient-to-br from-green-500/20 to-green-400/10",
            color === "warning" && "bg-gradient-to-br from-yellow-500/20 to-yellow-400/10",
            color === "danger" && "bg-gradient-to-br from-red-500/20 to-red-400/10",
            color === "default" && "bg-gradient-to-br from-primary/20 to-primary/10"
          )}>
            <Icon className={cn(
              "h-6 w-6",
              color === "success" && "text-green-500",
              color === "warning" && "text-yellow-500",
              color === "danger" && "text-red-500",
              color === "default" && "text-primary"
            )} />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl flex items-center justify-center shadow-sm">
              <BarChart3 className="h-6 w-6 text-primary" />
            </div>
            Analytics Dashboard
          </h1>
          <p className="text-muted-foreground text-lg">Track your show performance and earnings</p>
        </div>
        
        <div className="flex gap-3">
          <div className="flex gap-2">
            {(['3m', '6m', '1y'] as const).map(range => (
              <Button
                key={range}
                variant={timeRange === range ? "default" : "outline"}
                size="sm"
                onClick={() => setTimeRange(range)}
                className={cn(
                  "transition-all duration-300",
                  timeRange === range 
                    ? "bg-gradient-to-r from-primary to-secondary text-primary-foreground hover:shadow-xl hover:-translate-y-1 hover:scale-[1.02] shadow-sm" 
                    : "border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/30 hover:-translate-y-0.5 shadow-sm"
                )}
              >
                {range === '3m' ? '3 Months' : range === '6m' ? '6 Months' : '1 Year'}
              </Button>
            ))}
          </div>
          <Button variant="outline" size="sm" className="border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/30 hover:-translate-y-0.5 transition-all duration-300 shadow-sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" className="border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/30 hover:-translate-y-0.5 transition-all duration-300 shadow-sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Key Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Shows"
          value={stats.totalShows}
          subtitle="This period"
          icon={Calendar}
          trend={{ value: 12, positive: true }}
        />
        <StatCard
          title="Win Rate"
          value={`${stats.winRate.toFixed(1)}%`}
          subtitle="Placement ratio"
          icon={Trophy}
          trend={{ value: 5, positive: true }}
          color="success"
        />
        <StatCard
          title="Total Earnings"
          value={`$${stats.totalEarnings.toLocaleString()}`}
          subtitle="Prize money"
          icon={DollarSign}
          trend={{ value: 23, positive: true }}
          color="success"
        />
        <StatCard
          title="Net Profit"
          value={`$${stats.netProfit.toLocaleString()}`}
          subtitle="After expenses"
          icon={TrendingUp}
          trend={{ value: 8, positive: true }}
          color={stats.netProfit > 0 ? "success" : "danger"}
        />
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-4 bg-gradient-to-r from-muted/50 to-muted/30 border border-border/30 rounded-xl p-1">
          <TabsTrigger 
            value="overview" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            Overview
          </TabsTrigger>
          <TabsTrigger 
            value="performance"
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            Performance
          </TabsTrigger>
          <TabsTrigger 
            value="financial"
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            Financial
          </TabsTrigger>
          <TabsTrigger 
            value="dogs"
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            Dogs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-8 mt-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Shows and Placements Trend */}
            <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <CardHeader className="relative">
                <CardTitle className="group-hover:text-primary transition-colors duration-300">Shows & Placements Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={mockPerformanceData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="shows" stroke="#8884d8" strokeWidth={2} name="Shows" />
                    <Line type="monotone" dataKey="placements" stroke="#82ca9d" strokeWidth={2} name="Placements" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Placement Distribution */}
            <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <CardHeader className="relative">
                <CardTitle className="group-hover:text-primary transition-colors duration-300">Placement Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={placementData}
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {placementData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Breed Performance */}
          <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <CardHeader className="relative">
              <CardTitle className="group-hover:text-primary transition-colors duration-300">Performance by Breed</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={breedPerformance}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="breed" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="shows" fill="#8884d8" name="Shows" />
                  <Bar dataKey="wins" fill="#82ca9d" name="Wins" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-8 mt-8">
          {/* Monthly Performance Trend */}
          <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <CardHeader className="relative">
              <CardTitle className="group-hover:text-primary transition-colors duration-300">Monthly Performance Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <AreaChart data={mockPerformanceData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Area type="monotone" dataKey="firstPlace" stackId="1" stroke="#ffd700" fill="#ffd700" name="1st Place" />
                  <Area type="monotone" dataKey="secondPlace" stackId="1" stroke="#c0c0c0" fill="#c0c0c0" name="2nd Place" />
                  <Area type="monotone" dataKey="thirdPlace" stackId="1" stroke="#cd7f32" fill="#cd7f32" name="3rd Place" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Individual Dog Performance */}
          <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <CardHeader className="relative">
              <CardTitle className="group-hover:text-primary transition-colors duration-300">Top Performing Dogs</CardTitle>
            </CardHeader>
            <CardContent className="relative">
              <div className="space-y-4">
                {mockDogPerformance.map((dog, index) => (
                  <div key={dog.id} className="group/dog relative overflow-hidden p-6 border border-border/50 bg-gradient-to-br from-muted/30 to-muted/10 rounded-2xl transition-all duration-500 hover:shadow-lg hover:-translate-y-1">
                    <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover/dog:opacity-100 transition-opacity duration-500" />
                    <div className="relative flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-primary/20 to-primary/10 rounded-2xl flex items-center justify-center shadow-sm group-hover/dog:shadow-xl group-hover/dog:scale-110 transition-all duration-300">
                          <span className="font-bold text-sm text-primary">#{index + 1}</span>
                        </div>
                        <div>
                          <p className="font-semibold text-lg group-hover/dog:text-primary transition-colors duration-300">{dog.name}</p>
                          <p className="text-sm text-muted-foreground">{dog.breed}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-6">
                          <div className="text-center">
                            <p className="text-sm font-semibold">{dog.wins}/{dog.shows}</p>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide">Wins</p>
                          </div>
                          <div className="text-center">
                            <Badge className={cn(
                              "font-semibold",
                              dog.winRate > 60 ? "bg-green-500/10 text-green-600 border-green-500/20" :
                              dog.winRate > 50 ? "bg-blue-500/10 text-blue-600 border-blue-500/20" :
                              "bg-orange-500/10 text-orange-600 border-orange-500/20"
                            )}>
                              {dog.winRate.toFixed(1)}%
                            </Badge>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide mt-1">Win Rate</p>
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-semibold text-green-600">${dog.earnings}</p>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide">Earnings</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="financial" className="space-y-8 mt-8">
          {/* Financial Overview */}
          <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <CardHeader className="relative">
              <CardTitle className="group-hover:text-primary transition-colors duration-300">Financial Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <AreaChart data={mockPerformanceData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(value, name) => [`$${value}`, name]} />
                  <Area type="monotone" dataKey="earnings" stroke="#22c55e" fill="#22c55e" fillOpacity={0.6} name="Earnings" />
                  <Area type="monotone" dataKey="expenses" stroke="#ef4444" fill="#ef4444" fillOpacity={0.6} name="Expenses" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Financial Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
              <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <CardContent className="relative p-8 text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-green-500/20 to-green-400/10 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm group-hover:shadow-xl group-hover:scale-110 transition-all duration-300">
                  <DollarSign className="h-8 w-8 text-green-500" />
                </div>
                <p className="text-3xl font-bold text-green-600 group-hover:text-green-500 transition-colors duration-300">${stats.totalEarnings.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground uppercase tracking-wide mt-2">Total Earnings</p>
              </CardContent>
            </Card>
            <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
              <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <CardContent className="relative p-8 text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-red-500/20 to-red-400/10 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm group-hover:shadow-xl group-hover:scale-110 transition-all duration-300">
                  <TrendingUp className="h-8 w-8 text-red-500" />
                </div>
                <p className="text-3xl font-bold text-red-600 group-hover:text-red-500 transition-colors duration-300">${stats.totalExpenses.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground uppercase tracking-wide mt-2">Total Expenses</p>
              </CardContent>
            </Card>
            <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
              <div className={cn(
                "absolute inset-0 bg-gradient-to-br to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500",
                stats.netProfit > 0 ? "from-blue-500/5" : "from-red-500/5"
              )} />
              <CardContent className="relative p-8 text-center">
                <div className={cn(
                  "w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm group-hover:shadow-xl group-hover:scale-110 transition-all duration-300",
                  stats.netProfit > 0 
                    ? "bg-gradient-to-br from-blue-500/20 to-blue-400/10" 
                    : "bg-gradient-to-br from-red-500/20 to-red-400/10"
                )}>
                  <Award className={cn(
                    "h-8 w-8",
                    stats.netProfit > 0 ? "text-blue-500" : "text-red-500"
                  )} />
                </div>
                <p className={cn(
                  "text-3xl font-bold transition-colors duration-300",
                  stats.netProfit > 0 
                    ? "text-green-600 group-hover:text-green-500" 
                    : "text-red-600 group-hover:text-red-500"
                )}>
                  ${stats.netProfit.toLocaleString()}
                </p>
                <p className="text-sm text-muted-foreground uppercase tracking-wide mt-2">Net Profit</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="dogs" className="space-y-8 mt-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {mockDogPerformance.map(dog => (
              <Card key={dog.id} className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <CardHeader className="relative">
                  <CardTitle className="text-xl font-bold group-hover:text-primary transition-colors duration-300">{dog.name}</CardTitle>
                  <p className="text-sm text-muted-foreground font-medium">{dog.breed}</p>
                </CardHeader>
                <CardContent className="relative">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-4 rounded-xl border border-border bg-gradient-to-br from-muted/10 to-muted/5 transition-all duration-300 hover:bg-gradient-to-br hover:from-muted/15 hover:to-muted/8">
                      <span className="text-sm font-medium text-muted-foreground">Shows</span>
                      <span className="font-bold text-lg">{dog.shows}</span>
                    </div>
                    <div className="flex justify-between items-center p-4 rounded-xl border border-border bg-gradient-to-br from-muted/10 to-muted/5 transition-all duration-300 hover:bg-gradient-to-br hover:from-muted/15 hover:to-muted/8">
                      <span className="text-sm font-medium text-muted-foreground">Wins</span>
                      <span className="font-bold text-lg">{dog.wins}</span>
                    </div>
                    <div className="flex justify-between items-center p-4 rounded-xl border border-border bg-gradient-to-br from-muted/10 to-muted/5 transition-all duration-300 hover:bg-gradient-to-br hover:from-muted/15 hover:to-muted/8">
                      <span className="text-sm font-medium text-muted-foreground">Win Rate</span>
                      <Badge className={cn(
                        "font-semibold px-3 py-1 rounded-full border-0",
                        dog.winRate > 60 ? "bg-green-500/15 text-green-600" :
                        dog.winRate > 50 ? "bg-blue-500/15 text-blue-600" :
                        "bg-orange-500/15 text-orange-600"
                      )}>
                        {dog.winRate.toFixed(1)}%
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center p-4 rounded-xl border border-border bg-gradient-to-br from-muted/10 to-muted/5 transition-all duration-300 hover:bg-gradient-to-br hover:from-muted/15 hover:to-muted/8">
                      <span className="text-sm font-medium text-muted-foreground">Earnings</span>
                      <span className="font-bold text-lg text-green-600">${dog.earnings}</span>
                    </div>
                    <div className="flex justify-between items-center p-4 rounded-xl border border-border bg-gradient-to-br from-muted/10 to-muted/5 transition-all duration-300 hover:bg-gradient-to-br hover:from-muted/15 hover:to-muted/8">
                      <span className="text-sm font-medium text-muted-foreground">Last Show</span>
                      <span className="text-sm text-muted-foreground font-medium">
                        {dog.lastShow.toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}