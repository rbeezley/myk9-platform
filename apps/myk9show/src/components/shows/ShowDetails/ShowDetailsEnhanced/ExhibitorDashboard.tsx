import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Calendar,
  DollarSign,
  UserPlus,
  AlertCircle,
  Star,
  ArrowRight,
  Users,
  Mail,
} from 'lucide-react';
import { isAfter, isBefore } from 'date-fns';
import { useResolvePersonName } from '@/hooks/useResolvePersonName';
import type { ExhibitorDashboardProps } from './types';

/** Milliseconds in one day */
const MS_PER_DAY = 1000 * 60 * 60 * 24;

export const ExhibitorDashboard: React.FC<ExhibitorDashboardProps> = ({ show, onRegister }) => {
  const resolvePersonName = useResolvePersonName();
  const { canRegister, daysUntilClose } = useMemo(() => {
    const now = new Date();
    const entriesOpen = isAfter(now, new Date(show.entryOpenDate));
    const entriesClose = isBefore(now, new Date(show.entryCloseDate));
    const canReg = entriesOpen && entriesClose && show.status?.toLowerCase() === 'published';
    const days = entriesClose
      ? Math.ceil((new Date(show.entryCloseDate).getTime() - now.getTime()) / MS_PER_DAY)
      : 0;
    return { canRegister: canReg, daysUntilClose: days, entriesOpen, entriesClose };
  }, [show.entryOpenDate, show.entryCloseDate, show.status]);

  const registrationDescription = useMemo(() => {
    const now = new Date();
    const entriesOpen = isAfter(now, new Date(show.entryOpenDate));
    const entriesClose = isBefore(now, new Date(show.entryCloseDate));

    if (show.status?.toLowerCase() !== 'published') return 'Show not yet published for entries';
    if (!entriesOpen) return 'Registration opens soon - stay tuned!';
    if (!entriesClose) return 'Registration period has ended';
    return `Registration closes in ${Math.max(0, daysUntilClose)} days`;
  }, [show.status, show.entryOpenDate, show.entryCloseDate, daysUntilClose]);

  const disabledButtonLabel = useMemo(() => {
    const now = new Date();
    const entriesOpen = isAfter(now, new Date(show.entryOpenDate));
    if (show.status?.toLowerCase() !== 'published') return 'Not Published';
    if (!entriesOpen) return 'Opens Soon';
    return 'Registration Closed';
  }, [show.status, show.entryOpenDate]);

  return (
    <div className="space-y-6">
      {/* Registration Status Card */}
      <Card className="group relative overflow-hidden border-0 bg-gradient-to-br from-primary/5 via-white to-primary/10 backdrop-blur-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
        <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <div className="absolute left-0 top-0 h-full w-1 bg-primary" />
        <CardHeader className="relative">
          <div className="flex items-center justify-between">
            <div className="space-y-3">
              <CardTitle className="flex items-center gap-3 text-xl font-semibold text-gray-900">
                <div className="p-2 bg-primary rounded-lg text-white shadow-lg">
                  <UserPlus className="w-5 h-5" />
                </div>
                Registration Status
              </CardTitle>
              <CardDescription className="text-base text-gray-600 leading-relaxed">
                {registrationDescription}
              </CardDescription>
            </div>
            {canRegister ? (
              <Button onClick={onRegister} size="lg">
                <UserPlus className="w-4 h-4 mr-2" />
                Register Now
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button
                disabled
                size="lg"
                variant="outline"
                className="bg-gray-50 border-gray-200 text-gray-500"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                {disabledButtonLabel}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="relative pt-0">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                Entries Open
              </div>
              <div className="text-lg font-semibold text-gray-900">
                {new Date(show.entryOpenDate).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                Entries Close
              </div>
              <div className="flex items-center gap-3">
                <div className="text-lg font-semibold text-gray-900">
                  {new Date(show.entryCloseDate).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
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
              <div className="text-xs text-green-600">Save by registering early!</div>
            </div>
            <div className="p-6 bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl border border-orange-100 shadow-sm">
              <div className="text-3xl font-bold text-orange-700 mb-2">
                ${show.dayOfShowFee || show.preEntryFee}
              </div>
              <div className="text-sm font-medium text-orange-800 mb-1">Day of Show</div>
              <div className="text-xs text-orange-600">Subject to availability</div>
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
                  day: 'numeric',
                })}
                {show.startDate !== show.endDate && (
                  <span className="text-gray-600">
                    {' '}
                    -{' '}
                    {new Date(show.endDate).toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </span>
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
              <div className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                Show Type
              </div>
              <div className="text-base font-semibold text-gray-900">{show.organization}</div>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-500 uppercase tracking-wide flex items-center gap-2">
                <Mail className="w-3 h-3" />
                Secretary
              </div>
              <div className="text-base font-semibold text-gray-900">
                {resolvePersonName(show.secretary)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
