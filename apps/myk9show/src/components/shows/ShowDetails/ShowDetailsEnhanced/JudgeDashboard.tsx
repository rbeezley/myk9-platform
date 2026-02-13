import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, Clock, UserCheck } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { JudgeDashboardProps } from './types';

export const JudgeDashboard: React.FC<JudgeDashboardProps> = ({ show, trials }) => {
  const myAssignments = show.assignedJudges || [];
  const upcomingTrials = trials.filter((t) => t.status === 'Upcoming');

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
                <div
                  key={index}
                  className="group p-6 bg-gradient-to-br from-white to-orange-50/30 border border-orange-100 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-1"
                >
                  <div className="flex items-start gap-4">
                    <div className="p-2 bg-gradient-to-br from-orange-400 to-amber-500 rounded-lg text-white shadow-md group-hover:scale-110 transition-transform duration-300">
                      <UserCheck className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-lg text-gray-900 mb-2">{assignment.judgeName}</div>
                      <div className="text-gray-600 mb-4">
                        <span className="font-medium">{assignment.assignedClasses?.length || 0}</span> classes
                        assigned
                      </div>
                      {assignment.assignedClasses && assignment.assignedClasses.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {assignment.assignedClasses.slice(0, 4).map((className, idx) => (
                            <Badge
                              key={idx}
                              className="bg-gradient-to-r from-orange-100 to-amber-100 text-orange-800 border border-orange-200 text-sm font-medium px-3 py-1"
                            >
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
                <div
                  key={index}
                  className="group flex items-center justify-between p-6 bg-gradient-to-br from-white to-teal-50/30 border border-teal-100 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-1"
                >
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
                            day: 'numeric',
                          })}{' '}
                          at {trial.plannedStartTime}
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
