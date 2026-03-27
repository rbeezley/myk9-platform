// checkin-icon-map.ts — Single source of truth for check-in status icons.
import {
  Check,
  Circle,
  AlertTriangle,
  XCircle,
  Star,
  Bell,
  Target,
  CheckCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** Maps @myk9/core icon name strings to Lucide components. */
export const CHECKIN_ICON_MAP: Record<string, LucideIcon> = {
  Circle,
  Check,
  AlertTriangle,
  XCircle,
  Star,
  Bell,
  Target,
  CheckCircle,
};
