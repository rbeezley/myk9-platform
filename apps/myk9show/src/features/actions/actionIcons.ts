import {
  Activity,
  Building2,
  Camera,
  CalendarPlus,
  ClipboardList,
  Download,
  FileText,
  Layers,
  ListPlus,
  PawPrint,
  Pencil,
  Send,
  ShieldCheck,
  ShieldOff,
  Ticket,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { ActionIconName } from './actionRegistry';

/**
 * The one icon for each action, shared by the header Actions menu and the command palette.
 * A `Record` over the full union, so a new icon name fails to compile until it has an icon.
 */
export const ACTION_ICONS: Readonly<Record<ActionIconName, LucideIcon>> = {
  edit: Pencil,
  'add-entry': Ticket,
  'add-entry-other': Users,
  'add-trial': Layers,
  'add-classes': ListPlus,
  'entry-forms': ClipboardList,
  premium: FileText,
  export: Download,
  'add-show': CalendarPlus,
  'add-dog': PawPrint,
  'add-person': UserPlus,
  'add-club': Building2,
  photo: Camera,
  status: Activity,
  send: Send,
  authorize: ShieldCheck,
  revoke: ShieldOff,
};
