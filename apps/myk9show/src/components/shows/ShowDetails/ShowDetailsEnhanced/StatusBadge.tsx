import React from 'react';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Clock, AlertCircle } from 'lucide-react';

type StatusKey = 'published' | 'draft' | 'cancelled';

interface StatusConfig {
  className: string;
  dotColor: string;
  icon: React.FC<React.SVGProps<SVGSVGElement> & { className?: string }>;
}

const STATUS_CONFIG: Record<StatusKey, StatusConfig> = {
  published: {
    className: 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg',
    dotColor: 'bg-white',
    icon: CheckCircle,
  },
  draft: {
    className: 'bg-gradient-to-r from-gray-400 to-slate-500 text-white shadow-lg',
    dotColor: 'bg-white',
    icon: Clock,
  },
  cancelled: {
    className: 'bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-lg',
    dotColor: 'bg-white',
    icon: AlertCircle,
  },
};

interface ShowStatusBadgeProps {
  status: string;
}

export const ShowStatusBadge: React.FC<ShowStatusBadgeProps> = ({ status }) => {
  const key = (status?.toLowerCase() ?? 'published') as StatusKey;
  const config = STATUS_CONFIG[key] ?? STATUS_CONFIG.published;
  const Icon = config.icon;

  return (
    <Badge
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full font-medium text-sm transition-all duration-300 hover:scale-105 ${config.className}`}
    >
      <Icon className="w-3 h-3" />
      {status || 'Published'}
    </Badge>
  );
};

interface TrialStatusBadgeProps {
  status: string;
}

type TrialStatusKey = 'upcoming' | 'completed' | 'cancelled';

interface TrialStatusConfig {
  className: string;
  icon: React.FC<React.SVGProps<SVGSVGElement> & { className?: string }>;
}

const TRIAL_STATUS_CONFIG: Record<TrialStatusKey, TrialStatusConfig> = {
  upcoming: {
    className: 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white',
    icon: Clock,
  },
  completed: {
    className: 'bg-gradient-to-r from-green-500 to-emerald-600 text-white',
    icon: CheckCircle,
  },
  cancelled: {
    className: 'bg-gradient-to-r from-red-500 to-rose-600 text-white',
    icon: AlertCircle,
  },
};

export const TrialStatusBadge: React.FC<TrialStatusBadgeProps> = ({ status }) => {
  const key = (status?.toLowerCase() ?? 'upcoming') as TrialStatusKey;
  const config = TRIAL_STATUS_CONFIG[key] ?? TRIAL_STATUS_CONFIG.upcoming;
  const Icon = config.icon;

  return (
    <Badge
      className={`flex items-center gap-1.5 px-3 py-1 rounded-full font-medium text-sm ${config.className}`}
    >
      <Icon className="w-3 h-3" />
      {status}
    </Badge>
  );
};
