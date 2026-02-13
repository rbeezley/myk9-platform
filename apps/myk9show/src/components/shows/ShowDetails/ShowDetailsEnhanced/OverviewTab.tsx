import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Calendar,
  Users,
  Trophy,
  DollarSign,
  Eye,
  UserCheck,
  Mail,
} from 'lucide-react';
import type { OverviewTabProps } from './types';

export const OverviewTab: React.FC<OverviewTabProps> = ({ showData, associatedTrials }) => {
  const classesEstimate = associatedTrials.length * 8;
  const entriesEstimate = associatedTrials.length * 32;

  return (
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
                <div className="text-3xl font-bold text-orange-900">{classesEstimate}</div>
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
                <div className="text-3xl font-bold text-purple-900">{entriesEstimate}</div>
                <div className="text-sm font-medium text-primary uppercase tracking-wide">Est. Entries</div>
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
              <div className="text-base font-semibold text-gray-900 bg-gray-50 rounded-lg px-3 py-2">
                {showData.type}
              </div>
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
                  <div className="text-lg font-bold text-orange-700">
                    ${showData.dayOfShowFee || showData.preEntryFee}
                  </div>
                  <div className="text-xs text-orange-600">Day of show</div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
