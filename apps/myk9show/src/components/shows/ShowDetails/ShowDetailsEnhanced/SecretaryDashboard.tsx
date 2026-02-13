import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Calendar,
  Users,
  Clock,
  CheckCircle,
  Settings,
  BarChart3,
} from 'lucide-react';
import type { SecretaryDashboardProps } from './types';

export const SecretaryDashboard: React.FC<SecretaryDashboardProps> = ({
  show: _show,
  trials,
  onManageEntries,
}) => {
  const totalTrials = trials.length;
  const completedTrials = trials.filter((t) => t.status === 'Completed').length;
  const upcomingTrials = trials.filter((t) => t.status === 'Upcoming').length;

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
                <div className="text-sm font-medium text-primary uppercase tracking-wide">Upcoming</div>
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
