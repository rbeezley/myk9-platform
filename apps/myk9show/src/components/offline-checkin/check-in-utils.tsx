import { CheckCircle2, XCircle, AlertTriangle, Clock } from 'lucide-react';
import type { CheckInStatus } from '@myk9/core';

export function getStatusColor(status: CheckInStatus) {
  switch (status) {
    case 'checked-in':
      return 'bg-teal-100 text-teal-800 border-teal-200';
    case 'at-gate':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'come-to-gate':
      return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'conflict':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'pulled':
      return 'bg-gray-100 text-gray-800 border-gray-200';
    default:
      return 'bg-gray-100 text-gray-600 border-gray-200';
  }
}

export function getStatusIcon(status: CheckInStatus) {
  switch (status) {
    case 'checked-in':
      return <CheckCircle2 className="h-4 w-4" />;
    case 'pulled':
      return <XCircle className="h-4 w-4" />;
    case 'conflict':
      return <AlertTriangle className="h-4 w-4" />;
    default:
      return <Clock className="h-4 w-4" />;
  }
}
