/**
 * Shared icon map for check-in status components.
 *
 * Maps icon name strings from @myk9/core's CheckInStatusConfig to
 * Lucide icon components. Used by CheckInStatusBadge and CheckInStatusMenu.
 */
import {
  Circle,
  Check,
  AlertTriangle,
  XCircle,
  Star,
  Bell,
  Target,
  CheckCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

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
