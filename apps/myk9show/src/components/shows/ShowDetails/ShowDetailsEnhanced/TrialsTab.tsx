import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar, Clock, Eye, ArrowRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { TrialStatusBadge } from './StatusBadge';
import type { TrialsTabProps } from './types';

export const TrialsTab: React.FC<TrialsTabProps> = ({ trials }) => {
  const navigate = useNavigate();

  if (trials.length === 0) {
    return (
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
    );
  }

  return (
    <div className="grid gap-6">
      {trials.map((trial, index) => (
        <Card
          key={trial.id || index}
          className="group overflow-hidden border-0 bg-gradient-to-br from-white via-gray-50/30 to-slate-50/50 backdrop-blur-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
        >
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
                      <TrialStatusBadge status={trial.status} />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-gray-700">
                        <Calendar className="w-4 h-4 text-teal-600" />
                        <span className="font-medium">
                          {new Date(trial.trialDate).toLocaleDateString('en-US', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-700">
                        <Clock className="w-4 h-4 text-primary" />
                        <span className="font-medium">{trial.plannedStartTime}</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-600">
                        <span className="text-sm">Trial #{trial.trialNumber}</span>
                        <span className="text-gray-400">&bull;</span>
                        <span className="text-sm">
                          {formatDistanceToNow(new Date(trial.trialDate), { addSuffix: true })}
                        </span>
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
      ))}
    </div>
  );
};
