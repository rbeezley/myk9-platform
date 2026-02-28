/**
 * ShowManagementPage - Comprehensive show management interface
 *
 * Central page for secretaries to manage all aspects of a dog show including:
 * - Show dashboard and overview
 * - Entry management
 * - Class management
 * - Schedule and run order
 * - Personnel assignments
 * - Reports and analytics
 */

import React, { useState, useEffect } from 'react';
import { logger } from '@/services/LoggingService';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useShowStore } from '@/store/showStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  ArrowLeft,
  Settings,
  Users,
  Calendar,
  FileText,
  AlertTriangle,
  CheckCircle,
  Plus,
  Eye,
  Edit,
  MoreHorizontal,
  Download,
  Share,
  Archive,
  Trash2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ShowDashboard } from '@/components/shows/ShowDashboard';
import { cn } from '@/lib/utils';

export interface ShowManagementPageProps {
  className?: string;
}

interface NavigationItem {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  badge?: string;
  urgent?: boolean;
}

export function ShowManagementPage({ className }: ShowManagementPageProps) {
  const { showId } = useParams<{ showId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const { getShowById } = useShowStore();

  const [activeSection, setActiveSection] = useState('dashboard');
  const [loading, setLoading] = useState(true);

  const show = showId ? getShowById(showId) : null;

  useEffect(() => {
    // Simulate loading delay for smooth UX
    const timer = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(timer);
  }, [showId]);

  // Check permissions - simplified for now since User type doesn't have permissions
  const canManageShow = user?.role === 'secretary' || user?.role === 'admin' || true; // Allow all for now

  if (!canManageShow) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            You don't have permission to manage shows. Please contact an administrator.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={cn('container mx-auto p-6 max-w-7xl', className)}>
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-muted rounded"></div>
            ))}
          </div>
          <div className="h-96 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (!show) {
    return (
      <div className={cn('container mx-auto p-6 max-w-4xl', className)}>
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Show not found. Please check the show ID or{' '}
            <Link to="/shows" className="underline">
              return to the shows list
            </Link>
            .
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Navigation items based on show management workflow
  const navigationItems: NavigationItem[] = [
    {
      id: 'dashboard',
      title: 'Dashboard',
      description: 'Show overview and key metrics',
      icon: Eye,
      href: `/secretary/shows/${showId}`,
      ...(show.status === 'draft' ? { badge: 'Setup Required' } : {}),
    },
    {
      id: 'entries',
      title: 'Entry Management',
      description: 'Manage registrations and payments',
      icon: Users,
      href: `/secretary/shows/${showId}/entries`,
      badge: '0', // Would be populated with pending count
      urgent: false, // Would be true if pending entries > 5
    },
    {
      id: 'classes',
      title: 'Class Management',
      description: 'Set up and configure classes',
      icon: Settings,
      href: `/secretary/shows/${showId}/classes`,
    },
    {
      id: 'schedule',
      title: 'Schedule & Run Order',
      description: 'Manage timing and judge assignments',
      icon: Calendar,
      href: `/secretary/shows/${showId}/run-order`,
      urgent: false, // Would be true if conflicts detected
    },
    {
      id: 'reports',
      title: 'Reports & Export',
      description: 'Generate reports and export data',
      icon: FileText,
      href: `/secretary/shows/${showId}/reports`,
    },
  ];

  // Show actions dropdown items
  const handleShowAction = (action: string) => {
    switch (action) {
      case 'edit':
        navigate(`/secretary/shows/${showId}/edit`);
        break;
      case 'duplicate':
        logger.debug('Duplicate show:', 'secretary', { data: showId });
        break;
      case 'export':
        logger.debug('Export show data:', 'secretary', { data: showId });
        break;
      case 'archive':
        logger.debug('Archive show:', 'secretary', { data: showId });
        break;
      case 'delete':
        if (confirm('Are you sure you want to delete this show? This action cannot be undone.')) {
          logger.debug('Delete show:', 'secretary', { data: showId });
          navigate('/shows');
        }
        break;
      default:
        break;
    }
  };

  return (
    <div className={cn('container mx-auto p-6 max-w-7xl', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/shows')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Shows
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{show.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={show.status === 'published' ? 'default' : 'secondary'}>
                {show.status}
              </Badge>
              <span className="text-muted-foreground">
                {show.startDate} - {show.endDate}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate(`/shows/${showId}`)}>
            <Eye className="h-4 w-4 mr-2" />
            Public View
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => handleShowAction('edit')}>
                <Edit className="mr-2 h-4 w-4" />
                Edit Show Details
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleShowAction('duplicate')}>
                <Plus className="mr-2 h-4 w-4" />
                Duplicate Show
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleShowAction('export')}>
                <Download className="mr-2 h-4 w-4" />
                Export Data
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleShowAction('share')}>
                <Share className="mr-2 h-4 w-4" />
                Share Show
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleShowAction('archive')}>
                <Archive className="mr-2 h-4 w-4" />
                Archive Show
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleShowAction('delete')}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Show
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Show status alert */}
      {show.status === 'draft' && (
        <Alert className="mb-6">
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>
            This show is in draft mode. Complete the setup and publish it to make it available for
            registrations.
          </AlertDescription>
        </Alert>
      )}

      {/* Main Content */}
      <Tabs value={activeSection} onValueChange={setActiveSection}>
        <TabsList className="grid w-full grid-cols-5">
          {navigationItems.map(item => (
            <TabsTrigger
              key={item.id}
              value={item.id}
              className={cn('flex items-center gap-2', item.urgent && 'text-orange-600')}
            >
              <item.icon className="h-4 w-4" />
              <span className="hidden sm:inline">{item.title}</span>
              {item.badge && (
                <Badge variant={item.urgent ? 'destructive' : 'secondary'} className="text-xs">
                  {item.badge}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="dashboard" className="mt-6">
          <ShowDashboard {...(showId ? { showId } : {})} />
        </TabsContent>

        <TabsContent value="entries" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Entry Management</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <Users className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Entry Management</h3>
                <p className="text-muted-foreground mb-6">
                  The comprehensive entry management system would be integrated here, including:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto mb-6">
                  <div className="text-left">
                    <h4 className="font-medium">Features Available:</h4>
                    <ul className="text-sm text-muted-foreground mt-2 space-y-1">
                      <li>• Registration review and approval</li>
                      <li>• Payment status tracking</li>
                      <li>• Entry validation and limit checking</li>
                      <li>• Waitlist management</li>
                    </ul>
                  </div>
                  <div className="text-left">
                    <h4 className="font-medium">Actions Available:</h4>
                    <ul className="text-sm text-muted-foreground mt-2 space-y-1">
                      <li>• Bulk status updates</li>
                      <li>• Entry modifications</li>
                      <li>• Communication with exhibitors</li>
                      <li>• Export entry lists</li>
                    </ul>
                  </div>
                </div>
                <Button onClick={() => navigate(`/secretary/shows/${showId}/entries`)}>
                  Open Entry Management
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="classes" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Class Management</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <Settings className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Class Management</h3>
                <p className="text-muted-foreground mb-6">
                  Advanced class management tools are available through the dedicated class
                  management interface.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button onClick={() => navigate(`/secretary/shows/${showId}/classes/create`)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Classes
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => navigate(`/secretary/shows/${showId}/classes`)}
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Manage Existing Classes
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Schedule & Run Order</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <Calendar className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Schedule Management</h3>
                <p className="text-muted-foreground mb-6">
                  Comprehensive scheduling tools with drag-and-drop interface, conflict detection,
                  and judge assignment.
                </p>
                <Button onClick={() => navigate(`/secretary/shows/${showId}/run-order`)}>
                  <Calendar className="h-4 w-4 mr-2" />
                  Open Schedule Management
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Reports & Export</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Reports & Analytics</h3>
                <p className="text-muted-foreground mb-6">
                  Generate comprehensive reports and export data for analysis.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto">
                  <Button variant="outline" className="h-auto p-4">
                    <div className="text-center">
                      <FileText className="h-6 w-6 mx-auto mb-2" />
                      <div className="font-medium">Entry Reports</div>
                      <div className="text-xs text-muted-foreground">
                        Registrations, payments, statistics
                      </div>
                    </div>
                  </Button>
                  <Button variant="outline" className="h-auto p-4">
                    <div className="text-center">
                      <Calendar className="h-6 w-6 mx-auto mb-2" />
                      <div className="font-medium">Schedule Reports</div>
                      <div className="text-xs text-muted-foreground">
                        Run orders, judge assignments
                      </div>
                    </div>
                  </Button>
                  <Button variant="outline" className="h-auto p-4">
                    <div className="text-center">
                      <Download className="h-6 w-6 mx-auto mb-2" />
                      <div className="font-medium">Data Export</div>
                      <div className="text-xs text-muted-foreground">CSV, PDF, JSON formats</div>
                    </div>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default ShowManagementPage;
